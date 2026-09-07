export const ROOM = 22
export const HALF = ROOM / 2
export const WALL_H = 3.4
export const CAM_FOV = 70
export const CAM_BACK = 3.15
export const CAM_HEIGHT = 2.08

export const ROUND_SECONDS = 180
export const TANK_MAX = 100
/** Metres from the nozzle to the floor hit. Short enough to paint a path underfoot. */
export const SPRAY_RANGE = 1.72
export const SPRAY_COST = 17
export const CLASH_COST = 15
export const REFILL_RATE = 34
export const DRAIN_RATE = 7.5
/** Coverage at or below this is treated as gone — tank empty is not knockout. */
export const COVER_OUT = 0.0012
export const SPEED_OWN = 6.05
export const SPEED_AWAY = 3.7
export const PLAYER_RADIUS = 0.38
export const KNOCKBACK = 26
/** Stream speed from nozzle to floor, m/s. Travel time is length / this. */
export const JET_SPEED = 17
export const JET_FLOOR_Y = 0.028
/** Coat 0–255 needed before a cell counts as owned for scoring and refill. */
export const COAT_OWN = 56
/** Coat added at a solid impact. One hit claims a walkable core; holding fills the path. */
export const COAT_CORE = 78
export const COAT_MIST = 26
/** Core and mist deposits per second. Same on every device — phone only thins particles. */
export const DEPOSIT_HZ = 20
/** Wet highlight fade rate. Higher = dries faster. */
export const WET_FADE = 2.6
export const STAMP_QUEUE = 192
export const TOUCH_MOVE_DEADZONE = 0.12
export const TOUCH_AIM_DEADZONE = 0.18
/** Cap analog walk so a full left stick is a jog, not WASD. Desktop speed is unchanged. */
export const TOUCH_MOVE_GAIN = 0.88
/** Max yaw rate on the right stick, rad/s. Keep this well below a full spin per second. */
export const TOUCH_AIM_TURN = 1.65
/** Pixels of thumb travel before a stick saturates. Longer than the visible pad. */
export const TOUCH_STICK_MIN = 58
export const TOUCH_STICK_SCALE = 0.46
/** Radians per CSS pixel. Fast enough that a short swipe turns you around. */
export const MOUSE_TURN = 0.014
/** Extra yaw while the unlocked cursor sits on the window edge, rad/s. */
export const EDGE_TURN = 4.4

export const GRID = 448
export const PAINT_RES = 1024

export const PLAYER_DEFS = [
  {
    id: 1 as const,
    name: 'Blue',
    hex: '#2f7bff',
    rgb: [47, 123, 255] as const,
    color: 0x2f7bff,
    human: true,
    spawn: { x: -3.0, z: 1.65 },
    home: { x: -7.8, z: 6.85 },
  },
  {
    id: 2 as const,
    name: 'Yellow',
    hex: '#ffd21a',
    rgb: [255, 210, 26] as const,
    color: 0xffd21a,
    human: false,
    spawn: { x: 3.0, z: 1.65 },
    home: { x: 7.8, z: 6.85 },
  },
  {
    id: 3 as const,
    name: 'Magenta',
    hex: '#ff3d8a',
    rgb: [255, 61, 138] as const,
    color: 0xff3d8a,
    human: false,
    spawn: { x: -8.05, z: -7.95 },
    home: { x: -8.05, z: -7.95 },
  },
  {
    id: 4 as const,
    name: 'Green',
    hex: '#22c55e',
    rgb: [34, 197, 94] as const,
    color: 0x22c55e,
    human: false,
    spawn: { x: 8.05, z: -7.95 },
    home: { x: 8.05, z: -7.95 },
  },
]

export type PlayerId = (typeof PLAYER_DEFS)[number]['id']
