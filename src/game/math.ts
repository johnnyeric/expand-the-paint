import { HALF, JET_FLOOR_Y, JET_SPEED, PLAYER_RADIUS, SPRAY_RANGE } from './constants.ts'

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v))
}

export function clampToRoom(x: number, z: number): { x: number; z: number } {
  const m = HALF - PLAYER_RADIUS - 0.12
  return { x: clamp(x, -m, m), z: clamp(z, -m, m) }
}

/** Map a raw -1..1 stick through a deadzone, keeping analog magnitude. */
export function analogStick(x: number, y: number, deadzone: number): { x: number; y: number } {
  const len = Math.hypot(x, y)
  if (len < deadzone || deadzone >= 1) return { x: 0, y: 0 }
  const t = Math.min(1, (len - deadzone) / (1 - deadzone))
  return { x: (x / len) * t, y: (y / len) * t }
}

/** Screen stick (x = right, y = down) into world XZ for a yaw of 0 = +X. */
export function cameraStick(x: number, y: number, yaw: number): { x: number; z: number } {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return {
    x: c * -y - s * x,
    z: s * -y + c * x,
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function hypot2(dx: number, dz: number): number {
  return Math.hypot(dx, dz)
}

export function angWrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

export function angLerp(a: number, b: number, t: number): number {
  return a + angWrap(b - a) * t
}

export function rand(seed: { n: number }): number {
  seed.n = (seed.n * 16807 + 0) % 2147483647
  return (seed.n & 0x7fffffff) / 2147483647
}

/** Floor impact matching the jet ribbon: origin at the nozzle, fall with t². */
export function jetHit(
  nx: number,
  nz: number,
  aim: number,
  len = SPRAY_RANGE,
): { x: number; z: number; ux: number; uz: number; len: number } {
  const ux = Math.cos(aim)
  const uz = Math.sin(aim)
  const L = Math.max(0.4, len)
  return { x: nx + ux * L, z: nz + uz * L, ux, uz, len: L }
}

export function jetTravel(len: number): number {
  return Math.max(0.09, Math.max(0.4, len) / JET_SPEED)
}

export function jetPoint(
  nx: number,
  ny: number,
  nz: number,
  ux: number,
  uz: number,
  t: number,
  len: number,
): { x: number; y: number; z: number } {
  const L = Math.max(0.4, len)
  const u = clamp(t, 0, 1)
  return {
    x: nx + ux * L * u,
    y: ny + (JET_FLOOR_Y - ny) * u * u,
    z: nz + uz * L * u,
  }
}
