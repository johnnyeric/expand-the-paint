import * as THREE from 'three'
import {
  CAM_BACK,
  CAM_HEIGHT,
  GRID,
  HALF,
  MOUSE_TURN,
  PLAYER_DEFS,
  ROOM,
  TANK_MAX,
  TOUCH_AIM_DEADZONE,
  TOUCH_AIM_TURN,
} from './constants.ts'
import type { Input } from './input.ts'
import { angLerp, clamp } from './math.ts'
import type { PaintGrid } from './paint.ts'
import type { Actor } from './types.ts'

export function updateHuman(you: Actor, input: Input, dt: number): void {
  const stick = input.moveVector(you.aim)
  you.moveX = stick.x
  you.moveZ = stick.z
  if (you.place > 0) {
    you.moveX = 0
    you.moveZ = 0
    you.spraying = false
    if (input.hasTouchAim) {
      input.consumeMouseDx()
    } else {
      you.aim += input.consumeMouseDx() * MOUSE_TURN + input.edgeYaw(dt)
    }
    return
  }
  you.spraying = input.wantsSpray() && you.tank > 0

  const dx = input.consumeMouseDx()
  if (input.hasTouchAim) {
    const sx = input.touchAimX
    const mag = Math.abs(sx)
    if (mag > TOUCH_AIM_DEADZONE) {
      const t = (mag - TOUCH_AIM_DEADZONE) / (1 - TOUCH_AIM_DEADZONE)
      you.aim += Math.sign(sx) * t * TOUCH_AIM_TURN * dt
    }
  } else {
    you.aim += dx * MOUSE_TURN + input.edgeYaw(dt)
    if (dx === 0 && !input.hasMouseAim && Math.hypot(stick.x, stick.z) > 0.2) {
      you.aim = angLerp(you.aim, Math.atan2(stick.z, stick.x), 0.18)
    }
  }
}

/** Keep the chase cam inside the gallery so walls never fill the near plane. */
export function chasePose(you: Actor): { x: number; y: number; z: number; lx: number; ly: number; lz: number } {
  const inner = HALF - 0.55
  const lookInner = HALF - 0.95
  const back = CAM_BACK
  const fx = Math.cos(you.aim)
  const fz = Math.sin(you.aim)
  let x = you.x - fx * back
  let z = you.z - fz * back
  let height = CAM_HEIGHT

  if (Math.abs(x) > inner || Math.abs(z) > inner) {
    x = clamp(x, -inner, inner)
    z = clamp(z, -inner, inner)
    const dist = Math.hypot(x - you.x, z - you.z)
    if (dist < 1.7) {
      const side = Math.sign(fx * (z - you.z) - fz * (x - you.x)) || (you.x >= 0 ? -1 : 1)
      x = clamp(you.x + -fz * side * 2.05, -inner, inner)
      z = clamp(you.z + fx * side * 2.05, -inner, inner)
      const slid = Math.hypot(x - you.x, z - you.z)
      height = slid < 1.25 ? 2.55 + (1.25 - slid) * 0.6 : 2.12
    } else {
      height = 2.05
    }
  }

  return {
    x,
    y: height,
    z,
    lx: clamp(you.x + fx * 2.45, -lookInner, lookInner),
    ly: 0.62,
    lz: clamp(you.z + fz * 2.45, -lookInner, lookInner),
  }
}

export function followCamera(
  you: Actor,
  dt: number,
  camera: THREE.PerspectiveCamera,
  camPos: THREE.Vector3,
  camLook: THREE.Vector3,
  tightness = 8,
): void {
  const pose = chasePose(you)
  camPos.set(pose.x, pose.y, pose.z)
  camLook.set(pose.lx, pose.ly, pose.lz)
  const k = 1 - Math.exp(-tightness * Math.max(dt, 0.001))
  camera.position.lerp(camPos, k)
  camera.lookAt(camLook)
}

export type HudEls = {
  timer: HTMLElement
  tank: HTMLElement
  tankFill: HTMLElement
  tankWrap: HTMLElement
  status: HTMLElement
  hint: HTMLElement
  cover: HTMLElement[]
}

