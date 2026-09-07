/** Compact phones — not iPads. Used to cap GPU cost without dulling tablets. */
export function isPhone(): boolean {
  const short = Math.min(window.innerWidth, window.innerHeight)
  return short < 540
}
