import { applyCoat } from './coat.ts'
import { COAT_OWN, COVER_OUT, DEPOSIT_HZ, SPEED_AWAY } from './constants.ts'
import { retainGoal, STUCK_MIN_TRAVEL, STUCK_WINDOW, watchStuck, type GoalBot, type StuckBot } from './bots.ts'

function fail(msg: string): never {
  throw new Error(msg)
}

function eq(actual: number, expected: number, msg: string): void {
  if (actual !== expected) fail(`${msg}: expected ${expected}, got ${actual}`)
}

function approx(actual: number, expected: number, eps: number, msg: string): void {
  if (Math.abs(actual - expected) > eps) fail(`${msg}: expected ~${expected}, got ${actual}`)
}

function blank(): { cells: Uint8Array; coat: Uint8Array; ink: Uint8Array; counts: number[] } {
  return {
    cells: new Uint8Array([0]),
    coat: new Uint8Array([0]),
    ink: new Uint8Array([0]),
    counts: [1, 0, 0, 0, 0],
  }
}

function pigmentIdentity(): void {
  const g = blank()
  applyCoat(g.cells, g.coat, g.ink, g.counts, 0, 1, 40)
  eq(g.ink[0], 1, 'thin coat keeps blue pigment')
  eq(g.cells[0], 0, 'thin coat is not territory')
  eq(g.counts[1], 0, 'score ignores unclaimed coat')

  applyCoat(g.cells, g.coat, g.ink, g.counts, 0, 2, 20)
  eq(g.ink[0], 1, 'yellow cannot inherit blue pigment')
  eq(g.cells[0], 0, 'yellow does not claim from leftover blue')
  if (g.coat[0] >= 40) fail(`yellow added to blue coat: ${g.coat[0]}`)
}

function wearDownOwned(): void {
  const g = blank()
  applyCoat(g.cells, g.coat, g.ink, g.counts, 0, 1, 80)
  eq(g.cells[0], 1, '80 coat claims for blue')
  eq(g.counts[1], 1, 'blue coverage increments')

  applyCoat(g.cells, g.coat, g.ink, g.counts, 0, 2, 50)
  eq(g.ink[0], 1, 'worn cell still holds blue pigment')
  eq(g.cells[0], 0, 'worn below threshold is neutral territory')
  eq(g.counts[1], 0, 'blue loses the cell')

  applyCoat(g.cells, g.coat, g.ink, g.counts, 0, 2, 16)
  eq(g.ink[0], 1, 'small yellow pass still fights leftover blue')
  eq(g.cells[0], 0, 'yellow does not claim from worn blue')
}

function breakthrough(): void {
  const g = blank()
  applyCoat(g.cells, g.coat, g.ink, g.counts, 0, 1, 20)
  applyCoat(g.cells, g.coat, g.ink, g.counts, 0, 2, 80)
  eq(g.ink[0], 2, 'breaking through switches pigment to yellow')
  eq(g.cells[0], 0, 'leftover after breakthrough stays unclaimed if below threshold')
  if (g.coat[0] < 1) fail('breakthrough leftover coat missing')
}

function sameColourBuilds(): void {
  const g = blank()
  applyCoat(g.cells, g.coat, g.ink, g.counts, 0, 1, 30)
  applyCoat(g.cells, g.coat, g.ink, g.counts, 0, 1, 30)
  eq(g.cells[0], 1, 'two blue passes claim once coat crosses threshold')
  eq(g.ink[0], 1, 'claimed cell keeps blue pigment')
  if (g.coat[0] < COAT_OWN) fail(`coat ${g.coat[0]} below ${COAT_OWN}`)
}

function walkingRecoveries(fps: number): number {
  const dt = 1 / fps
  const bot: StuckBot = {
    x: 0,
    z: 0,
    lx: 0,
    lz: 0,
    moveX: 1,
    moveZ: 0,
    stuck: 0,
    stuckTravel: 0,
  }
  let hits = 0
  const frames = Math.round(3 * fps)
  for (let i = 0; i < frames; i++) {
    bot.x += SPEED_AWAY * dt
    if (watchStuck(bot, dt)) hits++
  }
  return hits
}

function stuckWindow(): void {
  for (const fps of [30, 60, 120]) {
    const hits = walkingRecoveries(fps)
    eq(hits, 0, `unobstructed ${fps} FPS should not look stuck`)
  }

  const dt = 1 / 60
  const frozen: StuckBot = {
    x: 0,
    z: 0,
    lx: 0,
    lz: 0,
    moveX: 1,
    moveZ: 0,
    stuck: 0,
    stuckTravel: 0,
  }
  let hits = 0
  for (let i = 0; i < 180; i++) {
    if (watchStuck(frozen, dt)) hits++
  }
  if (hits < 1) fail('a bot that intends to move but does not should recover')
  approx(STUCK_WINDOW, 0.48, 0.001, 'stuck window')
  approx(STUCK_MIN_TRAVEL, 0.34, 0.001, 'stuck travel floor')
}

function retainedGoals(): void {
  const bot: GoalBot = {
    x: 0,
    z: 0,
    goalX: 0,
    goalZ: 0,
    goalLife: 0,
    goalKind: 0,
  }
  let picks = 0
  const pickA = (): { x: number; z: number } => {
    picks++
    return { x: 4, z: 1 }
  }
  const first = retainGoal(bot, 1, 0.8, pickA)
  eq(first.x, 4, 'first pick x')
  eq(picks, 1, 'pick once')
  bot.goalLife = 0.5
  const again = retainGoal(bot, 1, 0.8, pickA)
  eq(again.x, 4, 'sticky goal stays')
  eq(picks, 1, 'do not re-pick while the goal is live')
  bot.goalLife = 0
  retainGoal(bot, 1, 0.8, () => {
    picks++
    return { x: -3, z: 2 }
  })
  eq(bot.goalX, -3, 'expired goal is replaced')
  eq(picks, 2, 'pick after expiry')
}

function depositRate(): void {
  eq(DEPOSIT_HZ, 20, 'phone and desktop share deposit rate')
  let acc = 0
  let pulses = 0
  const dt = 1 / 60
  for (let i = 0; i < 120; i++) {
    acc += dt * DEPOSIT_HZ
    while (acc >= 1) {
      acc -= 1
      pulses++
    }
  }
  eq(pulses, 40, 'two seconds at 60 FPS is 40 core+mist pairs')
}

function coverageKnockout(): void {
  approx(COVER_OUT, 0.0012, 1e-6, 'almost-zero coverage threshold')
  if (COVER_OUT >= 0.01) fail('knockout must be near-zero coverage, not a large slice of the floor')
}

export function runConsistencyChecks(): void {
  pigmentIdentity()
  wearDownOwned()
  breakthrough()
  sameColourBuilds()
  stuckWindow()
  retainedGoals()
  depositRate()
  coverageKnockout()
}

runConsistencyChecks()
console.log('consistency checks passed')
