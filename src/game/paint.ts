import { GRID, HALF, ROOM, WET_FADE, type PlayerId } from './constants.ts'
import { applyCoat } from './coat.ts'
import { clamp } from './math.ts'

export class PaintGrid {
  readonly cells: Uint8Array
  readonly coat: Uint8Array
  /** Whose pigment is in the cell, even when coat is too thin to count as territory. */
  readonly ink: Uint8Array
  readonly counts = [0, 0, 0, 0, 0]
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  readonly wetCanvas: HTMLCanvasElement
  readonly wetCtx: CanvasRenderingContext2D
  dirty = false
  wetDirty = false
  private readonly cell = ROOM / GRID
  private readonly wetSize: number

  constructor(resolution: number, wetSize = 512) {
    this.cells = new Uint8Array(GRID * GRID)
    this.coat = new Uint8Array(GRID * GRID)
    this.ink = new Uint8Array(GRID * GRID)
    this.canvas = document.createElement('canvas')
    this.canvas.width = resolution
    this.canvas.height = resolution
    const ctx = this.canvas.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('No 2D context')
    this.ctx = ctx
    this.wetSize = wetSize
    this.wetCanvas = document.createElement('canvas')
    this.wetCanvas.width = wetSize
    this.wetCanvas.height = wetSize
    const wet = this.wetCanvas.getContext('2d', { alpha: true })
    if (!wet) throw new Error('No wet context')
    this.wetCtx = wet
    this.clear()
  }

  clear(): void {
    this.cells.fill(0)
    this.coat.fill(0)
    this.ink.fill(0)
    this.counts.fill(0)
    this.counts[0] = GRID * GRID
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.wetCtx.setTransform(1, 0, 0, 1, 0, 0)
    this.wetCtx.clearRect(0, 0, this.wetSize, this.wetSize)
    this.dirty = true
    this.wetDirty = true
  }

  worldToUv(x: number, z: number): { u: number; v: number } {
    return {
      u: (x + HALF) / ROOM,
      v: 0.5 - z / ROOM,
    }
  }

  ownerAt(x: number, z: number): PlayerId | 0 {
    const i = this.indexAt(x, z)
    if (i < 0) return 0
    return this.cells[i] as PlayerId | 0
  }

  pigmentAt(x: number, z: number): PlayerId | 0 {
    const i = this.indexAt(x, z)
    if (i < 0) return 0
    return this.ink[i] as PlayerId | 0
  }

  coverage(id: PlayerId): number {
    return this.counts[id] / (GRID * GRID)
  }

  stamp(
    x: number,
    z: number,
    radius: number,
    owner: PlayerId,
    rgb: readonly [number, number, number],
    seed: number,
    lite = false,
    amount = 255,
  ): void {
    this.depositCells(x, z, radius, owner, amount)
    this.stampSplat(x, z, radius, rgb, seed, lite, amount)
    this.stampWet(x, z, radius, rgb, amount)
    this.dirty = true
  }

  paintHome(x: number, z: number, owner: PlayerId, rgb: readonly [number, number, number]): void {
    this.stamp(x, z, 2.15, owner, rgb, owner * 91, false, 255)
    this.stamp(x + 0.7, z - 0.4, 1.35, owner, rgb, owner * 17, false, 255)
    this.stamp(x - 0.55, z + 0.5, 1.2, owner, rgb, owner * 31, false, 255)
  }

  tickWet(dt: number): void {
    const keep = Math.exp(-WET_FADE * Math.max(dt, 0))
    if (keep > 0.997) return
    const ctx = this.wetCtx
    ctx.save()
    ctx.globalCompositeOperation = 'destination-in'
    ctx.fillStyle = `rgba(0,0,0,${keep})`
    ctx.fillRect(0, 0, this.wetSize, this.wetSize)
    ctx.restore()
    this.wetDirty = true
  }

