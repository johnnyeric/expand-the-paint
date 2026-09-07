import { HALF, PLAYER_DEFS, SPRAY_RANGE, type PlayerId } from './constants.ts'
import { angLerp, angWrap, clamp, hypot2 } from './math.ts'
import type { PaintGrid } from './paint.ts'
import type { Actor } from './types.ts'

const PLAY_M = HALF - 1.15
const STUCK_WINDOW = 0.48
const STUCK_MIN_TRAVEL = 0.34
const GOAL_EXPAND = 0.8
const GOAL_REFILL = 0.5
const KIND_EXPAND = 1
const KIND_REFILL = 2
const KIND_FIGHT = 3
const KIND_HOME = 4
const KIND_RECOVER = 5

export { STUCK_WINDOW, STUCK_MIN_TRAVEL }

export type StuckBot = {
  x: number
  z: number
  lx: number
  lz: number
  moveX: number
  moveZ: number
  stuck: number
  stuckTravel: number
}

/** True when the bot meant to move but made almost no progress over STUCK_WINDOW. */
export function watchStuck(p: StuckBot, dt: number): boolean {
  const intended = Math.hypot(p.moveX, p.moveZ) > 0.22
  const step = hypot2(p.x - p.lx, p.z - p.lz)
  p.lx = p.x
  p.lz = p.z
  if (!intended) {
    p.stuck = 0
    p.stuckTravel = 0
    return false
  }
  p.stuck += dt
  p.stuckTravel += step
  if (p.stuck < STUCK_WINDOW) return false
  const frozen = p.stuckTravel < STUCK_MIN_TRAVEL
  p.stuck = 0
  p.stuckTravel = 0
  return frozen
}

export function updateBot(p: Actor, actors: Actor[], grid: PaintGrid, dt: number): void {
  if (p.human || p.place > 0) return

  p.goalLife = Math.max(0, p.goalLife - dt)
  if (watchStuck(p, dt)) {
    p.goalLife = 0
    p.goalKind = KIND_RECOVER
    const a = p.t * 2.6 + p.id * 1.9
    steer(p, Math.cos(a) * 3.4, Math.sin(a) * 3.4, 1, dt)
    p.aim = angLerp(p.aim, Math.atan2(-p.z, -p.x), 8 * dt)
    p.spraying = p.tank > 10
    return
  }

  const human = closestHuman(p, actors)
  const onOwn = grid.ownerAt(p.x, p.z) === p.id
  const fading = grid.coverage(p.id) < 0.018
  const low = p.tank < 24 || (p.tank < 38 && !onOwn) || fading

  if (low) {
    p.spraying = p.tank > 6 && (!onOwn || fading)
    const t = retainGoal(p, KIND_REFILL, GOAL_REFILL, () => nearestOwn(p, grid))
    steer(p, t.x, t.z, 1, dt)
    p.aim = angLerp(p.aim, Math.atan2(t.z - p.z, t.x - p.x), 8 * dt)
    return
  }

  const threat = closestThreat(p, actors)
  const td = threat ? hypot2(threat.x - p.x, threat.z - p.z) : 99
  const yellowWantsDuel = p.id === 2 && human && hypot2(human.x - p.x, human.z - p.z) < 10.2

  if (threat && td < SPRAY_RANGE * 1.85) {
    const ang = Math.atan2(threat.z - p.z, threat.x - p.x)
    p.aim = angLerp(p.aim, ang, 10 * dt)
    p.spraying = p.tank > 10
    const hold = threat.spraying && td < SPRAY_RANGE * 1.05
    const distTarget = hold ? SPRAY_RANGE * 0.78 : SPRAY_RANGE * 0.62
    const nx = (threat.x - p.x) / Math.max(td, 0.001)
    const nz = (threat.z - p.z) / Math.max(td, 0.001)
    const tx = threat.x - nx * distTarget
    const tz = threat.z - nz * distTarget
    const strafe = Math.sin(p.t * 2.1) * (hold ? 0.9 : 0.35)
    p.goalKind = KIND_FIGHT
    p.goalX = tx + -nz * strafe
    p.goalZ = tz + nx * strafe
    p.goalLife = 0.16
    steer(p, p.goalX, p.goalZ, hold ? 0.55 : 0.9, dt)
    return
  }

  if (yellowWantsDuel && human) {
    const ang = Math.atan2(human.z - p.z, human.x - p.x)
    p.aim = angLerp(p.aim, ang, 8 * dt)
    p.spraying = true
    const midX = (p.x + human.x) * 0.5
    const midZ = (p.z + human.z) * 0.5
    p.goalKind = KIND_FIGHT
    p.goalX = midX + (human.x - p.x) * 0.15
    p.goalZ = midZ
    p.goalLife = 0.16
    steer(p, p.goalX, p.goalZ, 0.85, dt)
    return
  }

  if (p.id > 2 && p.t < 10) {
    const ox = Math.cos(p.t * 0.8) * 1.6
    const oz = Math.sin(p.t * 0.7) * 1.6
    const ang = Math.atan2(oz + Math.sin(p.t) * 0.4, ox + Math.cos(p.t) * 0.4)
    p.aim = angLerp(p.aim, ang, 6 * dt)
    p.spraying = p.tank > 8
    p.goalKind = KIND_HOME
    p.goalX = p.homeX + ox
    p.goalZ = p.homeZ + oz
    p.goalLife = 0.2
    steer(p, p.goalX, p.goalZ, 0.7, dt)
    return
  }

  const target = retainGoal(p, KIND_EXPAND, GOAL_EXPAND, () => expandTarget(p, grid, human))
  const ang = Math.atan2(target.z - p.z, target.x - p.x)
  p.aim = angLerp(p.aim, ang, 7 * dt)
  p.spraying = p.tank > 8
  steer(p, target.x, target.z, 1, dt)
}

