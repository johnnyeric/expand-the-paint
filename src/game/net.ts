import Peer, { type DataConnection } from 'peerjs'
import { PLAYER_DEFS, STAMP_QUEUE, type PlayerId } from './constants.ts'

const PREFIX = 'epaint'
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export type RemoteInput = {
  mx: number
  mz: number
  aim: number
  spray: boolean
}

export type ActorSnap = {
  x: number
  z: number
  vx: number
  vz: number
  aim: number
  tank: number
  sp: number
  cl: number
  mx: number
  mz: number
  sl: number
  pl: number
}

export type StampRec = {
  x: number
  z: number
  r: number
  id: PlayerId
  s: number
  a: number
}

export type PhaseName = 'start' | 'play' | 'end'

export type StateMsg = {
  t: 'state'
  remaining: number
  phase: PhaseName
  humans: PlayerId[]
  actors: ActorSnap[]
  stamps: StampRec[]
  counts: number[]
  how?: 'timer' | 'last'
}

type HelloMsg = { t: 'hello' }
type WelcomeMsg = { t: 'welcome'; you: PlayerId; humans: PlayerId[] }
type LobbyMsg = { t: 'lobby'; humans: PlayerId[] }
type InputMsg = { t: 'input' } & RemoteInput
type StartMsg = { t: 'start' }
type AgainMsg = { t: 'again' }
type FullMsg = HelloMsg | WelcomeMsg | LobbyMsg | InputMsg | StartMsg | AgainMsg | StateMsg

export function makeRoomCode(): string {
  let s = ''
  for (let i = 0; i < 4; i++) s += ALPH[(Math.random() * ALPH.length) | 0]
  return s
}

export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/[I]/g, '1')
    .slice(0, 4)
}

export function roomFromUrl(): string | null {
  const c = new URLSearchParams(location.search).get('room')
  if (!c) return null
  const n = normalizeCode(c)
  return n.length === 4 ? n : null
}

export function roomUrl(code: string): string {
  const u = new URL(location.href)
  u.searchParams.set('room', code)
  return u.toString()
}

function peerId(code: string): string {
  return `${PREFIX}${code}`
}

export class NetPlay {
  role: 'offline' | 'host' | 'guest' = 'offline'
  localId: PlayerId = 1
  code = ''
  onLobby: ((humans: PlayerId[]) => void) | null = null
  onStart: (() => void) | null = null
  onAgain: (() => void) | null = null
  onState: ((msg: StateMsg) => void) | null = null
  onError: ((message: string) => void) | null = null
  onReady: (() => void) | null = null

  private live = false
  private peer: Peer | null = null
  private readonly guests = new Map<PlayerId, DataConnection>()
  private hostConn: DataConnection | null = null
  private readonly lastInput = new Map<PlayerId, RemoteInput>()
  private stamps: StampRec[] = []
  private humans: PlayerId[] = [1]
  private lastSent: RemoteInput | null = null
  private lastSentAt = 0

  get humanIds(): PlayerId[] {
    return [...this.humans]
  }

  inputFor(id: PlayerId): RemoteInput | null {
    return this.lastInput.get(id) ?? null
  }

  pushStamp(x: number, z: number, r: number, id: PlayerId, s: number, a = 255): void {
    this.stamps.push({ x, z, r, id, s, a })
    if (this.stamps.length > STAMP_QUEUE) this.stamps.splice(0, this.stamps.length - STAMP_QUEUE)
  }

  async host(code = makeRoomCode()): Promise<string> {
    this.shutdown()
    this.role = 'host'
    this.localId = 1
    this.humans = [1]
    this.code = code
    await this.openPeer(peerId(code))
    this.peer!.on('connection', (conn) => this.acceptGuest(conn))
    this.onLobby?.(this.humans)
    this.onReady?.()
    return code
  }

