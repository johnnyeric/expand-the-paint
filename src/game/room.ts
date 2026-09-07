import * as THREE from 'three'
import { HALF, PLAYER_DEFS, ROOM } from './constants.ts'

const ROOF = 4.35
const KICK = 0.62

function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('No 2D context')
  draw(ctx, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  return tex
}

export function makeConcreteTexture(): THREE.CanvasTexture {
  return canvasTex(512, (ctx, size) => {
    ctx.fillStyle = '#d2c8b8'
    ctx.fillRect(0, 0, size, size)
    const tiles = 8
    const tile = size / tiles
    for (let y = 0; y < tiles; y++) {
      for (let x = 0; x < tiles; x++) {
        const n = (x * 13 + y * 29) % 9
        const shade = 196 + n * 4
        ctx.fillStyle = `rgb(${shade - 6}, ${shade - 16}, ${shade - 30})`
        ctx.fillRect(x * tile + 2, y * tile + 2, tile - 4, tile - 4)
        for (let i = 0; i < 70; i++) {
          ctx.fillStyle = `rgba(${70 + (i % 40)},${62 + (i % 28)},${54},${0.03 + Math.random() * 0.08})`
          ctx.fillRect(x * tile + Math.random() * tile, y * tile + Math.random() * tile, 1 + (i % 3), 1 + (i % 2))
        }
        if ((x + y * 3) % 5 === 0) {
          ctx.fillStyle = 'rgba(90, 72, 58, 0.08)'
          ctx.beginPath()
          ctx.ellipse(
            x * tile + tile * 0.4,
            y * tile + tile * 0.55,
            tile * 0.22,
            tile * 0.12,
            0.4,
            0,
            Math.PI * 2,
          )
          ctx.fill()
        }
      }
    }
    ctx.strokeStyle = 'rgba(78, 70, 60, 0.38)'
    ctx.lineWidth = 3
    for (let i = 0; i <= tiles; i++) {
      ctx.beginPath()
      ctx.moveTo(i * tile, 0)
      ctx.lineTo(i * tile, size)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i * tile)
      ctx.lineTo(size, i * tile)
      ctx.stroke()
    }
  })
}

function makeSkyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 256
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('No 2D context')
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, '#1a2348')
  g.addColorStop(0.38, '#3d4d86')
  g.addColorStop(0.62, '#c47a62')
  g.addColorStop(0.78, '#f0b07a')
  g.addColorStop(1, '#2a2428')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 32, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

function makeFacadeTexture(): THREE.CanvasTexture {
  return canvasTex(256, (ctx, size) => {
    ctx.fillStyle = '#2a303c'
    ctx.fillRect(0, 0, size, size)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 6; x++) {
        const lit = (x * 17 + y * 11) % 7 > 2
        ctx.fillStyle = lit ? '#f4d58a' : '#151920'
        ctx.fillRect(18 + x * 38, 12 + y * 24, 16, 12)
      }
    }
  })
}

function addBox(
  scene: THREE.Scene,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  shadow = false,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  mesh.position.set(x, y, z)
  if (shadow) {
    mesh.castShadow = true
    mesh.receiveShadow = true
  }
  scene.add(mesh)
  return mesh
}

