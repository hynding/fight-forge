import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { RapierRigidBody } from '@react-three/rapier'
import { Color, Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import { useGameStore } from '../store/gameStore'
import { getConfig } from '../content/active'
import { SYSTEM_ORDER } from '../sim/loop'
import { useFeel, useSimSystem } from '../sim/simContext'
import { boxesOverlap } from '../sim/combat'
import { movePhase } from '../sim/moves'
import { isInvulnerable } from '../sim/reactions'
import { isDodging } from '../sim/defense'
import { propBox } from '../sim/props'
import {
  launchProjectile,
  projectileBox,
  projectileTargets,
  registerHit,
  stepProjectile,
  type Projectile,
  type ProjectileShape,
  type ProjectileWorld,
} from '../sim/projectiles'
import type { FighterRuntime } from '../sim/fighter'
import { playSound } from '../audio/engine'
import { hitProps, landHit, PLAYER } from './landHit'
import { placeWeapon } from './weaponDrops'

interface Props {
  world: ProjectileWorld
  playerRef: RefObject<RapierRigidBody>
  runtimes: Map<string, FighterRuntime>
  enemyRefs: Map<string, RefObject<RapierRigidBody>>
  stageLength: number
}

const CAPACITY = 64
const SHAPES: ProjectileShape[] = ['box', 'cylinder', 'sphere']

/**
 * The `projectiles` sim system (after combat) and their drawing. A fighter
 * whose move has a `projectile` fires it as the active frames begin; an
 * enemy's may hit the player only if it held an attack token (or its own
 * slot) then. Each projectile flies, hits each target once with the same
 * rules as a melee hit (guard, dodge, knockdowns, poise, armor), and stops at
 * its first hit unless it pierces. The player's also break breakable props;
 * any solid prop stops one. Drawn as one instanced mesh per shape.
 */
export const Projectiles = ({ world, playerRef, runtimes, enemyRefs, stageLength }: Props) => {
  const feel = useFeel()
  // The move instance each fighter last fired from, so a move fires once.
  const fired = useRef(new Map<string, number>())

  useSimSystem('projectiles', SYSTEM_ORDER.projectiles, (dt) => {
    const config = getConfig()
    const bodyOf = (name: string) => (name === PLAYER ? playerRef.current : (enemyRefs.get(name)?.current ?? null))
    fired.current.forEach((_, name) => {
      if (!runtimes.has(name)) fired.current.delete(name)
    })

    // Fire.
    runtimes.forEach((rt, name) => {
      const moveName = rt.move.move
      const move = moveName ? config.moves[moveName] : undefined
      if (!move?.projectile || movePhase(move, rt.move.time) !== 'active' || fired.current.get(name) === rt.move.instance) return
      fired.current.set(name, rt.move.instance)
      const def = config.projectiles[move.projectile.id]
      const body = bodyOf(name)
      if (!def || !body) return
      const hurtsPlayer = name !== PLAYER && (rt.ownAttackSlot || useGameStore.getState().attackTokens.holders.includes(name))
      const p = launchProjectile(world, move.projectile.id, def, move.projectile, {
        owner: name,
        origin: body.translation(),
        facingX: rt.facing.x,
        scale: rt.scale,
        hurtsPlayer,
      })
      // A thrown weapon rides along, to land as a pickup if it comes back.
      if (rt.thrownWeapon) {
        if (rt.thrownWeapon.returns) p.carries = rt.thrownWeapon.weapon
        rt.thrownWeapon = null
      }
      playSound(move.sound)
    })

    // Fly and hit.
    const floorTop = config.stage.floorThickness / 2
    const bounds = { minX: 0, maxX: stageLength, floorY: floorTop }
    const end = (p: Projectile) => {
      if (p.carries) placeWeapon(p.carries, { x: Math.min(stageLength - 0.5, Math.max(0.5, p.x)), z: p.z })
      return false
    }
    world.list = world.list.filter((p) => {
      const def = config.projectiles[p.def]
      if (!def || stepProjectile(p, def, dt, bounds) !== 'flying') return end(p)
      const box = projectileBox(p, def)
      for (const targetName of projectileTargets(p, PLAYER, enemyRefs.keys(), config.rules.friendlyFire)) {
        if (p.hit.has(targetName)) continue
        const target = runtimes.get(targetName)
        const targetBody = bodyOf(targetName)
        if (!target || !targetBody) continue
        const t = targetBody.translation()
        if (!boxesOverlap(box, { center: t, half: target.hurtbox })) continue
        // Knocked down, getting up or dodging: it flies past.
        if (isInvulnerable(target.reaction) || isDodging(target.dodge)) continue
        landHit(feel, {
          attacker: p.owner,
          target: targetName,
          targetRuntime: target,
          targetBody,
          fromX: p.x - p.dirX,
          dirX: p.dirX,
          damage: def.damage,
          reaction: def.reaction,
          hitSound: def.hitSound,
          at: { x: p.x, y: p.y },
        })
        if (registerHit(p, targetName)) return end(p)
      }
      if (p.owner === PLAYER && hitProps(box, p.hit, def.damage, def.hitSound) > 0) return end(p)
      // Walls and other solid props stop it.
      for (const prop of useGameStore.getState().props) {
        const pd = config.props[prop.prop]
        if (pd?.solid && boxesOverlap(box, propBox(prop, pd, floorTop))) return end(p)
      }
      return true
    })
  })

  return <ProjectileMeshes world={world} />
}

/** One instanced mesh per shape, plus hitbox outlines while the hitbox overlay is on. */
const ProjectileMeshes = ({ world }: { world: ProjectileWorld }) => {
  const meshes = useRef<Record<ProjectileShape, InstancedMesh | null>>({ box: null, cylinder: null, sphere: null })
  const outlines = useRef<InstancedMesh>(null)
  const tmp = useMemo(() => ({ m: new Matrix4(), p: new Vector3(), s: new Vector3(), q: new Quaternion(), e: new Euler(), c: new Color(), one: new Quaternion() }), [])

  useFrame(() => {
    const config = getConfig()
    const counts: Record<ProjectileShape, number> = { box: 0, cylinder: 0, sphere: 0 }
    const showBoxes = useGameStore.getState().showHitboxes
    let outlineCount = 0
    for (const p of world.list) {
      const def = config.projectiles[p.def]
      const mesh = def ? meshes.current[def.shape] : null
      if (!def || !mesh || counts[def.shape] >= CAPACITY) continue
      const [w, h, d] = def.size
      tmp.p.set(p.x, p.y, p.z)
      tmp.q.setFromEuler(tmp.e.set(0, 0, -p.dirX * (def.spin ?? 0) * Math.PI * 2 * p.age))
      if (def.shape === 'box') tmp.s.set(w, h, d)
      else if (def.shape === 'cylinder') tmp.s.set(w, h, w)
      else tmp.s.setScalar(w)
      const i = counts[def.shape]++
      mesh.setMatrixAt(i, tmp.m.compose(tmp.p, tmp.q, tmp.s))
      mesh.setColorAt(i, tmp.c.set(def.color))
      if (showBoxes && outlines.current && outlineCount < CAPACITY) {
        tmp.s.set(def.hitbox.halfX * 2, def.hitbox.halfY * 2, def.hitbox.halfZ * 2)
        outlines.current.setMatrixAt(outlineCount++, tmp.m.compose(tmp.p, tmp.one, tmp.s))
      }
    }
    for (const shape of SHAPES) {
      const mesh = meshes.current[shape]
      if (!mesh) continue
      mesh.count = counts[shape]
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    if (outlines.current) {
      outlines.current.count = outlineCount
      outlines.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <instancedMesh ref={(m) => (meshes.current.box = m)} args={[undefined, undefined, CAPACITY]} frustumCulled={false} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={(m) => (meshes.current.cylinder = m)} args={[undefined, undefined, CAPACITY]} frustumCulled={false} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 1, 16]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={(m) => (meshes.current.sphere = m)} args={[undefined, undefined, CAPACITY]} frustumCulled={false} castShadow>
        <sphereGeometry args={[0.5, 12, 8]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={outlines} args={[undefined, undefined, CAPACITY]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ff3030" wireframe />
      </instancedMesh>
    </>
  )
}
