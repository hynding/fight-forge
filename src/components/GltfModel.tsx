import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF } from '@react-three/drei'
import { AnimationAction, Color, Group, LoopOnce, LoopRepeat, Material, Mesh, MeshStandardMaterial } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { ModelRef } from '../config/defaults'
import { resolveFighterClip } from '../sim/animation'
import { getConfig } from '../content/active'
import type { FighterRuntime } from '../sim/fighter'
import { registerModel, unregisterModel, type Detail } from '../sim/budget'
import { useModelBudget } from '../sim/simContext'

type GltfRef = Extract<ModelRef, { kind: 'gltf' }>

const CROSSFADE_SECONDS = 0.15

interface GltfModelProps {
  model: GltfRef
  color: string
  emissive: string
  emissiveIntensity: number
  /** The fighter's own scale (multiplies the model's scale and offset). */
  scale: number
  runtime: FighterRuntime
  paused: () => boolean
  /** The fighter's name, for the scene's model detail budget. */
  name?: string
}

const isStandard = (m: Material): m is MeshStandardMaterial =>
  (m as MeshStandardMaterial).isMeshStandardMaterial === true

/**
 * An imported, animated glTF character. Each instance clones the cached scene
 * (with its skeleton) and its materials, then plays the clip that the fighter
 * state machine selects, crossfading between clips.
 */
export const GltfModel = ({
  model,
  color,
  emissive,
  emissiveIntensity,
  scale,
  runtime,
  paused,
  name,
}: GltfModelProps) => {
  const { scene, animations } = useGLTF(model.url)
  const groupRef = useRef<Group>(null)

  // Per-instance copy: skinned meshes need their own skeleton, and materials
  // are cloned so tint and glow don't leak between fighters.
  const { root, materials, tinted } = useMemo(() => {
    const root = cloneSkinned(scene) as Group
    const materials: MeshStandardMaterial[] = []
    const tinted: MeshStandardMaterial[] = []
    root.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      const clone = (m: Material) => {
        const c = m.clone()
        if (isStandard(c)) {
          materials.push(c)
          if (model.tintMaterials.includes(m.name)) tinted.push(c)
        }
        return c
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material)
    })
    return { root, materials, tinted }
  }, [scene, model.tintMaterials])

  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  useEffect(() => {
    const c = new Color(color)
    tinted.forEach((m) => m.color.copy(c))
  }, [tinted, color])

  useEffect(() => {
    const e = new Color(emissive)
    materials.forEach((m) => {
      m.emissive.copy(e)
      m.emissiveIntensity = emissiveIntensity
    })
  }, [materials, emissive, emissiveIntensity])

  // A crowd: fighters far from the player drop their shadows and animate at half rate.
  const budget = useModelBudget()
  const budgetId = useRef(0)
  useEffect(() => {
    if (!budget || !name) return
    const id = registerModel(budget, name)
    budgetId.current = id
    return () => {
      unregisterModel(budget, id)
      budgetId.current = 0
    }
  }, [budget, name])
  const detail = useRef<Detail>('full')
  const oddFrame = useRef(false)

  const { actions, mixer } = useAnimations(animations, groupRef)
  const available = useMemo(() => new Set(animations.map((a) => a.name)), [animations])
  const current = useRef<{ state: string; action: AnimationAction | null }>({ state: '', action: null })

  // drei's useAnimations advances the mixer by the frame delta; freeze it
  // while paused or game over so poses hold like the rest of the game.
  useFrame(() => {
    const want = (budget && budget.detail.get(budgetId.current)) || 'full'
    if (want !== detail.current) {
      detail.current = want
      root.traverse((obj) => {
        if ((obj as Mesh).isMesh) obj.castShadow = want === 'full'
      })
    }
    // Half rate: skip a frame, then advance two frames' worth (drei updates the mixer next frame).
    oddFrame.current = !oddFrame.current
    mixer.timeScale = paused() ? 0 : want === 'full' ? 1 : oddFrame.current ? 0 : 2

    // Each move instance restarts its clip, so a combo replays the punch per hit.
    const move = runtime.state === 'attack' ? runtime.move.move : null
    const key = move ? `attack:${runtime.move.instance}` : runtime.state
    if (key === current.current.state) return
    current.current.state = key
    const clip = resolveFighterClip(
      runtime.state,
      move ? getConfig().moves[move]?.clip : undefined,
      model.clips,
      available
    )
    const next = clip ? (actions[clip.name] ?? null) : null
    const prev = current.current.action
    if (!next || !clip) return
    // Already looping this clip (e.g. a state that fell back to idle): keep going.
    if (next === prev && clip.loop) return
    next.reset()
    next.setEffectiveTimeScale(clip.speed)
    next.setLoop(clip.loop ? LoopRepeat : LoopOnce, Infinity)
    next.clampWhenFinished = !clip.loop
    next.setEffectiveWeight(1)
    if (prev && prev !== next) next.crossFadeFrom(prev, CROSSFADE_SECONDS, false)
    next.play()
    current.current.action = next
  })

  const [ox, oy, oz] = model.offset
  return (
    <group
      ref={groupRef}
      position={[ox * scale, oy * scale, oz * scale]}
      rotation={[0, model.rotationY, 0]}
      scale={model.scale * scale}
    >
      <primitive object={root} />
    </group>
  )
}
