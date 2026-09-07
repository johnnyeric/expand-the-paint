import './style.css'
import { Game } from './game/Game.ts'

lockPageZoom()

const canvas = document.querySelector('#game')
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing game canvas')
}

new Game(canvas)

function lockPageZoom(): void {
  const block = (e: Event): void => {
    e.preventDefault()
  }
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, block, { passive: false })
  }
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault()
      const scale = (e as TouchEvent & { scale?: number }).scale
      if (scale !== undefined && scale !== 1) e.preventDefault()
    },
    { passive: false },
  )

  let lastTouchEnd = 0
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now()
      if (now - lastTouchEnd <= 320 && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
      }
      lastTouchEnd = now
      resetViewportScale()
    },
    { passive: false },
  )

  window.visualViewport?.addEventListener('resize', resetViewportScale)
  window.visualViewport?.addEventListener('scroll', resetViewportScale)
}

function resetViewportScale(): void {
  const scale = window.visualViewport?.scale ?? 1
  if (scale <= 1.01) return
  const meta = document.querySelector('meta[name="viewport"]')
  if (!(meta instanceof HTMLMetaElement)) return
  const locked =
    'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no, shrink-to-fit=no'
  meta.setAttribute('content', `${locked}, maximum-scale=1.01`)
  requestAnimationFrame(() => {
    meta.setAttribute('content', locked)
  })
}
