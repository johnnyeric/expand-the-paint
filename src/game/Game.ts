import * as THREE from 'three'
import { startingAim, updateBot } from './bots.ts'
import {
  resolveClashes,
  separatePlayers,
  stepMovement,
  syncMesh,
} from './combat.ts'
import {
  CAM_FOV,
  CLASH_COST,
  COVER_OUT,
  DRAIN_RATE,
  PAINT_RES,
  PLAYER_DEFS,
  REFILL_RATE,
  ROUND_SECONDS,
  SPRAY_COST,
  SPRAY_RANGE,
  TANK_MAX,
  type PlayerId,
} from './constants.ts'
import { Input } from './input.ts'
import { lerp } from './math.ts'
import {
  NetPlay,
  roomFromUrl,
  roomUrl,
  slotLabel,
  type ActorSnap,
  type StateMsg,
} from './net.ts'
import { PaintGrid } from './paint.ts'
import { Droplets } from './particles.ts'
import { buildRoom, makePaintFloor, makeWetFloor } from './room.ts'
import { isPhone } from './gfx.ts'
import { createSprayer } from './sprayer.ts'
import { createSprayJet, updateSprayJet } from './spray.ts'
import { SpraySim } from './spraySim.ts'
import type { Actor } from './types.ts'
import {
  chasePose,
  drawMinimap,
  finishRound,
  followCamera,
  placeLabel,
  updateHud,
  updateHuman,
} from './view.ts'

type Phase = 'start' | 'play' | 'end'

