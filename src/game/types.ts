import type { PlayerId } from './constants.ts'
import type * as THREE from 'three'

export interface Actor {
  id: PlayerId
  name: string
  hex: string
  rgb: readonly [number, number, number]
  color: number
  human: boolean
  x: number
  z: number
  vx: number
  vz: number
  aim: number
  lagAim: number
  tank: number
  /** 0 = still spraying. 1–4 = finished place, 1st through 4th. */
  place: number
  spraying: boolean
  sprayLen: number
  clashing: boolean
  moveX: number
  moveZ: number
  homeX: number
  homeZ: number
  t: number
  stuck: number
  stuckTravel: number
  lx: number
  lz: number
  goalX: number
  goalZ: number
  goalLife: number
  goalKind: number
  mesh: THREE.Group
  beam: THREE.Group
}
