# Expand the Paint

Close-camera sprayer. Paint is how you grow **and** how you fight.

Territory does not make your spray stronger — it gives you refill spots and a border to defend.

## Play

**https://expand-the-paint.vercel.app**

You are **Blue** in a 22-metre dusk gallery. Yellow starts across from you. Magenta and Green take the far corners. Three minutes, or until one sprayer is left.

- **Desktop:** WASD to move, move the mouse to turn, hold click or space to spray.
- **Phone and iPad:** left stick moves, right stick aims and sprays. Tap **Play as Blue**, then put a thumb on each stick.

On your colour you move faster and refill. Off it, the tank drains. An empty tank is not knockout — paint a path back onto your colour and refill. If your coverage on the floor hits zero, you are out. First out is 4th; last standing is 1st. If the timer ends first, leftover players rank by coverage.

## Play together

1. Tap **Host a match** for a four-character code.
2. On another device tap **Join a friend**, or open the **Copy link** URL.
3. Host taps **Start spraying**. Keep the host tab open.

## Local

```bash
npm install
npm run dev
```

Dev server: http://127.0.0.1:43217

```bash
npm run check:sim
```

## Deploy

This is a normal Vite app. Vercel installs dependencies and runs `npm run build`. There is no split CDN and no `a.txt` chunk files.

Production is the Vercel project linked to this GitHub repository. A push to `main` deploys.