function addCity(scene: THREE.Scene): void {
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(48, 48),
    new THREE.MeshStandardMaterial({ color: 0x3a3944, roughness: 0.95 }),
  )
  plaza.rotation.x = -Math.PI / 2
  plaza.position.y = -0.04
  scene.add(plaza)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(HALF + 2.4, HALF + 4.8, 48),
    new THREE.MeshStandardMaterial({ color: 0x2c313a, roughness: 0.9 }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = -0.02
  scene.add(ring)

  const facade = makeFacadeTexture()
  const night = new THREE.MeshStandardMaterial({
    map: facade,
    roughness: 0.72,
    metalness: 0.08,
    color: 0xffffff,
  })
  const cap = new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.55, metalness: 0.2 })
  const glow = new THREE.MeshStandardMaterial({
    color: 0xf2c56b,
    emissive: 0xf0b24a,
    emissiveIntensity: 0.85,
    roughness: 0.4,
  })

  for (let i = 0; i < 26; i++) {
    const ang = (i / 26) * Math.PI * 2 + 0.08
    const r = HALF + 7.8 + (i % 5) * 2.6
    const w = 2.1 + (i % 3) * 0.7
    const d = 1.9 + (i % 4) * 0.45
    const h = 5.2 + ((i * 17) % 12) * 0.85
    const x = Math.cos(ang) * r
    const z = Math.sin(ang) * r
    addBox(scene, night, x, h / 2, z, w, h, d)
    addBox(scene, cap, x, h + 0.12, z, w * 0.92, 0.24, d * 0.92)
    if (i % 3 === 0) {
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), cap)
      antenna.position.set(x, h + 0.9, z)
      scene.add(antenna)
    }
  }

  for (const [x, z, h, w] of [
    [22, -8, 16.5, 3.4],
    [-20, 14, 14.2, 2.8],
    [12, 24, 18, 3.1],
    [-26, -6, 12.5, 2.6],
  ] as const) {
    addBox(scene, night, x, h / 2, z, w, h, w)
    addBox(scene, glow, x, h * 0.62, z + w * 0.52, w * 0.35, 0.5, 0.08)
  }

  const foliage = new THREE.MeshStandardMaterial({ color: 0x1f4a38, roughness: 0.8 })
  const trunk = new THREE.MeshStandardMaterial({ color: 0x4a3428, roughness: 0.9 })
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 + 0.3
    const r = HALF + 3.2
    const x = Math.cos(ang) * r
    const z = Math.sin(ang) * r
    const bole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 6), trunk)
    bole.position.set(x, 0.45, z)
    scene.add(bole)
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 0), foliage)
    crown.position.set(x, 1.35, z)
    crown.scale.set(1, 0.85, 1)
    scene.add(crown)
  }

  const rail = new THREE.MeshStandardMaterial({ color: 0xc9d4de, roughness: 0.35, metalness: 0.45 })
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2
    const x = Math.cos(a) * (HALF + 2.7)
    const z = Math.sin(a) * (HALF + 2.7)
    addBox(scene, rail, x, 0.42, z, 0.08, 0.84, 0.08)
  }
}

function addLamp(
  scene: THREE.Scene,
  x: number,
  z: number,
  shade: THREE.Material,
  bulb: THREE.Material,
  steel: THREE.Material,
  lit: boolean,
): void {
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.56, 0.18, 16), shade)
  hat.position.set(x, 2.72, z)
  scene.add(hat)
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), bulb)
  light.position.set(x, 2.58, z)
  scene.add(light)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, ROOF - 2.72, 8), steel)
  rod.position.set(x, (ROOF + 2.72) / 2, z)
  scene.add(rod)
  if (!lit) return
  const lamp = new THREE.PointLight(0xffe2b0, 3.4, 11, 1.7)
  lamp.position.set(x, 2.48, z)
  scene.add(lamp)
}

function addBench(scene: THREE.Scene, x: number, z: number, rot: number, wood: THREE.Material, steel: THREE.Material): void {
  const g = new THREE.Group()
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.42), wood)
  seat.position.y = 0.42
  seat.castShadow = true
  seat.receiveShadow = true
  g.add(seat)
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.36, 0.07), wood)
  back.position.set(0, 0.66, -0.18)
  back.castShadow = true
  g.add(back)
  for (const s of [-0.7, 0.7]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.4, 0.36), steel)
    leg.position.set(s, 0.2, 0)
    g.add(leg)
  }
  g.position.set(x, 0, z)
  g.rotation.y = rot
  scene.add(g)
}

