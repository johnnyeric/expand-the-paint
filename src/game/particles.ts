import * as THREE from 'three'
import { PLAYER_DEFS } from './constants.ts'

export class Droplets {
  readonly mesh: THREE.Points
  private readonly max: number
  private readonly pos: Float32Array
  private readonly col: Float32Array
  private readonly life: Float32Array
  private readonly vx: Float32Array
  private readonly vy: Float32Array
  private readonly vz: Float32Array
  private readonly size: Float32Array
  private readonly ang: Float32Array
  private cursor = 0

  constructor(max = 1400) {
    this.max = max
    this.pos = new Float32Array(max * 3)
    this.col = new Float32Array(max * 3)
    this.life = new Float32Array(max)
    this.vx = new Float32Array(max)
    this.vy = new Float32Array(max)
    this.vz = new Float32Array(max)
    this.size = new Float32Array(max)
    this.ang = new Float32Array(max)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1))
    geo.setAttribute('aAng', new THREE.BufferAttribute(this.ang, 1))

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: {},
      vertexShader: `
        attribute float aSize;
        attribute float aAng;
        varying vec3 vColor;
        varying float vAng;
        varying float vFloor;
        void main() {
          vColor = color;
          vAng = aAng;
          vFloor = step(0.045, 0.06 - position.y);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (22.0 / max(-mv.z, 0.45)), 2.0, 16.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAng;
        varying float vFloor;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float s = sin(vAng);
          float c = cos(vAng);
          vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
          q.x *= mix(0.22, 0.78, vFloor);
          q.y *= mix(1.15, 0.38, vFloor);
          float d = length(q);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.07, d);
          float highlight = smoothstep(0.16, 0.0, length(q - vec2(-0.08, -0.1)));
          vec3 col = mix(vColor * 0.62, vColor, a);
          col = mix(col, vec3(1.0), highlight * 0.34 * (1.0 - vFloor));
          gl_FragColor = vec4(col, a * mix(0.94, 0.72, vFloor));
        }
      `,
    })
    this.mesh = new THREE.Points(geo, mat)
    this.mesh.frustumCulled = false
  }

  emit(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    color: number,
    count: number,
    speed: number,
    spread: number,
    life = 0.22,
    size = 12,
  ): void {
    const r = ((color >> 16) & 255) / 255
    const g = ((color >> 8) & 255) / 255
    const b = (color & 255) / 255
    const yaw = Math.atan2(dz, dx)
    for (let i = 0; i < count; i++) {
      const id = this.cursor++ % this.max
      const jx = (Math.random() - 0.5) * spread
      const jy = (Math.random() - 0.5) * spread * 0.22
      const jz = (Math.random() - 0.5) * spread
      this.pos[id * 3] = x
      this.pos[id * 3 + 1] = y
      this.pos[id * 3 + 2] = z
      this.vx[id] = dx * speed + jx
      this.vy[id] = dy * speed + jy
      this.vz[id] = dz * speed + jz
      this.col[id * 3] = r
      this.col[id * 3 + 1] = g
      this.col[id * 3 + 2] = b
      this.life[id] = life * (0.7 + Math.random() * 0.6)
      this.size[id] = size * (0.65 + Math.random() * 0.7)
      this.ang[id] = yaw + (Math.random() - 0.5) * 0.22
    }
  }

  emitJet(
    x: number,
    y: number,
    z: number,
    ux: number,
    uz: number,
    color: number,
    len: number,
    clashing: boolean,
    lite: boolean,
  ): void {
    const L = Math.max(0.5, len)
    const n = lite ? 3 : 6
    for (let i = 0; i < n; i++) {
      const t = Math.random()
      const px = x + ux * L * t
      const pz = z + uz * L * t
      const py = Math.max(0.04, y * (1 - t * t))
      const fall = 0.08 + t * 1.15
      this.emit(
        px,
        py,
        pz,
        ux,
        -fall,
        uz,
        color,
        1,
        8.5 + t * 5,
        clashing ? 1.5 : 0.12 + t * 0.85,
        0.14 + t * 0.16,
        t > 0.62 ? 5 : 9,
      )
    }
    const tip = 0.84 + Math.random() * 0.12
    this.emit(
      x + ux * L * tip,
      0.05,
      z + uz * L * tip,
      ux * 0.2,
      0.55,
      uz * 0.2,
      color,
      lite ? 3 : 6,
      2.8,
      1.85,
      0.22,
      6,
    )
  }

  emitSplash(x: number, z: number, color: number, lite: boolean): void {
    const n = lite ? 5 : 10
    const r = ((color >> 16) & 255) / 255
    const g = ((color >> 8) & 255) / 255
    const b = (color & 255) / 255
    for (let i = 0; i < n; i++) {
      const id = this.cursor++ % this.max
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4
      const spd = 0.9 + Math.random() * 2.6
      this.pos[id * 3] = x
      this.pos[id * 3 + 1] = 0.04
      this.pos[id * 3 + 2] = z
      this.vx[id] = Math.cos(ang) * spd
      this.vy[id] = 0.55 + Math.random() * 1.6
      this.vz[id] = Math.sin(ang) * spd
      this.col[id * 3] = r
      this.col[id * 3 + 1] = g
      this.col[id * 3 + 2] = b
      this.life[id] = 0.18 + Math.random() * 0.22
      this.size[id] = 6 + Math.random() * 5
      this.ang[id] = ang
    }
  }

  emitClash(x: number, y: number, z: number): void {
    for (const def of PLAYER_DEFS.slice(0, 2)) {
      this.emit(x, y, z, 0, 1, 0, 0xffffff, 3, 1.1, 2.8, 0.18, 9)
      this.emit(x, y, z, 0, 0.55, 0, def.color, 5, 0.85, 2.4, 0.24, 10)
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -4
        continue
      }
      this.life[i] -= dt
      this.pos[i * 3] += this.vx[i] * dt
      this.pos[i * 3 + 1] += this.vy[i] * dt
      this.pos[i * 3 + 2] += this.vz[i] * dt
      this.vy[i] -= 26 * dt
      if (this.pos[i * 3 + 1] < 0.03) {
        this.pos[i * 3 + 1] = 0.03
        this.vy[i] *= -0.12
        this.vx[i] *= 0.32
        this.vz[i] *= 0.32
        this.size[i] *= 1.45
      }
      this.size[i] *= 1 - dt * 0.55
    }
    const geo = this.mesh.geometry
    ;(geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true
    ;(geo.attributes.aAng as THREE.BufferAttribute).needsUpdate = true
  }
}