export class Game {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.08, 160)
  private readonly clock = new THREE.Clock()
  private readonly input: Input
  private readonly paint: PaintGrid
  private readonly paintTex: THREE.CanvasTexture
  private readonly wetTex: THREE.CanvasTexture
  private readonly droplets: Droplets
  private readonly spray = new SpraySim()
  private paintTurn = 0
  private readonly phone = isPhone()
  private readonly nozzle = new THREE.Vector3()
  private readonly camPos = new THREE.Vector3()
  private readonly camLook = new THREE.Vector3()
  private readonly clashRing: THREE.Mesh
  private clashLife = 0
  private readonly actors: Actor[] = []
  private phase: Phase = 'start'
  private remaining = ROUND_SECONDS
  private hintT = 0
  private nextOutPlace = 4
  private endHow: 'timer' | 'last' = 'timer'
  private readonly net = new NetPlay()
  private collectingStamps = false
  private netAcc = 0
  private mapTick = 0
  private readonly minimap: CanvasRenderingContext2D
  private readonly els: {
    timer: HTMLElement
    tank: HTMLElement
    tankFill: HTMLElement
    tankWrap: HTMLElement
    status: HTMLElement
    start: HTMLElement
    join: HTMLElement
    lobby: HTMLElement
    end: HTMLElement
    endTitle: HTMLElement
    endBody: HTMLElement
    scores: HTMLElement
    out: HTMLElement
    outTitle: HTMLElement
    outBody: HTMLElement
    hint: HTMLElement
    cover: HTMLElement[]
    startError: HTMLElement
    joinCode: HTMLInputElement
    joinError: HTMLElement
    roomCode: HTMLElement
    lobbySlots: HTMLElement
    lobbyStatus: HTMLElement
    lobbyRole: HTMLElement
    lobbyTitle: HTMLElement
    lobbyStart: HTMLButtonElement
    copyLink: HTMLButtonElement
  }

  constructor(canvas: HTMLCanvasElement) {
    const phone = this.phone
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !phone,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, phone ? 1.25 : 1.75))
    this.renderer.setClearColor(0x3d4d86, 1)
    this.renderer.shadowMap.enabled = !phone
    this.renderer.shadowMap.type = phone ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.12

    buildRoom(this.scene, { phone })
    this.paint = new PaintGrid(PAINT_RES, phone ? 384 : 512)
    this.paintTex = new THREE.CanvasTexture(this.paint.canvas)
    this.paintTex.colorSpace = THREE.SRGBColorSpace
    this.paintTex.anisotropy = phone ? 1 : 8
    this.paintTex.flipY = false
    this.scene.add(makePaintFloor(this.paintTex))
    this.wetTex = new THREE.CanvasTexture(this.paint.wetCanvas)
    this.wetTex.colorSpace = THREE.SRGBColorSpace
    this.wetTex.anisotropy = phone ? 1 : 4
    this.wetTex.flipY = false
    this.scene.add(makeWetFloor(this.wetTex))
    this.droplets = new Droplets(phone ? 420 : 1400)
    this.scene.add(this.droplets.mesh)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.62, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.05
    this.scene.add(ring)
    this.clashRing = ring

    const stamp = this.paint.stamp.bind(this.paint)
    this.paint.stamp = (x, z, radius, owner, rgb, seed, lite, amount) => {
      stamp(x, z, radius, owner, rgb, seed, lite, amount)
      if (this.collectingStamps && this.net.role === 'host') {
        this.net.pushStamp(x, z, radius, owner, seed, amount ?? 255)
      }
    }

    canvas.style.transform = 'translateZ(0)'
    this.input = new Input(canvas)
    this.minimap = (document.querySelector('#minimap') as HTMLCanvasElement).getContext('2d')!

    this.els = {
      timer: document.querySelector('#timer')!,
      tank: document.querySelector('#tank-readout')!,
      tankFill: document.querySelector('#tank-fill')!,
      tankWrap: document.querySelector('#tank')!,
      status: document.querySelector('#status')!,
      start: document.querySelector('#start')!,
      join: document.querySelector('#join')!,
      lobby: document.querySelector('#lobby')!,
      end: document.querySelector('#end')!,
      endTitle: document.querySelector('#end-title')!,
      endBody: document.querySelector('#end-body')!,
      scores: document.querySelector('#end-scores')!,
      out: document.querySelector('#out')!,
      outTitle: document.querySelector('#out-title')!,
      outBody: document.querySelector('#out-body')!,
      hint: document.querySelector('#hint')!,
      cover: [1, 2, 3, 4].map((id) => document.querySelector(`#cover-${id}`) as HTMLElement),
      startError: document.querySelector('#start-error')!,
      joinCode: document.querySelector('#join-code') as HTMLInputElement,
      joinError: document.querySelector('#join-error')!,
      roomCode: document.querySelector('#room-code')!,
      lobbySlots: document.querySelector('#lobby-slots')!,
      lobbyStatus: document.querySelector('#lobby-status')!,
      lobbyRole: document.querySelector('#lobby-role')!,
      lobbyTitle: document.querySelector('#lobby-title')!,
      lobbyStart: document.querySelector('#lobby-start') as HTMLButtonElement,
      copyLink: document.querySelector('#copy-link') as HTMLButtonElement,
    }

    this.net.onLobby = (humans) => this.syncHumans(humans)
    this.net.onStart = () => this.startRound(true)
    this.net.onAgain = () => {
      if (this.net.role === 'host') this.startRound(true)
    }
    this.net.onState = (msg) => this.applyNetState(msg)
    this.net.onError = (message) => {
      this.backToStart(message)
    }

    this.spawnActors()
    this.resetPaint()
    this.refreshHud()
    this.layout()
    window.addEventListener('resize', () => this.layout())
    window.visualViewport?.addEventListener('resize', () => this.layout())
    this.bindButton('#play', () => this.startRound(false))
    this.bindButton('#again', () => this.onAgain())
    this.bindButton('#host', () => void this.beginHost())
    this.bindButton('#join-open', () => this.openJoin())
    this.bindButton('#join-go', () => void this.beginJoin())
    this.bindButton('#join-back', () => this.backToStart())
    this.bindButton('#lobby-start', () => this.startRound(false))
    this.bindButton('#lobby-leave', () => this.leaveRoom())
    this.bindButton('#copy-link', () => void this.copyLink())
    this.els.joinCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        void this.beginJoin()
      }
    })
    this.els.joinCode.addEventListener('input', () => {
      this.els.joinCode.value = this.els.joinCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
    })

    const you = this.you()
    const pose = chasePose(you)
    this.camera.position.set(pose.x, pose.y, pose.z)
    this.camera.lookAt(pose.lx, pose.ly, pose.lz)
    if (import.meta.env.DEV) {
      const self = this
      Object.defineProperty(globalThis, '__paintDebug', {
        get: () => {
          const a = self.you()
          return {
            x: a.x,
            z: a.z,
            aim: a.aim,
            tank: a.tank,
            place: a.place,
            cover: self.paint.coverage(a.id),
            camX: self.camera.position.x,
            camY: self.camera.position.y,
            camZ: self.camera.position.z,
            fov: self.camera.fov,
          }
        },
        configurable: true,
      })
      Object.defineProperty(globalThis, '__paintTank', {
        value: (n: number) => {
          self.you().tank = n
        },
        configurable: true,
      })
      Object.defineProperty(globalThis, '__paintWipe', {
        value: () => {
          const id = self.you().id
          const g = self.paint
          for (let i = 0; i < g.cells.length; i++) {
            if (g.cells[i] !== id) continue
            g.counts[id]--
            g.counts[0]++
            g.cells[i] = 0
            g.coat[i] = 0
            g.ink[i] = 0
          }
        },
        configurable: true,
      })
      Object.defineProperty(globalThis, '__paintWarp', {
        value: (x: number, z: number, aim: number) => {
          const a = self.you()
          a.x = x
          a.z = z
          a.aim = aim
          const pose = chasePose(a)
          self.camera.position.set(pose.x, pose.y, pose.z)
          self.camera.lookAt(pose.lx, pose.ly, pose.lz)
        },
        configurable: true,
      })
      Object.defineProperty(globalThis, '__paintSolo', {
        value: () => {
          const you = self.you()
          for (const a of self.actors) {
            if (a === you) continue
            a.spraying = false
            a.human = true
            a.tank = 0
          }
        },
        configurable: true,
      })
    }
    const pending = roomFromUrl()
    if (pending) void this.beginJoin(pending)
    this.tick()
  }

  private you(): Actor {
    return this.actors[this.net.localId - 1] ?? this.actors[0]
  }

  private spawnActors(): void {
    for (const def of PLAYER_DEFS) {
      const mesh = createSprayer(def.color)
      this.scene.add(mesh)
      const beam = createSprayJet(def.color)
      this.scene.add(beam)
      const actor: Actor = {
        id: def.id,
        name: def.name,
        hex: def.hex,
        rgb: def.rgb,
        color: def.color,
        human: def.human,
        x: def.spawn.x,
        z: def.spawn.z,
        vx: 0,
        vz: 0,
        aim: startingAim(def.id),
        lagAim: startingAim(def.id),
        tank: TANK_MAX,
        place: 0,
        spraying: false,
        sprayLen: SPRAY_RANGE,
        clashing: false,
        moveX: 0,
        moveZ: 0,
        homeX: def.home.x,
        homeZ: def.home.z,
        t: 0,
        stuck: 0,
        stuckTravel: 0,
        lx: def.spawn.x,
        lz: def.spawn.z,
        goalX: def.spawn.x,
        goalZ: def.spawn.z,
        goalLife: 0,
        goalKind: 0,
        mesh,
        beam,
      }
      this.actors.push(actor)
      this.poseActor(actor, false)
    }
  }

  private resetPaint(): void {
    const was = this.collectingStamps
    this.collectingStamps = false
    this.paint.clear()
    for (const a of this.actors) {
      this.paint.paintHome(a.homeX, a.homeZ, a.id, a.rgb)
      this.paint.stamp(a.x, a.z, 1.7, a.id, a.rgb, a.id * 11)
    }
    const blue = this.actors[0]
    const yellow = this.actors[1]
    for (let x = -3.0; x <= -0.4; x += 0.35) {
      this.paint.stamp(x, blue.z, 1.15, blue.id, blue.rgb, (x * 40) | 0)
    }
    for (let x = 0.4; x <= 3.0; x += 0.35) {
      this.paint.stamp(x, yellow.z, 1.15, yellow.id, yellow.rgb, (x * 40) | 0)
    }
    this.paintTex.needsUpdate = true
    this.wetTex.needsUpdate = true
    this.collectingStamps = was
    this.spray.reset()
  }

  private bindButton(selector: string, fn: () => void): void {
    const btn = document.querySelector(selector)
    if (!(btn instanceof HTMLElement)) return
    let fromPointer = false
    const start = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      fn()
    }
    btn.addEventListener('pointerup', (e) => {
      if (e.button > 0) return
      fromPointer = true
      start(e)
      window.setTimeout(() => {
        fromPointer = false
      }, 400)
    })
    btn.addEventListener('click', (e) => {
      if (fromPointer) {
        e.preventDefault()
        return
      }
      start(e)
    })
  }

  private onAgain(): void {
    if (this.net.role === 'guest') {
      this.net.requestStart()
      this.els.endBody.textContent = 'Waiting for the host to start the next round…'
      return
    }
    this.startRound(false)
  }

  private startRound(fromNet: boolean): void {
    if (this.net.role === 'guest' && !fromNet) {
      this.net.requestStart()
      return
    }
    this.phase = 'play'
    this.remaining = ROUND_SECONDS
    this.hintT = 8
    document.body.classList.add('playing')
    const you = this.you()
    if (this.input.preferTouch() || this.input.usingTouch) {
      this.els.hint.textContent = 'Left stick moves. Hold the right stick to aim and spray.'
    } else if (this.net.role !== 'offline') {
      this.els.hint.textContent = `You are ${you.name}. Move the mouse to look around. Hold click to spray.`
    } else {
      this.els.hint.textContent =
        'Move the mouse to look around. Hold click to spray. Paint a path if you wander off colour.'
    }
    this.els.start.classList.add('hidden')
    this.els.join.classList.add('hidden')
    this.els.lobby.classList.add('hidden')
    this.els.end.classList.add('hidden')
    this.els.out.classList.add('hidden')
    this.input.beginLook()
    this.nextOutPlace = 4
    this.endHow = 'timer'
    for (const a of this.actors) {
      const def = PLAYER_DEFS[a.id - 1]
      a.x = def.spawn.x
      a.z = def.spawn.z
      a.vx = 0
      a.vz = 0
      a.tank = TANK_MAX
      a.place = 0
      a.aim = startingAim(a.id)
      a.lagAim = a.aim
      a.spraying = false
      a.clashing = false
      a.moveX = 0
      a.moveZ = 0
      a.t = 0
      a.stuck = 0
      a.stuckTravel = 0
      a.lx = def.spawn.x
      a.lz = def.spawn.z
      a.goalX = def.spawn.x
      a.goalZ = def.spawn.z
      a.goalLife = 0
      a.goalKind = 0
    }
    this.syncHumans(this.net.role === 'offline' ? [1] : this.net.humanIds)
    this.resetPaint()
    this.collectingStamps = this.net.role === 'host'
    const pose = chasePose(you)
    this.camera.position.set(pose.x, pose.y, pose.z)
    this.camera.lookAt(pose.lx, pose.ly, pose.lz)
    this.clock.getDelta()
    if (this.net.role === 'host') {
      this.net.broadcastStart()
      this.netAcc = 0.05
    }
  }

  private async beginHost(): Promise<void> {
    this.els.start.classList.add('hidden')
    this.els.join.classList.add('hidden')
    this.els.lobby.classList.remove('hidden')
    this.els.lobbyStatus.textContent = 'Opening room…'
    this.els.lobbyStart.disabled = true
    try {
      const code = await this.net.host()
      this.els.roomCode.textContent = code
      this.els.lobbyStart.disabled = false
      this.syncHumans(this.net.humanIds)
    } catch (err) {
      this.backToStart(err instanceof Error ? err.message : 'Could not host.')
    }
  }

  private openJoin(): void {
    this.els.start.classList.add('hidden')
    this.els.lobby.classList.add('hidden')
    this.els.join.classList.remove('hidden')
    this.els.joinError.classList.add('hidden')
    this.els.joinCode.value = roomFromUrl() ?? ''
    this.els.joinCode.focus()
  }

  private async beginJoin(code = this.els.joinCode.value): Promise<void> {
    this.els.joinError.classList.add('hidden')
    this.els.join.classList.add('hidden')
    this.els.start.classList.add('hidden')
    this.els.lobby.classList.remove('hidden')
    this.els.lobbyStatus.textContent = 'Joining…'
    this.els.lobbyStart.disabled = true
    this.els.roomCode.textContent = code.toUpperCase()
    try {
      await this.net.join(code)
      this.els.roomCode.textContent = this.net.code
      this.syncHumans(this.net.humanIds)
    } catch (err) {
      this.openJoin()
      this.showJoinError(err instanceof Error ? err.message : 'Could not join.')
    }
  }

  private leaveRoom(): void {
    this.net.leave()
    this.syncHumans([1])
    this.backToStart()
  }

  private backToStart(message?: string): void {
    this.phase = 'start'
    document.body.classList.remove('playing')
    this.input.endLook()
    this.els.lobby.classList.add('hidden')
    this.els.join.classList.add('hidden')
    this.els.end.classList.add('hidden')
    this.els.out.classList.add('hidden')
    this.els.start.classList.remove('hidden')
    if (message) {
      this.els.startError.textContent = message
      this.els.startError.classList.remove('hidden')
    } else {
      this.els.startError.classList.add('hidden')
    }
  }

  private showJoinError(message: string): void {
    this.els.joinError.textContent = message
    this.els.joinError.classList.remove('hidden')
  }

  private async copyLink(): Promise<void> {
    const url = roomUrl(this.net.code)
    try {
      await navigator.clipboard.writeText(url)
      this.els.copyLink.textContent = 'Copied'
      window.setTimeout(() => {
        this.els.copyLink.textContent = 'Copy link'
      }, 1400)
    } catch {
      window.prompt('Copy this join link', url)
    }
  }

  private syncHumans(humans: PlayerId[]): void {
    for (const a of this.actors) {
      a.human = humans.includes(a.id)
    }
    this.renderLobby()
  }

  private renderLobby(): void {
    if (this.els.lobby.classList.contains('hidden')) return
    const host = this.net.role === 'host'
    const code = this.net.code || this.els.roomCode.textContent || ''
    this.els.roomCode.textContent = code
    this.els.lobbyRole.textContent = host ? 'Host' : 'Joined'
    this.els.lobbyTitle.textContent = code ? `Room ${code}` : 'Room'
    this.els.lobbyStart.classList.toggle('hidden', !host)
    this.els.lobbyStart.disabled = !host
    this.els.lobbyStatus.textContent = host
      ? 'Share the code. Empty slots stay bots. Start whenever you like.'
      : `You are ${this.you().name}. Waiting for the host to start…`
    const humans = this.net.humanIds
    this.els.lobbySlots.innerHTML = PLAYER_DEFS.map((def) => {
      const live = humans.includes(def.id)
      const you = def.id === this.net.localId
      return `<li class="${live ? 'in' : 'bot'}"><span class="dot" style="background:${def.hex}"></span>${slotLabel(def.id, humans, this.net.localId)}${you ? '' : ''}</li>`
    }).join('')
  }

  private applyNetState(msg: StateMsg): void {
    if (this.net.role !== 'guest') return
    this.remaining = msg.remaining
    this.syncHumans(msg.humans)
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i]
      const s = msg.actors[i]
      if (!s) continue
      const self = a.id === this.net.localId
      if (self) {
        const err = Math.hypot(s.x - a.x, s.z - a.z)
        if (err > 4.2) {
          a.x = s.x
          a.z = s.z
        } else if (err > 1.15) {
          a.x = lerp(a.x, s.x, 0.28)
          a.z = lerp(a.z, s.z, 0.28)
        } else if (err > 0.28) {
          a.x = lerp(a.x, s.x, 0.12)
          a.z = lerp(a.z, s.z, 0.12)
        }
        if (s.cl === 1) {
          a.vx = s.vx
          a.vz = s.vz
        }
        const tankErr = Math.abs(s.tank - a.tank)
        if (tankErr > 14) a.tank = lerp(a.tank, s.tank, 0.4)
        else a.tank = lerp(a.tank, s.tank, 0.12)
      } else {
        a.x = lerp(a.x, s.x, 0.38)
        a.z = lerp(a.z, s.z, 0.38)
        a.aim = s.aim
        a.spraying = s.sp === 1
        a.moveX = s.mx
        a.moveZ = s.mz
        a.vx = s.vx
        a.vz = s.vz
        a.tank = s.tank
      }
      a.clashing = s.cl === 1
      a.sprayLen = s.sl
      const wasOut = a.place > 0
      a.place = s.pl ?? 0
      if (self && a.place > 0 && !wasOut) this.showOut(a)
      if (a.place > 0) {
        a.spraying = false
        a.moveX = 0
        a.moveZ = 0
      }
    }
    for (const st of msg.stamps) {
      const def = PLAYER_DEFS[st.id - 1]
      this.paint.stamp(st.x, st.z, st.r, st.id, def.rgb, st.s, this.phone, st.a ?? 255)
    }
    if (msg.counts && msg.counts.length === 5) {
      for (let i = 0; i < 5; i++) this.paint.counts[i] = msg.counts[i]
    }
    if (msg.phase === 'end' && this.phase === 'play') {
      this.phase = 'end'
      this.collectingStamps = false
      document.body.classList.remove('playing')
      this.input.endLook()
      this.els.out.classList.add('hidden')
      this.endHow = msg.how ?? 'timer'
      finishRound(this.you(), this.actors, this.paint, this.els, this.endHow)
    }
  }

  private actorSnaps(): ActorSnap[] {
    return this.actors.map((a) => ({
      x: a.x,
      z: a.z,
      vx: a.vx,
      vz: a.vz,
      aim: a.aim,
      tank: a.tank,
      sp: a.spraying && a.tank > 0 ? 1 : 0,
      cl: a.clashing ? 1 : 0,
      mx: a.moveX,
      mz: a.moveZ,
      sl: a.sprayLen,
      pl: a.place,
    }))
  }

  private layout(): void {
    const vv = window.visualViewport
    const w = Math.round(vv?.width ?? window.innerWidth)
    const h = Math.round(vv?.height ?? window.innerHeight)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / Math.max(h, 1)
    this.camera.updateProjectionMatrix()
  }

  private tick = (): void => {
    requestAnimationFrame(this.tick)
    const dt = Math.min(this.clock.getDelta(), 0.05)
    if (this.phase === 'play') this.updatePlay(dt)
    else this.updateIdle(dt)
    this.droplets.update(dt)
    this.paint.tickWet(dt)
    if (this.paint.dirty) {
      this.paintTex.needsUpdate = true
      this.paint.dirty = false
    }
    if (this.paint.wetDirty) {
      this.wetTex.needsUpdate = true
      this.paint.wetDirty = false
    }
    this.mapTick++
    if (!this.phone || this.mapTick % 5 === 0) {
      drawMinimap(this.minimap, this.actors, this.paint)
    }
    this.renderer.render(this.scene, this.camera)
  }

  private updateIdle(dt: number): void {
    for (const a of this.actors) a.t += dt
    followCamera(this.you(), dt * 0.6, this.camera, this.camPos, this.camLook, this.phone ? 6.5 : 8)
    for (const a of this.actors) this.poseActor(a, false)
  }

  private updatePlay(dt: number): void {
    if (this.net.role === 'guest') {
      this.updateGuest(dt)
      return
    }

    this.remaining -= dt
    this.hintT -= dt
    if (this.remaining <= 0) {
      this.closeRound('timer')
      return
    }

    const local = this.you()
    for (const a of this.actors) a.t += dt
    updateHuman(local, this.input, dt)

    for (const a of this.actors) {
      if (a.id === local.id) continue
      if (a.place > 0) {
        a.moveX = 0
        a.moveZ = 0
        a.spraying = false
        continue
      }
      if (a.human) {
        const inp = this.net.inputFor(a.id)
        if (inp) {
          a.moveX = inp.mx
          a.moveZ = inp.mz
          a.aim = inp.aim
          a.spraying = inp.spray && a.tank > 0
        } else {
          a.moveX = 0
          a.moveZ = 0
          a.spraying = false
        }
      } else {
        updateBot(a, this.actors, this.paint, dt)
      }
    }

    for (const a of this.actors) {
      a.clashing = false
      a.sprayLen = SPRAY_RANGE
      if (a.place > 0 || a.tank <= 0) a.spraying = false
    }

    const life = resolveClashes(this.actors, dt, this.droplets, this.clashRing)
    if (life > 0) this.clashLife = life

    this.paintTurn = (this.paintTurn + 1) % this.actors.length
    for (let k = 0; k < this.actors.length; k++) {
      const a = this.actors[(this.paintTurn + k) % this.actors.length]
      if (a.place > 0) continue
      const onOwn = this.paint.ownerAt(a.x, a.z) === a.id
      if (onOwn) a.tank = Math.min(TANK_MAX, a.tank + REFILL_RATE * dt)
      else a.tank = Math.max(0, a.tank - DRAIN_RATE * dt)
      if (a.spraying && a.tank > 0) a.tank -= SPRAY_COST * dt
      if (a.clashing) a.tank -= CLASH_COST * dt
      if (a.tank <= 0) {
        a.tank = 0
        a.spraying = false
      }
      stepMovement(a, this.paint, dt)
      this.spray.pump(a, dt, this.droplets, this.phone)
    }
    this.spray.step(dt, this.paint, this.droplets, true, this.phone)
    for (const a of this.actors) {
      if (a.place > 0) continue
      if (this.paint.coverage(a.id) <= COVER_OUT) this.knockOut(a)
    }
    if (this.aliveCount() <= 1) {
      this.closeRound('last')
      return
    }

    separatePlayers(this.actors)
    if (this.clashLife > 0) {
      this.clashLife -= dt
      const mat = this.clashRing.material as THREE.MeshBasicMaterial
      const t = Math.max(0, this.clashLife / 0.2)
      mat.opacity = t * 0.9
      const s = 1.1 + (1 - t) * 1.8
      this.clashRing.scale.set(s, s, s)
    }
    for (const a of this.actors) this.poseActor(a, true)
    followCamera(local, dt, this.camera, this.camPos, this.camLook, this.phone ? 6.5 : 8)
    this.refreshHud()
    this.flushHost(dt)
  }

  private updateGuest(dt: number): void {
    this.hintT -= dt
    const local = this.you()
    local.t += dt
    for (const a of this.actors) {
      if (a !== local) a.t += dt
    }
    updateHuman(local, this.input, dt)
    if (local.place === 0) {
      const onOwn = this.paint.ownerAt(local.x, local.z) === local.id
      if (onOwn) local.tank = Math.min(TANK_MAX, local.tank + REFILL_RATE * dt)
      else local.tank = Math.max(0, local.tank - DRAIN_RATE * dt)
      if (local.spraying && local.tank > 0) local.tank -= SPRAY_COST * dt
      if (local.tank <= 0) {
        local.tank = 0
        local.spraying = false
      }
      stepMovement(local, this.paint, dt)
    }
    for (const a of this.actors) {
      if (a.place > 0 || a.tank <= 0) a.spraying = false
      if (a.place === 0) this.spray.pump(a, dt, this.droplets, this.phone)
    }
    this.spray.step(dt, this.paint, this.droplets, false, this.phone)
    separatePlayers(this.actors)
    this.net.sendInput({
      mx: local.moveX,
      mz: local.moveZ,
      aim: local.aim,
      spray: local.spraying,
    })
    if (this.clashLife > 0) {
      this.clashLife -= dt
      const mat = this.clashRing.material as THREE.MeshBasicMaterial
      const t = Math.max(0, this.clashLife / 0.2)
      mat.opacity = t * 0.9
    }
    for (const a of this.actors) this.poseActor(a, true)
    followCamera(local, dt, this.camera, this.camPos, this.camLook, this.phone ? 6.5 : 8)
    this.refreshHud()
  }

  private poseActor(a: Actor, playing: boolean): void {
    syncMesh(a, this.nozzle, playing)
    const spraying = a.place === 0 && a.spraying && a.tank > 0 && playing
    updateSprayJet(a.beam, this.nozzle, a.lagAim, a.sprayLen, spraying, a.clashing, a.t)
  }

  private aliveCount(): number {
    return this.actors.filter((a) => a.place === 0).length
  }

  private knockOut(a: Actor): void {
    if (a.place > 0 || this.nextOutPlace < 2) return
    a.place = this.nextOutPlace
    this.nextOutPlace -= 1
    a.tank = 0
    a.spraying = false
    a.moveX = 0
    a.moveZ = 0
    a.vx = 0
    a.vz = 0
    a.beam.visible = false
    if (a.id === this.you().id) this.showOut(a)
  }

  private settlePlaces(): void {
    const leftover = this.actors.filter((a) => a.place === 0)
    leftover.sort((a, b) => this.paint.coverage(b.id) - this.paint.coverage(a.id))
    leftover.forEach((a, i) => {
      a.place = i + 1
    })
  }

  private closeRound(how: 'timer' | 'last'): void {
    if (this.phase !== 'play') return
    this.remaining = how === 'timer' ? 0 : this.remaining
    this.endHow = how
    if (how === 'last') {
      const last = this.actors.find((a) => a.place === 0)
      if (last) last.place = 1
    } else {
      this.settlePlaces()
    }
    this.phase = 'end'
    this.collectingStamps = false
    document.body.classList.remove('playing')
    this.input.endLook()
    this.els.out.classList.add('hidden')
    finishRound(this.you(), this.actors, this.paint, this.els, how)
    if (this.net.role === 'host') {
      this.net.sendState(this.remaining, 'end', this.actorSnaps(), [...this.paint.counts], how)
    }
  }

  private showOut(a: Actor): void {
    this.els.out.classList.remove('hidden')
    this.els.outTitle.textContent = `${placeLabel(a.place)} place`
    this.els.outBody.textContent = `No floor left. ${a.name} is out. The others keep spraying.`
  }

  private flushHost(dt: number): void {
    if (this.net.role !== 'host') return
    this.netAcc += dt
    if (this.netAcc < 0.033) return
    this.netAcc = 0
    this.net.sendState(this.remaining, this.phase, this.actorSnaps(), [...this.paint.counts])
  }

  private refreshHud(): void {
    updateHud(this.you(), this.actors, this.paint, this.remaining, this.hintT, this.els)
  }
}