function addPaintCans(
  scene: THREE.Scene,
  x: number,
  z: number,
  colors: number[],
): void {
  colors.forEach((color, i) => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.38,
      metalness: 0.22,
      emissive: color,
      emissiveIntensity: 0.12,
    })
    const lid = new THREE.MeshStandardMaterial({ color: 0xc5ccd4, roughness: 0.32, metalness: 0.55 })
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.34, 12), mat)
    can.position.set(x + (i % 2) * 0.28, 0.17, z + Math.floor(i / 2) * 0.28)
    can.castShadow = true
    can.receiveShadow = true
    scene.add(can)
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.03, 12), lid)
    top.position.copy(can.position)
    top.position.y = 0.35
    scene.add(top)
  })
}

function addPlanter(scene: THREE.Scene, x: number, z: number): void {
  const pot = new THREE.MeshStandardMaterial({ color: 0x6a5648, roughness: 0.82 })
  const leaf = new THREE.MeshStandardMaterial({ color: 0x1c5a3c, roughness: 0.62 })
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.32, 10), pot)
  bowl.position.set(x, 0.16, z)
  bowl.castShadow = true
  scene.add(bowl)
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), leaf)
  crown.position.set(x, 0.62, z)
  crown.scale.set(1.05, 0.9, 1)
  crown.castShadow = true
  scene.add(crown)
}

function addCourtLines(scene: THREE.Scene): void {
  const inset = 0.55
  const w = ROOM - inset * 2
  const d = ROOM - inset * 2
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf7ead0,
    emissive: 0xc4a878,
    emissiveIntensity: 0.22,
    roughness: 0.48,
    metalness: 0.06,
  })
  const bar = (x: number, z: number, bw: number, bd: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.018, bd), mat)
    m.position.set(x, 0.009, z)
    scene.add(m)
  }
  bar(0, -HALF + inset, w, 0.14)
  bar(0, HALF - inset, w, 0.14)
  bar(-HALF + inset, 0, 0.14, d)
  bar(HALF - inset, 0, 0.14, d)
}

function addGallerySet(scene: THREE.Scene, phone: boolean): void {
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4638, roughness: 0.68 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a96a2, roughness: 0.32, metalness: 0.62 })
  addBench(scene, 0, -HALF + 0.48, 0, wood, steel)
  addBench(scene, 0, HALF - 0.48, Math.PI, wood, steel)
  addBench(scene, -HALF + 0.48, 0, Math.PI / 2, wood, steel)
  addBench(scene, HALF - 0.48, 0, -Math.PI / 2, wood, steel)
  addPaintCans(scene, -HALF + 0.72, -HALF + 0.72, [0x2f7bff, 0xffd21a, 0xeeeae2])
  addPaintCans(scene, HALF - 1.05, HALF - 0.95, [0xff3d8a, 0x22c55e, 0xd9cfc2])
  addPlanter(scene, -HALF + 0.7, HALF - 0.7)
  addPlanter(scene, HALF - 0.7, -HALF + 0.7)
  addCourtLines(scene)
  if (phone) return
  for (const def of PLAYER_DEFS) {
    const glow = new THREE.PointLight(def.color, 1.15, 5.5, 2)
    glow.position.set(def.home.x, 1.15, def.home.z)
    scene.add(glow)
  }
}

