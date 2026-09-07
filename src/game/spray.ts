import * as THREE from 'three'
import { JET_FLOOR_Y } from './constants.ts'
import { jetHit } from './math.ts'

const RIBBON_VERT = `
uniform float uTime;
uniform float uNozzleY;
uniform float uFloorY;
uniform float uLen;
uniform float uWidth;
uniform float uAxis;
varying vec2 vUv;
varying float vAlong;
varying float vAcross;

void main() {
  vUv = uv;
  vAlong = uv.y;
  vAcross = position.x;
  float t = uv.y;
  vec3 origin = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
  vec3 along = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  float dist = t * uLen;
  float yEnd = uFloorY;
  vec3 center = origin + along * dist;
  center.y = mix(uNozzleY, yEnd, t * t);

  vec3 tangent = normalize(vec3(along.x, 2.0 * t * (yEnd - uNozzleY) / max(uLen, 0.2), along.z));
  vec3 horiz = cross(tangent, vec3(0.0, 1.0, 0.0));
  float hl = length(horiz);
  horiz = hl > 1.0e-4 ? horiz / hl : vec3(1.0, 0.0, 0.0);
  vec3 vert = normalize(cross(horiz, tangent));
  vec3 side = uAxis < 0.5 ? horiz : vert;

  float pulse = sin(t * 31.0 + uTime * 19.0);
  center += side * pulse * t * t * 0.016;
  center.y += abs(sin(t * 27.0 + uTime * 14.0)) * t * t * 0.01;

  float neck = mix(0.62, 1.0, smoothstep(0.0, 0.07, t));
  float flare = mix(1.0, 1.35, t * t);
  float wobble = 1.0 + 0.07 * sin(t * 52.0 - uTime * 38.0);
  vec3 pos = center + side * position.x * uWidth * neck * flare * wobble;
  vUv.x = position.x + 0.5;
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}
`

const RIBBON_FRAG = `
uniform vec3 uColor;
uniform float uTime;
uniform float uClash;
uniform float uSoft;
varying vec2 vUv;
varying float vAlong;
varying float vAcross;

void main() {
  float t = vAlong;
  float across = abs(vUv.x * 2.0 - 1.0);
  float coreW = mix(0.16, 0.58, t * t);
  float core = 1.0 - smoothstep(0.0, coreW, across);
  float rim = smoothstep(0.2, 0.0, abs(across - mix(0.12, 0.38, t)));
  float flow = 0.82 + 0.18 * sin((vUv.x * 14.0 + t * 36.0) - uTime * 26.0);
  float streaks = 0.7 + 0.3 * pow(abs(sin(vUv.x * 9.0 + t * 22.0 - uTime * 18.0)), 4.0);
  float atom = 1.0 - smoothstep(0.58, 0.97, t);
  float holes = 1.0;
  if (t > 0.52) {
    float n = sin(t * 70.0 + uTime * 24.0 + vUv.x * 28.0);
    holes = mix(1.0, smoothstep(-0.15, 0.55, n), smoothstep(0.52, 0.82, t));
  }
  float nose = 1.0 - smoothstep(0.0, 0.045, t);
  float dens = (core * 1.05 * flow * streaks + rim * 0.28) * atom * holes;
  dens += nose * 0.7;
  dens *= mix(1.0, 1.12, uClash);
  vec3 paint = mix(uColor * 0.4, uColor * 1.08, core);
  paint = mix(paint, vec3(0.96, 0.97, 0.94), rim * 0.42 + nose * 0.25);
  float alpha = dens * mix(1.0, 0.24, uSoft);
  if (alpha < 0.035) discard;
  gl_FragColor = vec4(paint, clamp(alpha, 0.0, 1.0));
}
`

const SPLASH_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const SPLASH_FRAG = `
uniform vec3 uColor;
uniform float uPulse;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  if (d > 1.0) discard;
  float ang = atan(p.y, p.x);
  float fingers = pow(abs(sin(ang * 9.0 + uPulse * 2.2)), 2.8);
  float puddle = pow(smoothstep(1.0, 0.08, d), 1.15);
  float crown = smoothstep(0.18, 0.0, abs(d - (0.34 + fingers * 0.28 + uPulse * 0.04)));
  float rim = smoothstep(0.1, 0.0, abs(d - 0.82)) * fingers;
  float specks = smoothstep(0.1, 0.0, abs(d - 0.62 - fingers * 0.12));
  float alpha = puddle * 0.42 + crown * 0.4 + rim * 0.18 + specks * 0.12;
  alpha *= 0.7 + 0.3 * uPulse;
  vec3 col = mix(uColor * 0.48, uColor, puddle);
  col = mix(col, vec3(1.0), crown * 0.2);
  gl_FragColor = vec4(col, alpha);
}
`

