import * as THREE from 'three'

export function createSprayer(color: number): THREE.Group {
  const g = new THREE.Group()
  const mat = (params: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(params)
  const suit = mat({ color: 0x4b5868, roughness: 0.42, metalness: 0.22 })
  const paint = mat({ color, roughness: 0.32, metalness: 0.18 })
  const paintSoft = mat({ color, roughness: 0.48, metalness: 0.1 })
  const darkPaint = mat({
    color: new THREE.Color(color).multiplyScalar(0.62),
    roughness: 0.38,
    metalness: 0.14,
  })
  const metal = mat({ color: 0xb7c2cc, roughness: 0.28, metalness: 0.72 })
  const boot = mat({ color: 0x12151a, roughness: 0.7 })
  const visor = mat({
    color: 0x102030,
    emissive: color,
    emissiveIntensity: 0.7,
    roughness: 0.08,
    metalness: 0.7,
  })
  const glow = mat({
    color,
    emissive: color,
    emissiveIntensity: 0.95,
    roughness: 0.3,
  })

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.015
  g.add(shadow)

  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.26), boot)
    foot.position.set(side * 0.11, 0.05, 0.04)
    foot.castShadow = true
    g.add(foot)
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8), paint)
    cuff.position.set(side * 0.11, 0.1, 0.02)
    g.add(cuff)

    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.16, 4, 8), suit)
    calf.position.set(side * 0.11, 0.2, 0.01)
    calf.castShadow = true
    g.add(calf)

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.14, 4, 8), suit)
    thigh.position.set(side * 0.1, 0.38, 0)
    thigh.castShadow = true
    g.add(thigh)
  }

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), suit)
  hips.scale.set(1.15, 0.72, 0.95)
  hips.position.y = 0.5
  hips.castShadow = true
  g.add(hips)

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.28, 6, 12), suit)
  torso.position.y = 0.72
  torso.castShadow = true
  g.add(torso)

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.26), paint)
  stripe.position.set(0, 0.74, 0.1)
  g.add(stripe)

  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 16), paintSoft)
  belt.rotation.x = Math.PI / 2
  belt.position.y = 0.54
  g.add(belt)

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), darkPaint)
    shoulder.position.set(side * 0.22, 0.86, 0)
    shoulder.castShadow = true
    g.add(shoulder)
  }

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.22, 4, 8), suit)
  leftArm.position.set(-0.26, 0.68, 0.02)
  leftArm.rotation.z = 0.35
  leftArm.castShadow = true
  g.add(leftArm)

  const leftGlove = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), paint)
  leftGlove.position.set(-0.3, 0.52, 0.06)
  g.add(leftGlove)

  const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.2, 4, 8), suit)
  rightArm.position.set(0.24, 0.7, 0.12)
  rightArm.rotation.set(-0.55, 0, -0.45)
  rightArm.castShadow = true
  g.add(rightArm)

  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.175, 0.46, 14), paint)
  tank.position.set(0, 0.72, -0.22)
  tank.castShadow = true
  g.add(tank)

  const tankBand = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 16), metal)
  tankBand.position.set(0, 0.72, -0.22)
  g.add(tankBand)

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), paint)
  cap.position.set(0, 0.94, -0.22)
  g.add(cap)

  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8), metal)
  valve.position.set(0, 1.08, -0.22)
  g.add(valve)

  const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.04), darkPaint)
  strapL.position.set(-0.1, 0.74, -0.08)
  strapL.rotation.x = 0.35
  g.add(strapL)
  const strapR = strapL.clone()
  strapR.position.x = 0.1
  g.add(strapR)

  const hose = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.08, 0.62, -0.22),
        new THREE.Vector3(0.18, 0.58, -0.04),
        new THREE.Vector3(0.22, 0.56, 0.16),
        new THREE.Vector3(0.22, 0.52, 0.32),
      ]),
      12,
      0.022,
      6,
      false,
    ),
    darkPaint,
  )
  g.add(hose)

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), suit)
  helmet.scale.set(1.02, 0.88, 1.12)
  helmet.position.y = 1.04
  helmet.castShadow = true
  g.add(helmet)

  const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.055, 8, 18, Math.PI * 1.2), visor)
  wrap.rotation.x = Math.PI / 2
  wrap.rotation.z = Math.PI
  wrap.position.set(0, 1.03, 0.07)
  g.add(wrap)

  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.11, 0.07), visor)
  lens.position.set(0, 1.03, 0.17)
  g.add(lens)

  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 8), paintSoft)
  fin.position.set(0, 1.22, -0.08)
  fin.rotation.x = -0.55
  fin.castShadow = true
  g.add(fin)

  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), glow)
  earL.position.set(-0.18, 1.08, 0)
  g.add(earL)
  const earR = earL.clone()
  earR.position.x = 0.18
  g.add(earR)

  const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.82, 8), metal)
  wand.rotation.x = Math.PI / 2.35
  wand.position.set(0.22, 0.62, 0.28)
  wand.castShadow = true
  g.add(wand)

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.12), boot)
  grip.position.set(0.22, 0.58, 0.12)
  g.add(grip)

  const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.13, 10), paint)
  nozzle.rotation.x = Math.PI / 2
  nozzle.position.set(0.22, 0.5, 0.68)
  g.add(nozzle)

  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), glow)
  muzzle.position.set(0.22, 0.5, 0.74)
  g.add(muzzle)

  g.userData.nozzle = nozzle
  return g
}

export function nozzleWorld(mesh: THREE.Group, target: THREE.Vector3): THREE.Vector3 {
  const nozzle = mesh.userData.nozzle as THREE.Mesh
  nozzle.getWorldPosition(target)
  return target
}