function addGallery(scene: THREE.Scene, phone = false): void {
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3d32, roughness: 0.72 })
  const steel = new THREE.MeshStandardMaterial({ color: 0x6e7884, roughness: 0.34, metalness: 0.58 })
  const concrete = new THREE.MeshStandardMaterial({ color: 0xddd4c6, roughness: 0.86 })
  const glass = new THREE.MeshStandardMaterial({
    color: 0xc5e2ff,
    transparent: true,
    opacity: 0.13,
    roughness: 0.06,
    metalness: 0.18,
    depthWrite: false,
  })
  const glassH = ROOF - KICK - 0.15
  const glassY = KICK + glassH / 2
  const thick = 0.12

  addBox(scene, wood, 0, KICK / 2, -HALF - thick / 2, ROOM + 0.4, KICK, thick, true)
  addBox(scene, wood, 0, KICK / 2, HALF + thick / 2, ROOM + 0.4, KICK, thick, true)
  addBox(scene, wood, -HALF - thick / 2, KICK / 2, 0, thick, KICK, ROOM, true)
  addBox(scene, wood, HALF + thick / 2, KICK / 2, 0, thick, KICK, ROOM, true)

  const panes: Array<[number, number, number, number, number, number]> = [
    [0, glassY, -HALF - 0.04, ROOM - 0.7, glassH, 0.05],
    [0, glassY, HALF + 0.04, ROOM - 0.7, glassH, 0.05],
    [-HALF - 0.04, glassY, 0, 0.05, glassH, ROOM - 0.7],
    [HALF + 0.04, glassY, 0, 0.05, glassH, ROOM - 0.7],
  ]
  for (const [x, y, z, w, h, d] of panes) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glass)
    pane.position.set(x, y, z)
    scene.add(pane)
  }

  const pillar = 0.46
  for (const x of [-HALF, HALF]) {
    for (const z of [-HALF, HALF]) {
      addBox(scene, concrete, x, ROOF / 2, z, pillar, ROOF, pillar, true)
    }
  }

  const mids: number[] = [0]
  for (let i = 1; i <= 3; i++) {
    const u = (HALF * i) / 4
    mids.push(-u, u)
  }
  for (const u of mids) {
    addBox(scene, steel, u, glassY, -HALF, 0.1, glassH, 0.12)
    addBox(scene, steel, u, glassY, HALF, 0.1, glassH, 0.12)
    addBox(scene, steel, -HALF, glassY, u, 0.12, glassH, 0.1)
    addBox(scene, steel, HALF, glassY, u, 0.12, glassH, 0.1)
  }

  addBox(scene, steel, 0, KICK + 0.04, -HALF, ROOM, 0.08, 0.14)
  addBox(scene, steel, 0, KICK + 0.04, HALF, ROOM, 0.08, 0.14)
  addBox(scene, steel, -HALF, KICK + 0.04, 0, 0.14, 0.08, ROOM)
  addBox(scene, steel, HALF, KICK + 0.04, 0, 0.14, 0.08, ROOM)

  addBox(scene, steel, 0, ROOF, -HALF, ROOM + 0.6, 0.16, 0.28)
  addBox(scene, steel, 0, ROOF, HALF, ROOM + 0.6, 0.16, 0.28)
  addBox(scene, steel, -HALF, ROOF, 0, 0.28, 0.16, ROOM + 0.6)
  addBox(scene, steel, HALF, ROOF, 0, 0.28, 0.16, ROOM + 0.6)

  for (const z of [-HALF * 0.62, -HALF * 0.22, HALF * 0.22, HALF * 0.62]) {
    addBox(scene, steel, 0, ROOF, z, ROOM + 0.2, 0.12, 0.18)
  }
  for (const x of [-HALF * 0.62, -HALF * 0.22, HALF * 0.22, HALF * 0.62]) {
    addBox(scene, steel, x, ROOF, 0, 0.18, 0.12, ROOM + 0.2)
  }

  const skyGlow = new THREE.MeshBasicMaterial({
    color: 0xffe0b0,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    fog: false,
  })
  const skyOff = HALF * 0.28
  for (const [x, z] of [
    [-skyOff, -skyOff],
    [skyOff, -skyOff],
    [-skyOff, skyOff],
    [skyOff, skyOff],
  ] as const) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 4.1), skyGlow)
    pane.rotation.x = Math.PI / 2
    pane.position.set(x, ROOF - 0.05, z)
    scene.add(pane)
  }

  const shade = new THREE.MeshStandardMaterial({ color: 0xf4e4c4, roughness: 0.45 })
  const bulb = new THREE.MeshStandardMaterial({
    color: 0xfff4d8,
    emissive: 0xffe2a8,
    emissiveIntensity: 1.85,
    roughness: 0.3,
  })
  const lamps: Array<[number, number]> = [
    [-HALF * 0.42, -HALF * 0.28],
    [HALF * 0.42, -HALF * 0.28],
    [-HALF * 0.42, HALF * 0.36],
    [HALF * 0.42, HALF * 0.36],
    [0, 0],
  ]
  lamps.forEach(([x, z], i) => {
    addLamp(scene, x, z, shade, bulb, steel, !phone && (i === 4 || i % 2 === 0))
  })

  for (const def of PLAYER_DEFS) {
    const mat = new THREE.MeshStandardMaterial({
      color: def.color,
      emissive: def.color,
      emissiveIntensity: 0.42,
      roughness: 0.45,
      transparent: true,
      opacity: 0.7,
    })
    const pad = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.045, 8, 28), mat)
    pad.rotation.x = -Math.PI / 2
    pad.position.set(def.home.x, 0.03, def.home.z)
    scene.add(pad)
  }

  const bannerMat = PLAYER_DEFS.map(
    (d) =>
      new THREE.MeshStandardMaterial({
        color: d.color,
        emissive: d.color,
        emissiveIntensity: 0.18,
        roughness: 0.55,
        side: THREE.DoubleSide,
      }),
  )
  const spots: Array<[number, number, number, number]> = [
    [-HALF + 0.28, 2.35, -HALF * 0.42, 0],
    [HALF - 0.28, 2.35, -HALF * 0.42, Math.PI],
    [-HALF * 0.42, 2.35, HALF - 0.28, Math.PI / 2],
    [HALF * 0.42, 2.35, -HALF + 0.28, -Math.PI / 2],
  ]
  spots.forEach(([x, y, z, rot], i) => {
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.6), bannerMat[i])
    cloth.position.set(x, y, z)
    cloth.rotation.y = rot
    scene.add(cloth)
  })
  addGallerySet(scene, phone)
}

