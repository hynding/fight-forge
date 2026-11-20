import { useCallback, useRef, useState } from 'react'
import { fighterStateSchema } from '../../content/schemas'
import { addModelAsset, comboChain, effectiveMoves, fighterHalfExtents, fitModel, gltfModelFor, setComboChain } from '../../forge/fighter'
import { setIn } from '../../forge/paths'
import { nodeValue, overrideNode, type TreeNode } from '../../forge/tree'
import { editPack, type PackJson, type WorkspacePack } from '../../forge/workspace'
import { ONE_SHOT_STATES, resolveClip, type ClipMap } from '../../sim/animation'
import type { FighterStateName } from '../../sim/fighter'
import { ModelPreview } from './ModelPreview'
import { sectionHeading, ui } from './ui'
import { usePreviewModel } from './useModelUrl'

type Json = Record<string, unknown>

const STATES = fighterStateSchema.options as FighterStateName[]

interface Props {
  pack: WorkspacePack
  node: TreeNode
  /** Save a new version of the pack (JSON and files). */
  save: (wp: WorkspacePack) => void
  onError: (message: string) => void
}

/**
 * Fighter tools for the player and enemy types: a 3D preview of the model in
 * any state, importing a .glb into the pack, fitting it to the body, mapping
 * its animation clips to states, and (for the player) the light-attack combo.
 */
export const FighterTools = ({ pack, node, save, onError }: Props) => {
  const json = pack.json
  const fighter = (nodeValue(json, node) ?? {}) as Json
  const model = fighter.model as Json | undefined
  const preview = usePreviewModel(pack, model)
  const [state, setState] = useState<FighterStateName>('idle')
  const [clipNames, setClipNames] = useState<string[]>([])
  const bounds = useRef<[number, number] | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const onClips = useCallback((names: string[]) => setClipNames(names), [])
  const onBounds = useCallback((min: number, max: number) => {
    bounds.current = [min, max]
  }, [])

  const isPlayer = node.key === 'settings/player'
  const scale = isPlayer ? 1 : Number(fighter.scale) || 1
  const half = fighterHalfExtents(json, fighter)

  // Tool edits change the fighter in this pack (copying the default's first).
  const setFighter = (next: Json, base: WorkspacePack = pack) => {
    const own = node.status === 'inherited' ? overrideNode(base.json, node) : base.json
    save(editPack(base, setIn(own, node.path, next) as PackJson))
  }
  const setModel = (m: Json, base?: WorkspacePack) => setFighter({ ...fighter, model: m }, base)

  const onImport = async (file: File | undefined) => {
    if (!file) return
    const r = addModelAsset(pack, file.name, new Uint8Array(await file.arrayBuffer()))
    if (fileInput.current) fileInput.current.value = ''
    if (!r.ok) return onError(r.message)
    bounds.current = null
    setModel(gltfModelFor(r.assetId), r.pack)
  }

  const clips = (model?.clips ?? {}) as ClipMap
  const available = new Set(clipNames)
  const resolved = model?.kind === 'gltf' ? resolveClip(state, clips, available) : null
  const clip = resolved && { ...resolved, loop: !ONE_SHOT_STATES.has(state) }

  return (
    <div data-testid="fighter-tools">
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
        <label>
          State{' '}
          <select aria-label="Preview state" style={ui.input} value={state} onChange={(e) => setState(e.target.value as FighterStateName)}>
            {STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button style={ui.button} onClick={() => fileInput.current?.click()}>
          Import .glb model…
        </button>
        <input ref={fileInput} data-testid="model-file" type="file" accept=".glb" style={{ display: 'none' }} onChange={(e) => onImport(e.target.files?.[0])} />
        {model?.kind === 'gltf' && (
          <button
            style={ui.button}
            title="Scale the model to the body's height and stand it on the floor"
            onClick={() => {
              if (!bounds.current) return onError('The model is still loading.')
              const fit = fitModel(bounds.current[0], bounds.current[1], half[1])
              setModel({ ...model, ...fit })
            }}
          >
            Fit to body
          </button>
        )}
        {model?.kind === 'gltf' && (
          <button style={ui.button} onClick={() => setModel({ ...model, rotationY: Number(((Number(model.rotationY) + Math.PI) % (2 * Math.PI)).toFixed(4)) })}>
            Turn around
          </button>
        )}
        {model?.kind === 'gltf' && (
          <button style={ui.button} onClick={() => setModel({ kind: 'procedural', offset: [0, -0.35, 0] })}>
            Use box figure
          </button>
        )}
      </div>
      <ModelPreview
        model={preview}
        color={String(fighter.color ?? '#888888')}
        scale={scale}
        clip={clip}
        time={null}
        floorY={-half[1] * scale}
        boxes={[{ center: [0, 0, 0], half: [half[0] * scale, half[1] * scale, half[2] * scale], color: '#40d070', solid: false }]}
        onClips={onClips}
        onBounds={onBounds}
      />

      {model?.kind === 'gltf' && (
        <>
          <div style={sectionHeading}>ANIMATIONS</div>
          {clipNames.length === 0 && <div style={{ color: '#889' }}>No animation clips found in this model (yet).</div>}
          {clipNames.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '4px 12px' }}>
              {STATES.map((s) => {
                const ref = clips[s]
                const name = ref === undefined ? '' : typeof ref === 'string' ? ref : ref.name
                return (
                  <label key={s} style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                    <span style={{ color: '#aab' }}>{s}</span>
                    <select
                      aria-label={`Clip for ${s}`}
                      style={{ ...ui.input, width: '120px' }}
                      value={name}
                      onChange={(e) => {
                        const next = { ...clips } as Json
                        if (e.target.value) next[s] = typeof ref === 'object' ? { ...ref, name: e.target.value } : e.target.value
                        else delete next[s]
                        setModel({ ...model, clips: next })
                        setState(s)
                      }}
                    >
                      <option value="">(fallback)</option>
                      {name && !available.has(name) && <option value={name}>{name} (missing)</option>}
                      {clipNames.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                )
              })}
            </div>
          )}
        </>
      )}

      {isPlayer && <ComboEditor json={json} onChange={(next) => save(editPack(pack, next))} />}
    </div>
  )
}

