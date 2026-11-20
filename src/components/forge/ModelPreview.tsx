import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useAnimations, useGLTF } from '@react-three/drei'
import { Box3, Group, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial, Color } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { HumanoidModel } from '../HumanoidModel'

/** A model as the preview draws it: a loadable URL, or the box humanoid. */
export type PreviewModel =
  | { kind: 'procedural'; offset: [number, number, number] }
  | {
      kind: 'gltf'
      url: string
      scale: number
      offset: [number, number, number]
      rotationY: number
      tintMaterials: string[]
    }

export interface PreviewClip {
  name: string
  speed: number
  loop: boolean
}

export interface PreviewBox {
  center: [number, number, number]
  half: [number, number, number]
  color: string
  solid: boolean
}

interface Props {
  model: PreviewModel
  color: string
  /** The fighter's own scale. */
  scale: number
  clip: PreviewClip | null
  /** Seconds into the clip to pose at; null plays it in real time. */
  time: number | null
  /** Boxes in fighter space (the body's centre is the origin; +X is forward). */
  boxes: PreviewBox[]
  /** Where the floor is, in fighter space. */
  floorY: number
  onClips?: (names: string[]) => void
  onBounds?: (minY: number, maxY: number) => void
}

// Faces +X, as a fighter facing right does in the game.
const FACE_RIGHT = -Math.PI / 2

const Gltf = ({ model, color, scale, clip, time, onClips, onBounds }: Omit<Props, 'boxes' | 'floorY'> & { model: Extract<PreviewModel, { kind: 'gltf' }> }) => {
  const { scene, animations } = useGLTF(model.url)
  const group = useRef<Group>(null)
  const root = useMemo(() => {
    const r = cloneSkinned(scene) as Group
    r.traverse((o) => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      const tint = (m: MeshStandardMaterial) => {
        const c = m.clone()
        if (model.tintMaterials.includes(m.name) && c.color) c.color = new Color(color)
        return c
      }
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => tint(m as MeshStandardMaterial))
        : tint(mesh.material as MeshStandardMaterial)
    })
    return r
  }, [scene, model.tintMaterials, color])
  const { actions, mixer } = useAnimations(animations, group)

  useEffect(() => onClips?.(animations.map((a) => a.name)), [animations, onClips])
  useEffect(() => {
    // Bounds in the model's own units, in its bind pose.
    const box = new Box3().setFromObject(scene)
    onBounds?.(box.min.y, box.max.y)
  }, [scene, onBounds])

  useEffect(() => {
    Object.values(actions).forEach((a) => a?.stop())
    if (!clip) return
    const a = actions[clip.name]
    if (!a) return
    a.reset()
    a.setLoop(clip.loop ? LoopRepeat : LoopOnce, Infinity)
    a.clampWhenFinished = true
    a.setEffectiveTimeScale(clip.speed)
    a.play()
  }, [actions, clip])

  useFrame(() => {
    if (time === null) return
    // Scrubbing: pose the clip at the given time instead of playing it.
    mixer.timeScale = 0
    const a = clip && actions[clip.name]
    if (a) {
      const d = a.getClip().duration
      a.time = Math.min(time * clip.speed, d - 1e-4)
      mixer.update(0)
    }
  })
  useEffect(() => {
    if (time === null) mixer.timeScale = 1
  }, [time, mixer])

  const [ox, oy, oz] = model.offset
  return (
    <group ref={group} position={[ox * scale, oy * scale, oz * scale]} rotation={[0, model.rotationY, 0]} scale={model.scale * scale}>
      <primitive object={root} />
    </group>
  )
}

class Fallback extends Component<{ children: ReactNode; fallback: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false })
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const Humanoid = ({ color, scale, offset }: { color: string; scale: number; offset: [number, number, number] }) => {
  const t = useRef(0)
  const moving = useRef(false)
  return (
    <group position={[offset[0] * scale, offset[1] * scale, offset[2] * scale]}>
      <HumanoidModel color={color} scale={scale} animationTimeRef={t} isMovingRef={moving} />
    </group>
  )
}

/** A side view of one fighter, with its hurtbox and any hitbox drawn as boxes. */
export const ModelPreview = (props: Props) => {
  const { model, color, scale, boxes, floorY } = props
  const humanoid = <Humanoid color={color} scale={scale} offset={model.kind === 'procedural' ? model.offset : [0, -0.35, 0]} />
  return (
    <div data-testid="model-preview" style={{ height: '280px', background: '#0b0e18', borderRadius: '4px', overflow: 'hidden' }}>
      <Canvas camera={{ position: [0.6, 0.4, 4.2], fov: 40 }} shadows={false}>
        <color attach="background" args={['#0b0e18']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} />
        <gridHelper args={[8, 16, '#2c3346', '#1c2233']} position={[0, floorY, 0]} />
        <group rotation={[0, FACE_RIGHT, 0]}>
          {model.kind === 'gltf' ? (
            <Fallback fallback={humanoid} resetKey={model.url}>
              <Suspense fallback={humanoid}>
                <Gltf model={model} color={color} scale={scale} clip={props.clip} time={props.time} onClips={props.onClips} onBounds={props.onBounds} />
              </Suspense>
            </Fallback>
          ) : (
            humanoid
          )}
        </group>
        {boxes.map((b, i) => (
          <mesh key={i} position={b.center}>
            <boxGeometry args={[b.half[0] * 2, b.half[1] * 2, b.half[2] * 2]} />
            <meshBasicMaterial color={b.color} wireframe={!b.solid} transparent opacity={b.solid ? 0.35 : 0.8} depthWrite={false} />
          </mesh>
        ))}
        <OrbitControls target={[0.4, 0, 0]} enablePan={false} />
      </Canvas>
    </div>
  )
}