export type GoalBot = {
  x: number
  z: number
  goalX: number
  goalZ: number
  goalLife: number
  goalKind: number
}

export function retainGoal(
  p: GoalBot,
  kind: number,
  hold: number,
  pick: () => { x: number; z: number },
): { x: number; z: number } {
  const arrived = hypot2(p.goalX - p.x, p.goalZ - p.z) < 0.55
  if (p.goalKind === kind && p.goalLife > 0 && !arrived) {
    return { x: p.goalX, z: p.goalZ }
  }
  const t = pick()
  p.goalKind = kind
  p.goalX = t.x
  p.goalZ = t.z
  p.goalLife = hold
  return t
}

function inPlay(x: number, z: number): { x: number; z: number } {
  return { x: clamp(x, -PLAY_M, PLAY_M), z: clamp(z, -PLAY_M, PLAY_M) }
}

function steer(p: Actor, x: number, z: number, scale: number, _dt: number): void {
  const t = inPlay(x, z)
  const dx = t.x - p.x
  const dz = t.z - p.z
  const d = Math.hypot(dx, dz)
  if (d < 0.18) {
    const a = p.t * 1.7 + p.id
    p.moveX = Math.cos(a) * scale * 0.85
    p.moveZ = Math.sin(a) * scale * 0.85
    return
  }
  p.moveX = (dx / d) * scale
  p.moveZ = (dz / d) * scale
}

function closestHuman(p: Actor, actors: Actor[]): Actor | undefined {
  let best: Actor | undefined
  let bestD = 99
  for (const o of actors) {
    if (!o.human || o.id === p.id || o.place > 0) continue
    const d = hypot2(o.x - p.x, o.z - p.z)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

function closestThreat(p: Actor, actors: Actor[]): Actor | null {
  let best: Actor | null = null
  let bestD = 99
  for (const o of actors) {
    if (o.id === p.id || o.place > 0) continue
    const d = hypot2(o.x - p.x, o.z - p.z)
    const toward = Math.cos(angWrap(Math.atan2(p.z - o.z, p.x - o.x) - o.aim))
    const score = d - (o.spraying ? 1.4 : 0) - (toward > 0.2 ? 0.8 : 0) - (o.human ? 0.6 : 0)
    if (score < bestD && d < SPRAY_RANGE * 2.2) {
      bestD = score
      best = o
    }
  }
  return best
}

function expandTarget(p: Actor, grid: PaintGrid, human: Actor | undefined): { x: number; z: number } {
  let best = inPlay(p.homeX * 0.4, p.homeZ * 0.4)
  let bestScore = -999
  const n = 28
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + p.t * 0.55
    const dist = 2.0 + (i % 8) * 1.25
    const sample = inPlay(p.x + Math.cos(a) * dist, p.z + Math.sin(a) * dist)
    const o = grid.ownerAt(sample.x, sample.z)
    let score = o === 0 ? 3.4 : o !== p.id ? 2.5 : 0.08
    score += 0.35 * (1 - Math.hypot(sample.x, sample.z) / (HALF + 1))
    const edge = Math.max(Math.abs(sample.x), Math.abs(sample.z))
    if (edge > HALF - 2.2) score -= (edge - (HALF - 2.2)) * 0.85
    if (p.id === 2 && human) {
      score += 2.4 / (1 + hypot2(sample.x - human.x, sample.z - human.z))
    }
    if (score > bestScore) {
      bestScore = score
      best = sample
    }
  }
  if (bestScore < 0.45) {
    best = inPlay(-p.homeX * 0.45 + Math.sin(p.t) * 2.2, -p.homeZ * 0.45 + Math.cos(p.t) * 2.2)
  }
  return best
}

function nearestOwn(p: Actor, grid: PaintGrid): { x: number; z: number } {
  if (grid.ownerAt(p.x, p.z) === p.id) return { x: p.x, z: p.z }
  let best = inPlay(p.homeX, p.homeZ)
  let bestD = 99
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2
    for (const dist of [0.8, 1.8, 3.2, 5, 7.5, 10]) {
      const sample = inPlay(p.x + Math.cos(a) * dist, p.z + Math.sin(a) * dist)
      if (grid.ownerAt(sample.x, sample.z) === p.id) {
        const d = hypot2(sample.x - p.x, sample.z - p.z)
        if (d < bestD) {
          bestD = d
          best = sample
        }
      }
    }
  }
  return best
}

export function startingAim(id: PlayerId): number {
  const def = PLAYER_DEFS[id - 1]
  if (id === 1) return 0
  if (id === 2) return Math.PI
  return Math.atan2(-def.spawn.z, -def.spawn.x)
}
