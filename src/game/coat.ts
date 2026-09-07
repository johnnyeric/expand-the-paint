import { COAT_OWN, type PlayerId } from './constants.ts'

export function setOwner(cells: Uint8Array, counts: number[], i: number, owner: PlayerId | 0): void {
  const prev = cells[i]
  if (prev === owner) return
  counts[prev]--
  counts[owner]++
  cells[i] = owner
}

/**
 * Pigment (ink) is whose paint sits in the cell.
 * Territory (cells) is only set once coating crosses COAT_OWN.
 * Wearing a coat down into neutral keeps the original pigment — the next
 * colour cannot inherit leftover buildup.
 */
export function applyCoat(
  cells: Uint8Array,
  coat: Uint8Array,
  ink: Uint8Array,
  counts: number[],
  i: number,
  painter: PlayerId,
  add: number,
): void {
  if (add < 1) return
  const pigment = ink[i] as PlayerId | 0
  if (pigment === 0 || pigment === painter) {
    ink[i] = painter
    const next = Math.min(255, coat[i] + add)
    coat[i] = next
    if (next >= COAT_OWN) setOwner(cells, counts, i, painter)
    return
  }

  const wear = add * 0.88
  if (coat[i] > wear) {
    const next = Math.max(0, coat[i] - wear)
    coat[i] = next
    if (next < COAT_OWN) setOwner(cells, counts, i, 0)
    return
  }

  const leftover = wear - coat[i]
  if (leftover > 0.5) {
    coat[i] = Math.min(255, leftover)
    ink[i] = painter
    setOwner(cells, counts, i, leftover >= COAT_OWN ? painter : 0)
  } else {
    coat[i] = 0
    ink[i] = 0
    setOwner(cells, counts, i, 0)
  }
}