  private indexAt(x: number, z: number): number {
    const gx = Math.floor((x + HALF) / this.cell)
    const gz = Math.floor((z + HALF) / this.cell)
    if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) return -1
    return gz * GRID + gx
  }

  private depositCells(x: number, z: number, radius: number, owner: PlayerId, amount: number): void {
    const r = radius
    const minX = Math.max(0, Math.floor((x - r + HALF) / this.cell))
    const maxX = Math.min(GRID - 1, Math.floor((x + r + HALF) / this.cell))
    const minZ = Math.max(0, Math.floor((z - r + HALF) / this.cell))
    const maxZ = Math.min(GRID - 1, Math.floor((z + r + HALF) / this.cell))
    const r2 = r * r
    for (let gz = minZ; gz <= maxZ; gz++) {
      const cz = -HALF + (gz + 0.5) * this.cell
      const dz = cz - z
      for (let gx = minX; gx <= maxX; gx++) {
        const cx = -HALF + (gx + 0.5) * this.cell
        const dx = cx - x
        const d2 = dx * dx + dz * dz
        if (d2 > r2) continue
        const fall = 1 - Math.sqrt(d2) / r
        const add = amount * fall * fall
        if (add < 1) continue
        applyCoat(this.cells, this.coat, this.ink, this.counts, gz * GRID + gx, owner, add)
      }
    }
  }

  private stampSplat(
    x: number,
    z: number,
    radius: number,
    rgb: readonly [number, number, number],
    seed: number,
    lite: boolean,
    amount: number,
  ): void {
    const { u, v } = this.worldToUv(x, z)
    const px = u * this.canvas.width
    const py = v * this.canvas.height
    const pr = (radius / ROOM) * this.canvas.width
    const ctx = this.ctx
    const [r, g, b] = rgb
    const opacity = clamp(amount / 180, 0.12, 0.72)
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'

    const core = ctx.createRadialGradient(px, py, pr * 0.04, px, py, pr)
    core.addColorStop(0, `rgba(${r},${g},${b},${opacity})`)
    core.addColorStop(0.42, `rgba(${r},${g},${b},${opacity * 0.82})`)
    core.addColorStop(1, `rgba(${r},${g},${b},0)`)
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fill()
    if (lite) {
      ctx.restore()
      return
    }

    let n = (seed * 1103515245 + 12345) >>> 0
    const next = (): number => {
      n = (n * 1664525 + 1013904223) >>> 0
      return n / 4294967296
    }

    const lobes = amount > 40 ? 4 : 2
    for (let i = 0; i < lobes; i++) {
      const a = next() * Math.PI * 2
      const d = pr * (0.12 + next() * 0.38)
      const lr = pr * (0.16 + next() * 0.22)
      const lx = px + Math.cos(a) * d
      const ly = py + Math.sin(a) * d
      const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr)
      lg.addColorStop(0, `rgba(${r},${g},${b},${opacity * 0.7})`)
      lg.addColorStop(1, `rgba(${r},${g},${b},0)`)
      ctx.fillStyle = lg
      ctx.beginPath()
      ctx.arc(lx, ly, lr, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  private stampWet(
    x: number,
    z: number,
    radius: number,
    rgb: readonly [number, number, number],
    amount: number,
  ): void {
    const { u, v } = this.worldToUv(x, z)
    const px = u * this.wetSize
    const py = v * this.wetSize
    const pr = (radius / ROOM) * this.wetSize * 0.92
    const ctx = this.wetCtx
    const [cr, cg, cb] = rgb
    const a = clamp(amount / 140, 0.22, 0.7)
    ctx.save()
    const grad = ctx.createRadialGradient(px, py, pr * 0.08, px, py, pr)
    grad.addColorStop(0, `rgba(255,255,255,${a * 0.55})`)
    grad.addColorStop(0.35, `rgba(${cr},${cg},${cb},${a * 0.42})`)
    grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    this.wetDirty = true
  }
}
