import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useGameStore } from '../../store/gameStore'
import { describeErrors, installBundle } from '../../content/library'
import type { ContentError } from '../../content/registry'
import { blankLevel } from '../../forge/level'
import { planResume, spawnXOf } from '../../forge/playtest'
import { sceneProbe } from '../../sim/probe'
import { pathString, setIn } from '../../forge/paths'
import { forgeFocus as last, workspaceStore } from '../../forge/storage'
import { GROUPS, addNode, buildTree, nodeValue, overrideNode, removeNode, type TreeNode } from '../../forge/tree'
import {
  duplicatePack,
  editPack,
  exportBundle,
  importBundle,
  newPack,
  validatePack,
  type PackJson,
  type WorkspacePack,
} from '../../forge/workspace'
import { downloadBytes } from '../../utils/download'
import { Field } from './SchemaForm'
import { BindingsTools } from './BindingsTools'
import { EnemyTools } from './EnemyTools'
import { LevelTools } from './LevelTools'
import { FighterTools } from './FighterTools'
import { MoveTools } from './MoveTools'
import { SoundTools } from './SoundTools'
import { PackInfoTools } from './PackInfoTools'
import { PublishTools } from './PublishTools'
import { apiEnabled } from '../../net/api'
import { sectionHeading, ui } from './ui'

const panel: CSSProperties = {
  background: 'rgba(8, 10, 18, 0.7)',
  border: '1px solid #2c3346',
  borderRadius: '6px',
  padding: '10px',
  overflowY: 'auto',
  minHeight: 0,
}

const heading: CSSProperties = { fontSize: '11px', letterSpacing: '2px', color: '#8890a8', margin: '10px 0 4px' }

const STATUS_STYLE: Record<TreeNode['status'], CSSProperties> = {
  own: { color: '#9fe39f' },
  override: { color: '#ffd27a' },
  inherited: { color: '#6f7690' },
}
const STATUS_TEXT: Record<TreeNode['status'], string> = {
  own: 'New in this pack',
  override: 'Changed from the default',
  inherited: 'From the default pack (read only)',
}

/** The error paths that belong to a node: its own path, and `levels.<id>` for a level's cross-reference errors. */
const nodePrefixes = (json: PackJson, node: TreeNode): string[] => {
  if (node.status === 'inherited') return []
  if (node.group === 'pack') return ['name', 'version', 'meta', 'id', 'schemaVersion']
  const own = pathString(node.path)
  if (node.group !== 'levels') return [own]
  const id = (json.levels as { id?: unknown }[] | undefined)?.[node.path[1] as number]?.id
  return [own, `levels.${String(id)}`]
}


const errorsFor = (errors: ContentError[], prefixes: string[]) =>
  errors.filter((e) => prefixes.some((p) => e.path === p || e.path.startsWith(`${p}.`) || e.path.startsWith(`${p}[`)))

/**
 * Forge: the in-game pack editor. Packs live in the browser's workspace
 * (IndexedDB); each is edited as JSON through forms generated from the
 * content schemas, checked on every change against the default pack, and can
 * be exported as a bundle or played right away.
 */