  async join(code: string): Promise<void> {
    const n = normalizeCode(code)
    if (n.length !== 4) throw new Error('Need a 4-letter room code.')
    this.shutdown()
    this.role = 'guest'
    this.code = n
    await this.openPeer()
    const conn = this.peer!.connect(peerId(n), { reliable: true, serialization: 'json' })
    this.hostConn = conn
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const fail = window.setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error('Room not found. Check the code and that the host is still in the lobby.'))
      }, 8000)
      const done = (err?: Error): void => {
        if (settled) return
        settled = true
        window.clearTimeout(fail)
        if (err) reject(err)
        else resolve()
      }
      conn.on('open', () => {
        conn.send({ t: 'hello' } satisfies HelloMsg)
      })
      conn.on('data', (raw) => {
        const msg = raw as FullMsg
        if (msg && typeof msg === 'object' && msg.t === 'welcome') {
          this.localId = msg.you
          this.humans = msg.humans
          done()
        }
      })
      conn.on('error', (err) => done(err instanceof Error ? err : new Error('Could not join.')))
      conn.on('close', () => done(new Error('Room is full, or the host closed it.')))
    })
    this.wire(conn, 1)
    this.pushUrl()
    this.onLobby?.(this.humans)
    this.onReady?.()
  }

  sendInput(inp: RemoteInput): void {
    if (this.role !== 'guest' || !this.hostConn?.open) return
    const now = performance.now()
    const mx = Math.round(inp.mx * 20) / 20
    const mz = Math.round(inp.mz * 20) / 20
    const prev = this.lastSent
    const same =
      prev !== null &&
      prev.mx === mx &&
      prev.mz === mz &&
      prev.spray === inp.spray &&
      Math.abs(prev.aim - inp.aim) < 0.04
    const sprayEdge = !prev || prev.spray !== inp.spray
    const stickStart = prev !== null && prev.mx === 0 && prev.mz === 0 && (mx !== 0 || mz !== 0)
    if (same && now - this.lastSentAt < 80) return
    if (!same && !sprayEdge && !stickStart && now - this.lastSentAt < 8) return
    this.lastSent = { mx, mz, aim: inp.aim, spray: inp.spray }
    this.lastSentAt = now
    this.hostConn.send({ t: 'input', ...this.lastSent } satisfies InputMsg)
  }

  sendState(
    remaining: number,
    phase: PhaseName,
    actors: ActorSnap[],
    counts: number[],
    how?: 'timer' | 'last',
  ): void {
    if (this.role !== 'host') return
    const msg: StateMsg = {
      t: 'state',
      remaining,
      phase,
      humans: this.humans,
      actors,
      stamps: this.stamps,
      counts,
      how,
    }
    this.stamps = []
    this.broadcast(msg)
  }

  broadcastStart(): void {
    this.broadcast({ t: 'start' })
  }

  requestStart(): void {
    this.hostConn?.send({ t: 'again' } satisfies AgainMsg)
  }

  leave(): void {
    this.shutdown()
    this.onLobby?.([1])
  }

  private acceptGuest(conn: DataConnection): void {
    const ready = (): void => {
      const slot = this.nextSlot()
      if (!slot) {
        conn.close()
        return
      }
      this.guests.set(slot, conn)
      this.humans = [...this.humans, slot].sort((a, b) => a - b) as PlayerId[]
      this.lastInput.set(slot, { mx: 0, mz: 0, aim: 0, spray: false })
      this.wire(conn, slot)
      conn.send({ t: 'welcome', you: slot, humans: this.humans } satisfies WelcomeMsg)
      this.broadcast({ t: 'lobby', humans: this.humans })
      this.onLobby?.(this.humans)
    }
    if (conn.open) ready()
    else conn.on('open', ready)
  }

  private nextSlot(): PlayerId | null {
    for (const id of [2, 3, 4] as const) {
      if (!this.humans.includes(id)) return id
    }
    return null
  }

  private wire(conn: DataConnection, remoteId: PlayerId): void {
    conn.on('data', (raw) => this.onData(raw, remoteId))
    conn.on('close', () => this.drop(remoteId))
    conn.on('error', () => this.drop(remoteId))
  }

  private onData(raw: unknown, remoteId: PlayerId): void {
    const msg = raw as FullMsg
    if (!msg || typeof msg !== 'object' || !('t' in msg)) return
    if (msg.t === 'hello') return
    if (msg.t === 'welcome') {
      this.localId = msg.you
      this.humans = msg.humans
      this.onLobby?.(this.humans)
      return
    }
    if (msg.t === 'lobby') {
      this.humans = msg.humans
      this.onLobby?.(this.humans)
      return
    }
    if (msg.t === 'input') {
      this.lastInput.set(remoteId, { mx: msg.mx, mz: msg.mz, aim: msg.aim, spray: msg.spray })
      return
    }
    if (msg.t === 'start') {
      this.onStart?.()
      return
    }
    if (msg.t === 'again') {
      this.onAgain?.()
      return
    }
    if (msg.t === 'state') {
      this.humans = msg.humans
      this.onState?.(msg)
    }
  }

  private drop(id: PlayerId): void {
    if (!this.live) return
    if (this.role === 'host') {
      this.guests.get(id)?.close()
      this.guests.delete(id)
      this.lastInput.delete(id)
      this.humans = this.humans.filter((h) => h !== id)
      this.broadcast({ t: 'lobby', humans: this.humans })
      this.onLobby?.(this.humans)
      return
    }
    this.onError?.('Host left the room.')
    this.shutdown()
  }

  private broadcast(msg: FullMsg): void {
    for (const conn of this.guests.values()) {
      if (conn.open) conn.send(msg)
    }
  }

  private openPeer(id?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const opts = { debug: 0 as const }
      const peer = id ? new Peer(id, opts) : new Peer(opts)
      this.peer = peer
      const fail = window.setTimeout(() => reject(new Error('Could not reach the matchmaking server.')), 10000)
      peer.on('open', () => {
        window.clearTimeout(fail)
        this.live = true
        resolve()
      })
      peer.on('error', (err) => {
        window.clearTimeout(fail)
        const type = (err as { type?: string }).type
        if (type === 'unavailable-id') {
          reject(new Error('That room code is busy. Host again for a new code.'))
          return
        }
        if (type === 'peer-unavailable') {
          reject(new Error('Room not found. The host needs to keep the lobby open.'))
          return
        }
        reject(err instanceof Error ? err : new Error('Matchmaking failed.'))
      })
    })
  }

  private pushUrl(): void {
    if (!this.code) return
    const u = new URL(location.href)
    u.searchParams.set('room', this.code)
    history.replaceState(null, '', u)
  }

  private shutdown(): void {
    this.live = false
    for (const conn of this.guests.values()) {
      try {
        conn.close()
      } catch {
        /* ignore */
      }
    }
    this.guests.clear()
    this.lastInput.clear()
    this.lastSent = null
    this.lastSentAt = 0
    this.stamps = []
    try {
      this.hostConn?.close()
    } catch {
        /* ignore */
    }
    this.hostConn = null
    try {
      this.peer?.destroy()
    } catch {
      /* ignore */
    }
    this.peer = null
    this.role = 'offline'
    this.localId = 1
    this.humans = [1]
    this.code = ''
  }
}

export function slotLabel(id: PlayerId, humans: PlayerId[], localId: PlayerId): string {
  const name = PLAYER_DEFS[id - 1].name
  if (id === localId) return `${name} — you`
  if (humans.includes(id)) return `${name} — joined`
  return `${name} — bot`
}
