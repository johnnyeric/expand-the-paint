import * as THREE from 'three'
import { COAT_CORE, COAT_MIST, DEPOSIT_HZ } from './constants.ts'
import { angLerp, jetHit, jetPoint, jetTravel } from './math.ts'
import type { PaintGrid } from './paint.ts'
import type { Droplets } from './particles.ts'
import { nozzleWorld } from './sprayer.ts'
import type { Actor } from './types.ts'
import type { PlayerId } from './constants.ts'

type Flight = {
  id: PlayerId
  rgb: readonly [number, number, number]
  color: number
  nx: number
  ny: number
  nz: number
  ux: number
  uz: number
  hitX: number
  hitZ: number
  len: number
  dur: number
  age: number
  seed: number
  radius: number
  amount: number
  mist: boolean
}

export class SpraySim {
  private readonly flights: Flight[] = []
  private readonly acc = [0, 0, 0, 0, 0]
  private readonly nozzle = new THREE.Vector3()

  reset(): void {
    this.flights.length = 0
    this.acc.fill(0)
  }

  pump(a: Actor, dt: number, droplets: Droplets, lite: boolean): void {
    a.mesh.position.set(a.x, a.mesh.position.y, a.z)
    a.mesh.rotation.y = -a.aim + Math.PI / 2
    nozzleWorld(a.mesh, this.nozzle)
    if (!(a.spraying && a.tank > 0)) {
      a.lagAim = a.aim
      this.acc[a.id] = 0
      return
    }
    a.lagAim = angLerp(a.lagAim, a.aim, 1 - Math.exp(-9 * dt))
    const hit = jetHit(this.nozzle.x, this.nozzle.z, a.lagAim, a.sprayLen)
    droplets.emitJet(
      this.nozzle.x,
      this.nozzle.y,
      this.nozzle.z,
      hit.ux,
      hit.uz,
      a.color,
      hit.len,
      a.clashing,
      lite,
    )
    // Gameplay deposits are device-independent. `lite` only thins droplets.
    this.acc[a.id] += dt * DEPOSIT_HZ
    while (this.acc[a.id] >= 1) {
      this.acc[a.id] -= 1
      this.spawn(a, hit, false)
      this.spawn(a, hit, true)
    }
    if (this.flights.length > 140) this.flights.splice(0, this.flights.length - 140)
  }

  step(
    dt: number,
    paint: PaintGrid,
    droplets: Droplets,
    deposit: boolean,
    lite: boolean,
  ): void {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i]
      f.age += dt
      const t = Math.min(1, f.age / f.dur)
      if (t < 1) {
        if (!lite && Math.random() < 0.35) {
          const p = jetPoint(f.nx, f.ny, f.nz, f.ux, f.uz, t, f.len)
          droplets.emit(p.x, p.y, p.z, f.ux, -0.4, f.uz, f.color, 1, 3.2, 0.18, 0.12, 7)
        }
        continue
      }
      if (deposit) {
        paint.stamp(f.hitX, f.hitZ, f.radius, f.id, f.rgb, f.seed, lite, f.amount)
      }
      droplets.emitSplash(f.hitX, f.hitZ, f.color, lite || f.mist)
      this.flights.splice(i, 1)
    }
  }

  private spawn(a: Actor, hit: ReturnType<typeof jetHit>, mist: boolean): void {
    const jx = mist ? (Math.random() - 0.5) * 0.36 : (Math.random() - 0.5) * 0.07
    const jz = mist ? (Math.random() - 0.5) * 0.36 : (Math.random() - 0.5) * 0.07
    const len = hit.len
    // Core lands short of the jet tip so the puddle reaches the walker's feet.
    const pull = mist ? 0.1 : Math.min(0.7, len * 0.4)
    this.flights.push({
      id: a.id,
      rgb: a.rgb,
      color: a.color,
      nx: this.nozzle.x,
      ny: this.nozzle.y,
      nz: this.nozzle.z,
      ux: hit.ux,
      uz: hit.uz,
      hitX: hit.x - hit.ux * pull + jx,
      hitZ: hit.z - hit.uz * pull + jz,
      len,
      dur: jetTravel(len) * (mist ? 1.12 : 1),
      age: 0,
      seed: (a.t * 180 + this.flights.length * 13) | 0,
      radius: mist ? 0.92 + len * 0.06 : 0.76 + len * 0.05,
      amount: mist ? COAT_MIST : COAT_CORE,
      mist,
    })
  }
}