function ribbonGeo(segs: number): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    pos.push(-0.5, 0, t, 0.5, 0, t)
    uv.push(0, t, 1, t)
    if (i < segs) {
      const a = i * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeBoundingSphere()
  return geo
}

function jetMat(color: number, soft: boolean, width: number, axis: number): THREE.ShaderMaterial {
  const c = new THREE.Color(color)
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Vector3(c.r, c.g, c.b) },
      uTime: { value: 0 },
      uClash: { value: 0 },
      uSoft: { value: soft ? 1 : 0 },
      uNozzleY: { value: 0.5 },
      uFloorY: { value: JET_FLOOR_Y },
      uLen: { value: 1 },
      uWidth: { value: width },
      uAxis: { value: axis },
    },
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  })
}

function splashMat(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPulse: { value: 0 },
    },
    vertexShader: SPLASH_VERT,
    fragmentShader: SPLASH_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

export function createSprayJet(color: number): THREE.Group {
  const g = new THREE.Group()
  const stream = new THREE.Group()
  const geo = ribbonGeo(28)
  const coreA = new THREE.Mesh(geo, jetMat(color, false, 0.044, 0))
  const coreB = new THREE.Mesh(geo, jetMat(color, false, 0.044, 1))
  const mistA = new THREE.Mesh(geo, jetMat(color, true, 0.082, 0))
  const mistB = new THREE.Mesh(geo, jetMat(color, true, 0.082, 1))
  const splash = new THREE.Mesh(new THREE.CircleGeometry(1, 28), splashMat(color))
  splash.rotation.x = -Math.PI / 2
  const crown = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.78, 22), splashMat(color))
  crown.rotation.x = -Math.PI / 2
  const muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(0.038, 8, 8),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  )
  coreA.renderOrder = 7
  coreB.renderOrder = 7
  mistA.renderOrder = 5
  mistB.renderOrder = 5
  splash.renderOrder = 3
  crown.renderOrder = 4
  muzzle.renderOrder = 8
  stream.add(mistA, mistB, coreA, coreB, muzzle)
  g.add(stream, splash, crown)
  g.userData.stream = stream
  g.userData.ribbons = [coreA, coreB, mistA, mistB]
  g.userData.splash = splash
  g.userData.crown = crown
  g.userData.muzzle = muzzle
  g.frustumCulled = false
  stream.frustumCulled = false
  for (const m of [coreA, coreB, mistA, mistB, splash, crown, muzzle]) m.frustumCulled = false
  g.visible = false
  return g
}

export function updateSprayJet(
  jet: THREE.Group,
  nozzle: THREE.Vector3,
  aim: number,
  len: number,
  spraying: boolean,
  clashing: boolean,
  time: number,
): void {
  jet.visible = spraying
  if (!spraying) return
  const hit = jetHit(nozzle.x, nozzle.z, aim, len)
  const L = hit.len
  const stream = jet.userData.stream as THREE.Group
  stream.position.copy(nozzle)
  stream.rotation.set(0, -aim + Math.PI / 2, 0)
  const clash = clashing ? 1 : 0
  for (const mesh of jet.userData.ribbons as THREE.Mesh[]) {
    const mat = mesh.material as THREE.ShaderMaterial
    mat.uniforms.uTime.value = time
    mat.uniforms.uClash.value = clash
    mat.uniforms.uNozzleY.value = nozzle.y
    mat.uniforms.uFloorY.value = JET_FLOOR_Y
    mat.uniforms.uLen.value = L
  }
  const hitX = hit.x
  const hitZ = hit.z
  const splash = jet.userData.splash as THREE.Mesh
  const crown = jet.userData.crown as THREE.Mesh
  const pulse = 0.5 + 0.5 * Math.sin(time * 20)
  const s = (clashing ? 1.28 : 1) * (0.38 + L * 0.12)
  splash.position.set(hitX, 0.014, hitZ)
  splash.scale.setScalar(s)
  ;(splash.material as THREE.ShaderMaterial).uniforms.uPulse.value = pulse
  crown.position.set(hitX, 0.02, hitZ)
  crown.scale.setScalar(s * (0.9 + pulse * 0.18))
  ;(crown.material as THREE.ShaderMaterial).uniforms.uPulse.value = pulse
  const muzzle = jet.userData.muzzle as THREE.Mesh
  const ms = 0.85 + 0.2 * Math.sin(time * 42)
  muzzle.scale.setScalar(ms * (clashing ? 1.25 : 1))
  const mm = muzzle.material as THREE.MeshBasicMaterial
  mm.opacity = 0.55 + 0.3 * pulse
}
