import {
  EDGE_TURN,
  TOUCH_MOVE_DEADZONE,
  TOUCH_MOVE_GAIN,
  TOUCH_STICK_MIN,
  TOUCH_STICK_SCALE,
} from './constants.ts'
import { analogStick, cameraStick, clamp } from './math.ts'

function overlayOpen(): boolean {
  for (const id of ['start', 'end', 'join', 'lobby']) {
    const el = document.querySelector(`#${id}`)
    if (el && !el.classList.contains('hidden')) return true
  }
  return false
}

function isUiTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('button, a, input, textarea, select'))
}

export class Input {
  readonly keys = new Set<string>()
  mouseX = 0
  mouseY = 0
  spraying = false
  hasMouseAim = false
  private mouseDx = 0
  private lastMX: number | null = null
  touchMoveX = 0
  touchMoveZ = 0
  touchAimX = 0
  touchAimZ = 0
  hasTouchMove = false
  hasTouchAim = false
  usingTouch = false
  private leftId: number | null = null
  private rightId: number | null = null
  private mouseId: number | null = null
  private leftOx = 0
  private leftOy = 0
  private rightOx = 0
  private rightOy = 0
  private leftMax = 44
  private rightMax = 44
  private readonly leftPad: HTMLElement
  private readonly rightPad: HTMLElement
  private readonly leftKnob: HTMLElement
  private readonly rightKnob: HTMLElement
  private root: HTMLElement | null = null
  private pointerDown = false
  private lookCanvas: HTMLCanvasElement | null = null
  private lookWanted = false