export function updateHud(
  you: Actor,
  actors: Actor[],
  paint: PaintGrid,
  remaining: number,
  hintT: number,
  els: HudEls,
): void {
  const m = Math.floor(remaining / 60)
  const s = Math.floor(remaining % 60)
  els.timer.textContent = `${m}:${s.toString().padStart(2, '0')}`
  const pct = (you.tank / TANK_MAX) * 100
  els.tankFill.style.width = `${pct}%`
  els.tank.textContent = `${Math.round(you.tank)}`
  els.tankFill.style.background = you.hex
  els.tankWrap.classList.toggle('low', you.tank < 22)
  els.tankWrap.classList.toggle('empty', you.tank <= 0)

  const onOwn = paint.ownerAt(you.x, you.z) === you.id
  let status = onOwn ? 'On your colour — faster, refilling' : 'Off colour — tank draining'
  if (you.place > 0) status = `You're out — ${placeLabel(you.place)}. The others keep spraying.`
  else if (you.tank <= 0 && onOwn) status = 'Tank empty — stay on your colour to refill'
  else if (you.tank <= 0) status = 'Tank empty — paint a path home, or walk to your colour'
  else if (you.clashing) status = 'Streams colliding — pushing the border'
  els.status.textContent = status

  els.hint.classList.toggle('hidden', hintT <= 0)
  for (const a of actors) {
    const cover = paint.coverage(a.id)
    els.cover[a.id - 1].style.width = `${cover * 100}%`
    const row = els.cover[a.id - 1].closest('.row')
    row?.classList.toggle('out', a.place > 0)
    const label = document.querySelector(`#pct-${a.id}`)
    if (!label) continue
    if (a.place > 0) label.textContent = `OUT · ${placeLabel(a.place)}`
    else label.textContent = `${Math.round(cover * 100)}%`
  }
}

export function placeLabel(n: number): string {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

export function finishRound(
  you: Actor,
  actors: Actor[],
  paint: PaintGrid,
  els: { end: HTMLElement; endTitle: HTMLElement; endBody: HTMLElement; scores: HTMLElement },
  cause: 'timer' | 'last' = 'timer',
): void {
  for (const a of actors) {
    a.spraying = false
    a.beam.visible = false
  }
  const ranked = [...actors].sort((a, b) => (a.place || 99) - (b.place || 99))
  const win = ranked[0]
  const youCover = Math.round(paint.coverage(you.id) * 100)
  const youWon = you.place === 1
  els.end.classList.remove('hidden')
  if (youWon && cause === 'last') {
    els.endTitle.textContent = 'You were the last sprayer'
    els.endBody.textContent = `Everyone else lost the floor. You held ${youCover}% when the round closed.`
  } else if (youWon) {
    els.endTitle.textContent = `${you.name} holds the floor`
    els.endBody.textContent = `1st place with ${youCover}% of the floor. Drop to zero coverage and you're out — an empty tank is just a walk home.`
  } else {
    els.endTitle.textContent = `You finished ${placeLabel(you.place || ranked.findIndex((a) => a.id === you.id) + 1)}`
    const winBit =
      cause === 'last'
        ? `${win.name} was last sprayer standing`
        : `${win.name} took 1st with ${Math.round(paint.coverage(win.id) * 100)}%`
    els.endBody.textContent = `${winBit}. You held ${youCover}%.`
  }
  els.scores.innerHTML = ranked
    .map((a) => {
      const p = Math.round(paint.coverage(a.id) * 100)
      const tag = a.id === you.id ? ' (you)' : a.human ? ' (player)' : ''
      return `<li><span class="dot" style="background:${a.hex}"></span>${placeLabel(a.place)} ${a.name}${tag} — ${p}%</li>`
    })
    .join('')
}

export function drawMinimap(ctx: CanvasRenderingContext2D, actors: Actor[], paint: PaintGrid): void {
  const size = ctx.canvas.width
  ctx.fillStyle = '#cbbda8'
  ctx.fillRect(0, 0, size, size)
  const step = 3
  const cell = size / GRID
  for (let gz = 0; gz < GRID; gz += step) {
    for (let gx = 0; gx < GRID; gx += step) {
      const id = paint.cells[gz * GRID + gx]
      if (!id) continue
      ctx.fillStyle = PLAYER_DEFS[id - 1].hex
      ctx.fillRect(gx * cell, gz * cell, cell * step + 0.4, cell * step + 0.4)
    }
  }
  for (const a of actors) {
    const px = ((a.x + HALF) / ROOM) * size
    const pz = ((a.z + HALF) / ROOM) * size
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.arc(px, pz, a.human ? 4.2 : 3.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = a.place > 0 ? '#6b645c' : a.hex
    ctx.beginPath()
    ctx.arc(px, pz, a.human ? 3.1 : 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
}