/** The light-attack combo: an ordered list of moves, each chaining into the next. */
const ComboEditor = ({ json, onChange }: { json: PackJson; onChange: (json: PackJson) => void }) => {
  const chain = comboChain(json)
  const moves = Object.keys(effectiveMoves(json))
  const set = (next: string[]) => onChange(setComboChain(json, next))
  const swap = (i: number, j: number) => {
    const next = [...chain]
    ;[next[i], next[j]] = [next[j], next[i]]
    set(next)
  }
  return (
    <div data-testid="combo-editor">
      <div style={sectionHeading}>LIGHT ATTACK COMBO</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        {chain.map((id, i) => (
          <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
            {i > 0 && <span style={{ color: '#667' }}>→</span>}
            <span style={{ border: '1px solid #3a4258', borderRadius: '3px', padding: '2px 4px' }}>
              {i > 0 && (
                <button style={{ ...ui.button, padding: '0 4px' }} title="Earlier" onClick={() => swap(i, i - 1)}>
                  ‹
                </button>
              )}{' '}
              {id}{' '}
              {i < chain.length - 1 && (
                <button style={{ ...ui.button, padding: '0 4px' }} title="Later" onClick={() => swap(i, i + 1)}>
                  ›
                </button>
              )}
              {chain.length > 1 && (
                <button style={{ ...ui.button, padding: '0 4px' }} title="Take out of the combo" onClick={() => set(chain.filter((_, j) => j !== i))}>
                  ×
                </button>
              )}
            </span>
          </span>
        ))}
        <select aria-label="Add to combo" style={ui.input} value="" onChange={(e) => e.target.value && set([...chain, e.target.value])}>
          <option value="">+ add move…</option>
          {moves
            .filter((m) => !chain.includes(m))
            .map((m) => (
              <option key={m}>{m}</option>
            ))}
        </select>
      </div>
      <div style={{ color: '#667', marginTop: '3px' }}>Each press of attack during a move's cancel window goes to the next move.</div>
    </div>
  )
}