export const Forge = () => {
  const setGameScreen = useGameStore((s) => s.setGameScreen)
  const editing = useGameStore((s) => s.editing)
  const playtest = useGameStore((s) => s.playtest)
  const [resuming, setResuming] = useState(false)
  const [packs, setPacks] = useState<WorkspacePack[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(last.packId)
  const [nodeKey, setNodeKey] = useState(last.nodeKey)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const store = workspaceStore()

  useEffect(() => {
    store.list().then((list) => {
      setPacks(list)
      setSelectedId((id) => (id && list.some((p) => p.id === id) ? id : (list[0]?.id ?? null)))
    })
  }, [store])

  useEffect(() => {
    last.packId = selectedId
    last.nodeKey = nodeKey
  }, [selectedId, nodeKey])

  const pack = packs?.find((p) => p.id === selectedId) ?? null
  const ids = packs?.map((p) => p.id) ?? []
  const errors = useMemo(() => (pack ? validatePack(pack.json) : []), [pack])
  const tree = useMemo(() => (pack ? buildTree(pack.json) : []), [pack])
  const node = tree.find((n) => n.key === nodeKey) ?? tree[0]

  const put = (wp: WorkspacePack, saveNow = true) => {
    setPacks((list) => [wp, ...(list ?? []).filter((p) => p.id !== wp.id)])
    setSelectedId(wp.id)
    if (saveNow) void store.put(wp)
    else {
      // Typing in a form saves once it settles.
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void store.put(wp), 300)
    }
  }
  const select = (id: string) => {
    setSelectedId(id)
    setNodeKey('pack')
    setConfirmDelete(false)
    setMessage(null)
  }
  const edit = (json: PackJson, saveNow = true) => pack && put(editPack(pack, json), saveNow)

  const onNew = () => {
    const wp = newPack('My pack', ids)
    put(wp)
    select(wp.id)
  }
  const onImport = async (file: File | undefined) => {
    if (!file) return
    const r = await importBundle(new Uint8Array(await file.arrayBuffer()), ids)
    if (fileInput.current) fileInput.current.value = ''
    if (!r.ok) return setMessage({ text: describeErrors(r.errors), error: true })
    put(r.value)
    select(r.value.id)
    setMessage({ text: `Imported "${String(r.value.json.name)}".` })
  }
  const onExport = async () => {
    if (!pack) return
    downloadBytes(await exportBundle(pack), `${pack.id}.zip`)
  }
  const onPlay = async () => {
    if (!pack) return
    const r = await installBundle(await exportBundle(pack))
    if (!r.ok) return setMessage({ text: describeErrors(r.errors), error: true })
    setGameScreen('menu')
  }
  // Back to the paused playtest with the edits: tuning applies in place; a changed level restarts where the player was.
  const onBackToFight = async () => {
    const target = packs?.find((p) => p.id === playtest?.packId) ?? pack
    if (!target) return useGameStore.getState().resumePlaytest()
    clearTimeout(saveTimer.current)
    void store.put(target)
    setResuming(true)
    const r = await installBundle(await exportBundle(target))
    setResuming(false)
    if (!r.ok) return setMessage({ text: `${String(target.json.name)} can't be played yet:\n${describeErrors(r.errors)}`, error: true })
    const plan = planResume(playtest ?? { packId: target.id }, target.json, sceneProbe.playerX(), spawnXOf(target.json))
    if (plan.kind === 'resume') useGameStore.getState().resumePlaytest()
    else useGameStore.getState().startSandbox(plan.level, plan.origin)
  }
  const onDelete = async () => {
    if (!pack) return
    if (!confirmDelete) return setConfirmDelete(true)
    await store.delete(pack.id)
    const rest = (packs ?? []).filter((p) => p.id !== pack.id)
    setPacks(rest)
    select(rest[0]?.id ?? '')
  }

  const nodeErrors = pack && node ? errorsFor(errors, nodePrefixes(pack.json, node)) : []
  const errorMap = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const e of errors) m.set(e.path, [...(m.get(e.path) ?? []), e.message])
    return m
  }, [errors])

  return (
    <div
      data-testid="forge"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'linear-gradient(135deg, #12131f 0%, #151c33 100%)',
        color: '#e8e8e8',
        fontFamily: 'monospace',
        fontSize: '12px',
        // Above the paused game and its menus when open mid-playtest.
        zIndex: 1500,
        display: 'grid',
        gridTemplateColumns: '250px 1fr 320px',
        gridTemplateRows: 'auto 1fr',
        gap: '10px',
        padding: '10px',
        boxSizing: 'border-box',
      }}
    >
      {/* Top bar */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '12px' }}>
        {editing ? (
          <>
            <button
              data-testid="back-to-fight"
              style={{ ...ui.button, borderColor: '#ffd27a', color: '#ffd27a' }}
              disabled={resuming}
              title="Carry on with the paused fight, with your changes"
              onClick={onBackToFight}
            >
              ▶ Back to the fight
            </button>
            <button style={ui.button} title="Leave the fight and stay in the Forge" onClick={() => useGameStore.getState().quitRun()}>
              ■ End playtest
            </button>
          </>
        ) : (
          <button style={ui.button} onClick={() => setGameScreen('menu')}>
            ← Menu
          </button>
        )}
        <div style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '6px' }}>FORGE</div>
        {pack && (
          <>
            <div style={{ color: '#aab' }}>
              {String(pack.json.name)} <span style={{ color: '#667' }}>({pack.id})</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
              <button style={ui.button} onClick={onExport}>
                Export bundle
              </button>
              <button
                style={{ ...ui.button, borderColor: '#ff4444', color: errors.length ? '#777' : '#ff8080' }}
                onClick={onPlay}
                disabled={errors.length > 0}
                title={errors.length ? 'Fix the problems first' : 'Load this pack and go to the menu'}
              >
                ▶ Play with this pack
              </button>
            </div>
          </>
        )}
      </div>

      {/* Packs and content tree */}
      <div style={panel}>
        <div style={{ ...heading, marginTop: 0 }}>YOUR PACKS</div>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
          <button style={ui.button} onClick={onNew}>
            + New
          </button>
          <button style={ui.button} onClick={() => fileInput.current?.click()}>
            Import…
          </button>
          <input ref={fileInput} type="file" accept=".zip" style={{ display: 'none' }} onChange={(e) => onImport(e.target.files?.[0])} />
        </div>
        {packs?.length === 0 && <div style={{ color: '#889' }}>No packs yet. Make a new one or import a bundle.</div>}
        {packs?.map((p) => (
          <div
            key={p.id}
            onClick={() => select(p.id)}
            style={{
              padding: '3px 6px',
              cursor: 'pointer',
              borderRadius: '3px',
              background: p.id === selectedId ? '#2a3350' : 'transparent',
            }}
          >
            {String(p.json.name)}
          </div>
        ))}
        {pack && (
          <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
            <button style={ui.button} onClick={() => put(duplicatePack(pack, ids))}>
              Duplicate
            </button>
            <button style={{ ...ui.button, color: confirmDelete ? '#ff8080' : undefined }} onClick={onDelete}>
              {confirmDelete ? 'Really delete?' : 'Delete'}
            </button>
          </div>
        )}

        {pack &&
          GROUPS.map((g) => (
            <div key={g.id}>
              <div style={heading}>{g.label.toUpperCase()}</div>
              {tree
                .filter((n) => n.group === g.id)
                .map((n) => {
                  const bad = errorsFor(errors, nodePrefixes(pack.json, n)).length > 0
                  return (
                    <div
                      key={n.key}
                      data-testid={`node-${n.key}`}
                      onClick={() => setNodeKey(n.key)}
                      style={{
                        ...STATUS_STYLE[n.status],
                        padding: '2px 6px',
                        cursor: 'pointer',
                        borderRadius: '3px',
                        background: n.key === node?.key ? '#2a3350' : 'transparent',
                      }}
                    >
                      {bad && <span style={{ color: '#ff6060' }}>● </span>}
                      {n.label}
                      {n.status === 'override' && ' *'}
                    </div>
                  )
                })}
              {g.id !== 'pack' && g.id !== 'settings' && (
                <button
                  style={{ ...ui.button, marginTop: '2px', fontSize: '11px' }}
                  onClick={() => {
                    // Start from the selected item of this group, or its first one.
                    const from = node?.group === g.id ? node : tree.find((n) => n.group === g.id)
                    const r = addNode(pack.json, g.id as never, from && nodeValue(pack.json, from))
                    edit(r.json)
                    setNodeKey(r.key)
                  }}
                >
                  + new {g.item}
                </button>
              )}
              {g.id === 'levels' && (
                <button
                  style={{ ...ui.button, marginTop: '2px', marginLeft: '4px', fontSize: '11px' }}
                  title="An empty level with just a goal, to build from scratch"
                  onClick={() => {
                    const r = addNode(pack.json, 'levels', blankLevel())
                    edit(r.json)
                    setNodeKey(r.key)
                  }}
                >
                  + blank level
                </button>
              )}
            </div>
          ))}
      </div>

      {/* Inspector */}
      <div style={panel} data-testid="inspector">
        {!pack || !node ? (
          <div style={{ color: '#889' }}>{packs === null ? 'Loading…' : 'Pick or make a pack to edit.'}</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{node.label}</div>
              <div style={STATUS_STYLE[node.status]}>{STATUS_TEXT[node.status]}</div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                {node.status === 'inherited' && (
                  <button style={{ ...ui.button, borderColor: '#ffd27a' }} onClick={() => edit(overrideNode(pack.json, node))}>
                    Change in this pack
                  </button>
                )}
                {node.status === 'override' && (
                  <button style={ui.button} onClick={() => edit(removeNode(pack.json, node))}>
                    Revert to default
                  </button>
                )}
                {node.status === 'own' && node.group !== 'pack' && (
                  <button
                    style={ui.button}
                    onClick={() => {
                      edit(removeNode(pack.json, node))
                      setNodeKey('pack')
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            {nodeErrors.length > 0 && (
              <div style={{ margin: '8px 0', padding: '6px', border: '1px solid #803030', borderRadius: '4px' }}>
                {nodeErrors.map((e, i) => (
                  <div key={i} style={ui.error}>
                    {e.path}: {e.message}
                  </div>
                ))}
              </div>
            )}
            {node.group === 'enemyTypes' && (
              <EnemyTools
                key={`enemy:${node.key}`}
                pack={pack}
                node={node}
                save={(wp) => put(wp, false)}
                onError={(text) => setMessage({ text, error: true })}
                invalid={errors.length > 0}
              />
            )}
            {(node.key === 'settings/player' || node.group === 'enemyTypes') && (
              <div style={{ marginTop: '10px' }}>
                <FighterTools key={node.key} pack={pack} node={node} save={(wp) => put(wp, false)} onError={(text) => setMessage({ text, error: true })} />
              </div>
            )}
            {(node.group === 'sounds' || node.group === 'music') && (
              <SoundTools key={node.key} pack={pack} node={node} save={(wp) => put(wp, false)} onError={(text) => setMessage({ text, error: true })} />
            )}
            {node.group === 'moves' && (
              <div style={{ marginTop: '10px' }}>
                <MoveTools key={node.key} pack={pack} node={node} save={(wp) => put(wp, false)} />
              </div>
            )}
            {node.group === 'pack' && <PackInfoTools pack={pack} save={(wp) => put(wp)} onError={(text) => setMessage({ text, error: true })} />}
            {node.group === 'pack' && apiEnabled() && <PublishTools key={pack.id} pack={pack} save={(wp) => put(wp)} invalid={errors.length > 0} />}
            {node.key === 'settings/input' && <BindingsTools key={node.key} pack={pack} node={node} save={(wp) => put(wp)} />}
            {node.group === 'levels' && (
              <div style={{ marginTop: '10px' }}>
                <LevelTools
                  key={`level:${node.key}`}
                  pack={pack}
                  node={node}
                  save={(wp) => put(wp, false)}
                  onError={(text) => setMessage({ text, error: true })}
                  invalid={errors.length > 0}
                  errors={errorMap}
                />
              </div>
            )}
            {node.group !== 'pack' && <div style={sectionHeading}>ALL FIELDS</div>}
            <div style={{ marginTop: '10px' }}>
              <Field
                schema={node.schema}
                value={nodeValue(pack.json, node)}
                path={node.path}
                errors={errorMap}
                readOnly={node.status === 'inherited'}
                onChange={(next) =>
                  edit(node.group === 'pack' ? { ...pack.json, ...(next as object) } : (setIn(pack.json, node.path, next) as PackJson), false)
                }
              />
            </div>
          </>
        )}
      </div>

      {/* Preview and checks */}
      <div style={panel}>
        <div style={{ ...heading, marginTop: 0 }}>CHECK</div>
        {message && (
          <pre style={{ ...(message.error ? ui.error : { color: '#9fe39f' }), whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{message.text}</pre>
        )}
        {pack &&
          (errors.length === 0 ? (
            <div style={{ color: '#9fe39f' }} data-testid="pack-ok">
              ✓ The pack loads on top of the default pack.
            </div>
          ) : (
            <div data-testid="pack-errors">
              <div style={ui.error}>
                {errors.length} problem{errors.length > 1 ? 's' : ''}:
              </div>
              {errors.map((e, i) => (
                <div key={i} style={{ ...ui.error, margin: '2px 0' }}>
                  {e.path}: {e.message}
                </div>
              ))}
            </div>
          ))}
        {pack && node && (
          <>
            <div style={heading}>PREVIEW (JSON)</div>
            <pre style={{ margin: 0, color: '#aab', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(nodeValue(pack.json, node), null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  )
}
