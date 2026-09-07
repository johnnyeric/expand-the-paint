import * as THREE from 'three'
import { KNOCKBACK, PLAYER_RADIUS, SPEED_AWAY, SPEED_OWN, SPRAY_RANGE } from './constants.ts'
import { clampToRoom, lerp } from './math.ts'
import type { PaintGrid } from './paint.ts'
import type { Droplets } from './particles.ts'
import { nozzleWorld } from './sprayer.ts'
import type { Actor } from './types.ts'

const _na = new THREE.Vector3()
const _nb = new THREE.Vector3()

export function resolveClashes(
  actors: Actor[],
  dt: number,
  droplets: Droplets,
  clashRing: THREE.Mesh,
): number {
  let clashLife = 0
    for (let i = 0; i < actors.length; i++) {
    const a = actors[i]
    if (a.place > 0 || !a.spraying || a.tank <= 0) continue
    a.mesh.position.set(a.x, a.mesh.position.y, a.z)
    a.mesh.rotation.y = -a.aim + Math.PI / 2
    for (let j = i + 1; j < actors.length; j++) {
      const b = actors[j]
      if (b.place > 0 || !b.spraying || b.tank <= 0) continue
      b.mesh.position.set(b.x, b.mesh.position.y, b.z)
      b.mesh.rotation.y = -b.aim + Math.PI / 2
      nozzleWorld(a.mesh, _na)
      nozzleWorld(b.mesh, _nb)
      const clash = streamClash(_na.x, _na.z, a.aim, _nb.x, _nb.z, b.aim)
      if (!clash) continue
      a.clashing = true
      b.clashing = true
      a.sprayLen = Math.min(a.sprayLen, clash.tA)
      b.sprayLen = Math.min(b.sprayLen, clash.tB)
      const nx = clash.x - a.x
      const nz = clash.z - a.z
      const nd = Math.max(Math.hypot(nx, nz), 0.001)
      a.vx -= (nx / nd) * KNOCKBACK * dt
      a.vz -= (nz / nd) * KNOCKBACK * dt
      b.vx += (nx / nd) * KNOCKBACK * dt
      b.vz += (nz / nd) * KNOCKBACK * dt
      if (Math.random() < 0.45) droplets.emitClash(clash.x, 0.55, clash.z)
      clashRing.position.set(clash.x, 0.05, clash.z)
      clashLife = 0.2
    }
  }
  return clashLife
}

export function streamClash(
  ax: number,
  az: number,
  aAim: number,
  bx: number,
  bz: number,
  bAim: number,
): { x: number; z: number; tA: number; tB: number } | null {
  const ux = Math.cos(aAim)
  const uz = Math.sin(aAim)
  const vx = Math.cos(bAim)
  const vz = Math.sin(bAim)
  const wx = ax - bx
  const wz = az - bz
  const d = ux * vx + uz * vz
  const e = ux * wx + uz * wz
  const f = vx * wx + vz * wz
  const denom = 1 - d * d
  let tA: number
  let tB: number
  if (Math.abs(denom) < 1e-4) {
    const dist = Math.hypot(ax - bx, az - bz)
    if (dist > SPRAY_RANGE * 1.8) return null
    const toward = ux * (bx - ax) + uz * (bz - az)
    if (toward < 0.4) return null
    tA = dist * 0.5
    tB = dist * 0.5
  } else {
    tA = (d * f - e) / denom
    tB = (f - d * e) / denom
  }
  if (tA < 0.45 || tB < 0.45 || tA > SPRAY_RANGE || tB > SPRAY_RANGE) return null
  const hx = ax + ux * tA
  const hz = az + uz * tA
  const px = bx + vx * tB
  const pz = bz + vz * tB
  const gap = Math.hypot(hx - px, hz - pz)
  const width = lerp(0.22, 0.95, Math.max(tA, tB) / SPRAY_RANGE)
  if (gap > width) return null
  return { x: (hx + px) * 0.5, z: (hz + pz) * 0.5, tA, tB }
}

export function stepMovement(a: Actor, paint: PaintGrid, dt: number): void {
  if (a.place > 0) {
    a.vx *= Math.exp(-11 * dt)
    a.vz *= Math.exp(-11 * dt)
    a.moveX = 0
    a.moveZ = 0
    a.spraying = false
    return
  }
  const onOwn = paint.ownerAt(a.x, a.z) === a.id
  const speed = onOwn ? SPEED_OWN : SPEED_AWAY
  a.x += (a.moveX * speed + a.vx) * dt
  a.z += (a.moveZ * speed + a.vz) * dt
  a.vx *= Math.exp(-11 * dt)
  a.vz *= Math.exp(-11 * dt)
  const c = clampToRoom(a.x, a.z)
  if (Math.abs(c.x - a.x) > 1e-5) a.vx = 0
  if (Math.abs(c.z - a.z) > 1e-5) a.vz = 0
  a.x = c.x
  a.z = c.z
}

export function separatePlayers(actors: Actor[]): void {
  for (let i = 0; i < actors.length; i++) {
    for (let j = i + 1; j < actors.length; j++) {
      const a = actors[i]
      const b = actors[j]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const d = Math.hypot(dx, dz)
      const min = PLAYER_RADIUS * 2.05
      if (a.place > 0 || b.place > 0) continue
      if (d < 0.001 || d >= min) continue
      const push = (min - d) * 0.5
      const nx = dx / d
      const nz = dz / d
      a.x -= nx * push
      a.z -= nz * push
      b.x += nx * push
      b.z += nz * push
    }
  }
}

export function syncMesh(a: Actor, nozzle: THREE.Vector3, playing: boolean): void {
  const live = playing && a.place === 0
  const bob = Math.sin(a.t * (live ? 8.2 : 3.1)) * (live ? 0.024 : 0.012)
  a.mesh.position.set(a.x, bob, a.z)
  a.mesh.rotation.y = -a.aim + Math.PI / 2
  const spraying = a.spraying && a.tank > 0 && live
  if (spraying) nozzleWorld(a.mesh, nozzle)
}