  constructor(canvas: HTMLCanvasElement) {
    this.leftPad = document.querySelector('#joy-left') as HTMLElement
    this.rightPad = document.querySelector('#joy-right') as HTMLElement
    this.leftKnob = document.querySelector('#joy-left .knob') as HTMLElement
    this.rightKnob = document.querySelector('#joy-right .knob') as HTMLElement
    this.lookCanvas = canvas

    canvas.style.touchAction = 'none'
    if (this.preferTouch()) this.enableTouchUi()

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code)
      if (e.code === 'Space') {
        e.preventDefault()
        this.spraying = true
      }
    })
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
      if (e.code === 'Space' && !this.pointerDown) this.spraying = this.hasTouchAim
    })

    const root = (document.querySelector('#app') ?? document.body) as HTMLElement
    this.root = root
    root.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false })
    window.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false })
    window.addEventListener('pointerup', (e) => this.onPointerUp(e))
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e))
    window.addEventListener('contextmenu', (e) => {
      if (!overlayOpen()) e.preventDefault()
    })
    window.addEventListener('blur', () => this.releaseAll())
    window.addEventListener('mousemove', (e) => this.onMouseLook(e))
    canvas.addEventListener('click', () => this.requestLookLock())
    document.addEventListener('pointerlockchange', () => this.syncLookCursor())

    matchMedia('(pointer: coarse)').addEventListener('change', () => {
      if (this.preferTouch()) this.enableTouchUi()
    })
  }

  preferTouch(): boolean {
    return matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches
  }

  moveVector(aim: number): { x: number; z: number } {
    let x = 0
    let z = 0
    if (this.hasTouchMove) {
      const stick = analogStick(this.touchMoveX, this.touchMoveZ, TOUCH_MOVE_DEADZONE)
      return cameraStick(stick.x * TOUCH_MOVE_GAIN, stick.y * TOUCH_MOVE_GAIN, aim)
    }
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1
    if (x === 0 && z === 0) return { x: 0, z: 0 }
    const len = Math.hypot(x, z)
    x /= len
    z /= len
    return cameraStick(x, z, aim)
  }

  wantsSpray(): boolean {
    return this.spraying || this.hasTouchAim || this.keys.has('Space')
  }

  consumeMouseDx(): number {
    const dx = this.mouseDx
    this.mouseDx = 0
    return dx
  }

  /** Keep spinning when the unlocked cursor is parked on the left or right edge. */
  edgeYaw(dt: number): number {
    if (!this.lookWanted || this.usingTouch || overlayOpen()) return 0
    if (document.pointerLockElement === this.lookCanvas) return 0
    const w = window.innerWidth
    if (w < 8) return 0
    const zone = Math.max(36, w * 0.12)
    if (this.mouseX <= zone) {
      this.hasMouseAim = true
      const t = 1 - this.mouseX / zone
      return -EDGE_TURN * (0.25 + 0.75 * t) * dt
    }
    if (this.mouseX >= w - zone) {
      this.hasMouseAim = true
      const t = 1 - (w - this.mouseX) / zone
      return EDGE_TURN * (0.25 + 0.75 * t) * dt
    }
    return 0
  }

  beginLook(): void {
    this.lookWanted = true
    this.requestLookLock()
  }

  endLook(): void {
    this.lookWanted = false
    if (document.pointerLockElement) document.exitPointerLock()
    document.body.classList.remove('mouse-look')
  }

  private enableTouchUi(): void {
    this.usingTouch = true
    document.body.classList.add('touch-ui')
  }

  private onPointerDown(e: PointerEvent): void {
    if (isUiTarget(e.target)) return
    if (overlayOpen()) return

    if (this.isFinePointer(e)) {
      if (e.button !== 0) return
      this.usingTouch = false
      document.body.classList.remove('touch-ui')
      this.pointerDown = true
      this.mouseId = e.pointerId
      this.spraying = true
      this.mouseX = e.clientX
      this.mouseY = e.clientY
      this.lastMX = e.clientX
      this.requestLookLock()
      return
    }

    this.enableTouchUi()
    e.preventDefault()
    const side = this.touchSide(e)
    if (side === 'left' && this.leftId === null) {
      this.leftId = e.pointerId
      this.hasTouchMove = true
      this.parkPad(this.leftPad, e.clientX, e.clientY)
      this.leftOx = e.clientX
      this.leftOy = e.clientY
      this.leftMax = Math.max(TOUCH_STICK_MIN, this.leftPad.offsetWidth * TOUCH_STICK_SCALE)
      this.leftPad.classList.add('active')
      this.captureOn(this.leftPad, e)
      this.moveTouch(e)
    } else if (side === 'right' && this.rightId === null) {
      this.rightId = e.pointerId
      this.hasTouchAim = true
      this.spraying = true
      this.parkPad(this.rightPad, e.clientX, e.clientY)
      this.rightOx = e.clientX
      this.rightOy = e.clientY
      this.rightMax = Math.max(TOUCH_STICK_MIN, this.rightPad.offsetWidth * TOUCH_STICK_SCALE)
      this.rightPad.classList.add('active')
      this.captureOn(this.rightPad, e)
      this.moveTouch(e)
    }
  }

  private onMouseLook(e: MouseEvent): void {
    if (this.preferTouch() && this.usingTouch) return
    this.usingTouch = false
    document.body.classList.remove('touch-ui')
    this.mouseX = e.clientX
    this.mouseY = e.clientY
    if (overlayOpen()) {
      this.lastMX = e.clientX
      this.mouseDx = 0
      return
    }
    const locked = document.pointerLockElement === this.lookCanvas
    let dx = e.movementX
    if (!locked && this.lastMX !== null) {
      const fallback = e.clientX - this.lastMX
      if (!Number.isFinite(dx) || (dx === 0 && fallback !== 0)) dx = fallback
    }
    this.lastMX = locked ? null : e.clientX
    if (dx) {
      this.mouseDx += dx
      this.hasMouseAim = true
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      this.usingTouch = false
      document.body.classList.remove('touch-ui')
      return
    }
    if (e.pointerId === this.leftId || e.pointerId === this.rightId) {
      e.preventDefault()
      this.moveTouch(e)
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerId === this.mouseId) {
      this.mouseId = null
      this.pointerDown = false
      if (!this.keys.has('Space')) this.spraying = this.hasTouchAim
      return
    }
    this.endTouch(e.pointerId)
  }

  private touchSide(e: PointerEvent): 'left' | 'right' {
    if (e.target instanceof Element) {
      if (e.target.closest('#joy-left')) return 'left'
      if (e.target.closest('#joy-right')) return 'right'
    }
    return e.clientX < window.innerWidth * 0.5 ? 'left' : 'right'
  }

  private moveTouch(e: PointerEvent): void {
    if (e.pointerId === this.leftId) {
      const v = this.stickFrom(this.leftOx, this.leftOy, this.leftMax, this.leftKnob, e.clientX, e.clientY)
      this.touchMoveX = v.x
      this.touchMoveZ = v.y
    } else if (e.pointerId === this.rightId) {
      const v = this.stickFrom(this.rightOx, this.rightOy, this.rightMax, this.rightKnob, e.clientX, e.clientY)
      this.touchAimX = v.x
      this.touchAimZ = v.y
    }
  }

  private endTouch(id: number): void {
    if (id === this.leftId) {
      this.leftId = null
      this.hasTouchMove = false
      this.touchMoveX = 0
      this.touchMoveZ = 0
      this.resetKnob(this.leftKnob)
      this.homePad(this.leftPad)
      this.leftPad.classList.remove('active')
    } else if (id === this.rightId) {
      this.rightId = null
      this.hasTouchAim = false
      this.touchAimX = 0
      this.touchAimZ = 0
      this.spraying = this.pointerDown || this.keys.has('Space')
      this.resetKnob(this.rightKnob)
      this.homePad(this.rightPad)
      this.rightPad.classList.remove('active')
    }
  }

  private releaseAll(): void {
    this.keys.clear()
    this.pointerDown = false
    this.mouseId = null
    this.mouseDx = 0
    this.lastMX = null
    if (this.leftId !== null) this.endTouch(this.leftId)
    if (this.rightId !== null) this.endTouch(this.rightId)
    this.spraying = false
    if (document.pointerLockElement) document.exitPointerLock()
    document.body.classList.remove('mouse-look')
  }

  private isFinePointer(e: PointerEvent): boolean {
    return e.pointerType === 'mouse' || e.pointerType === 'pen'
  }

  private requestLookLock(): void {
    if (!this.lookWanted || overlayOpen()) return
    const el = this.lookCanvas
    if (!el || document.pointerLockElement === el) return
    try {
      const result = el.requestPointerLock()
      if (result && typeof result.catch === 'function') {
        void result.catch(() => {
          /* iframe / permissions can reject; unlocked look still works */
        })
      }
    } catch {
      /* Safari */
    }
  }

  private syncLookCursor(): void {
    const locked = document.pointerLockElement === this.lookCanvas
    document.body.classList.toggle('mouse-look', locked)
    if (locked) this.lastMX = null
  }

  private captureOn(el: HTMLElement | null, e: PointerEvent): void {
    try {
      el?.setPointerCapture(e.pointerId)
    } catch {
      try {
        this.root?.setPointerCapture(e.pointerId)
      } catch {
        /* Safari can throw if capture is requested on a non-target node */
      }
    }
  }

  private parkPad(pad: HTMLElement, x: number, y: number): void {
    const w = pad.offsetWidth || 128
    const h = pad.offsetHeight || 128
    const left = clamp(x - w / 2, 8, window.innerWidth - w - 8)
    const top = clamp(y - h / 2, 8, window.innerHeight - h - 8)
    pad.style.left = `${left}px`
    pad.style.top = `${top}px`
    pad.style.right = 'auto'
    pad.style.bottom = 'auto'
  }

  private homePad(pad: HTMLElement): void {
    pad.style.left = ''
    pad.style.top = ''
    pad.style.right = ''
    pad.style.bottom = ''
  }

  private stickFrom(
    ox: number,
    oy: number,
    max: number,
    knob: HTMLElement,
    x: number,
    y: number,
  ): { x: number; y: number } {
    let dx = x - ox
    let dy = y - oy
    const len = Math.hypot(dx, dy)
    if (len > max) {
      dx *= max / len
      dy *= max / len
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`
    return { x: clamp(dx / max, -1, 1), y: clamp(dy / max, -1, 1) }
  }

  private resetKnob(knob: HTMLElement): void {
    knob.style.transform = 'translate(0, 0)'
  }
}