export function buildRoom(scene: THREE.Scene, opts?: { phone?: boolean }): void {
  const phone = Boolean(opts?.phone)
  scene.background = new THREE.Color(0x3d4d86)
  scene.fog = new THREE.Fog(0x8a6e72, 36, 92)
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, phone ? 16 : 24, phone ? 10 : 16),
    new THREE.MeshBasicMaterial({
      map: makeSkyTexture(),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  )
  sky.renderOrder = -10
  scene.add(sky)

  const floorTex = makeConcreteTexture()
  floorTex.repeat.set(2.6, 2.6)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM, ROOM),
    new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.92,
      metalness: 0.02,
      color: 0xffffff,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = !phone
  scene.add(floor)

  if (!phone) addCity(scene)
  addGallery(scene, phone)

  const hemi = new THREE.HemisphereLight(0xd4dcf0, 0x4a3c36, 0.92)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xffc089, 1.38)
  sun.position.set(9, 7.5, -11)
  if (!phone) {
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = -(HALF + 3)
    sun.shadow.camera.right = HALF + 3
    sun.shadow.camera.top = HALF + 3
    sun.shadow.camera.bottom = -(HALF + 3)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 36
  }
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0xffe4c8, 0.78)
  fill.position.set(-8, 5, 6)
  scene.add(fill)
  const rim = new THREE.DirectionalLight(0x8eb4ff, 0.52)
  rim.position.set(6, 3.2, -8)
  scene.add(rim)
  scene.add(new THREE.AmbientLight(0x8a96aa, 0.42))
}

export function makePaintFloor(texture: THREE.CanvasTexture): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    roughness: 0.38,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ROOM, ROOM), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.012
  mesh.receiveShadow = true
  return mesh
}

export function makeWetFloor(texture: THREE.CanvasTexture): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    roughness: 0.08,
    metalness: 0.16,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(ROOM, ROOM), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.016
  mesh.receiveShadow = false
  return mesh
}
