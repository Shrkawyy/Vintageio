# VINTAGE v0.6 — GitHub / Vercel development build

An independent cell game built from the Vintage project files and your reference screenshots. This is a complete **frontend + optional Node.js WebSocket backend** source package. Do not confuse the local preview with a publicly hosted multiplayer game.

## What's new in v0.6

- Entirely refreshed custom burgundy/red Vintage lobby with responsive panels, animated rings, subtle light effects, streamlined login and skin placeholders, and larger FFA / Dual / Mega selections.
- **Free Spectate** (mouse-only): choose **FREE SPECTATE** in the lobby; move the mouse toward a screen edge to roam; hold the left mouse button and drag to pan; roll the mouse wheel to zoom. Click **EXIT SPECTATE** to return to the lobby. No keyboard shortcuts are required.
- **True observer-mode WebSocket protocol:** online spectators receive room snapshots and do not create game-player slots. The backend also cleans up spectators on disconnect and keeps their data scoped to the selected game room.
- **Mouse wheel zoom during play** (and Spectate), plus visible + / − / reset controls. Zoom amount is adjustable in **Settings → Game → Camera** and saved locally.
- 10 local AI opponents in **each** isolated mode; Mega supports two-player multibox connections; FFA and Dual retain the same automatic multibox behavior.
- The existing hotkeys, split functions, settings, leaderboard, tag chat, skins/login **Coming Soon** placeholders, and room separation are preserved.

**Scope note:** gameplay physics remain an independently developed approximation, not an exact reverse-engineered implementation of Senpa. We can continue adjusting movement, split velocity, merging, collision and consumption based on reproducible examples. "Professional lobby" here means the new visual/UX treatment, not a claim of feature parity with an established live game.

## Put this update on your existing GitHub + Vercel project

1. Extract the ZIP into a folder.
2. Open your existing Vintageio GitHub repository, and replace/update the files **at the repository root**. In particular, keep `vercel.json` at the root and `index.html` inside `public/`. You do **not** need to create a second repository.
3. If you use Git locally, from the repository folder:

   ```bash
   git add .
   git commit -m "Vintage v0.6 free spectate and mouse zoom"
   git push origin main
   ```

4. Your Vercel deployment connected to `main` should rebuild automatically. Framework: **Other**; root directory `.`, output directory `public`, no build command needed.
5. Open the Vercel URL and hard-refresh (**Ctrl+F5**) if the older CSS is cached.

## Run a local preview

From the repository root:

```bash
python -m http.server 8080 --directory public
```

Open http://localhost:8080. The web interface runs using local NPCs when the backend WebSocket URL in `public/config.js` is empty. This is a local simulation inside the visitor's browser, not cross-user online multiplayer.

## Run the optional live multiplayer backend

It requires Node.js 20+, a host with continuous WebSocket support, and internet access to install dependencies.

```bash
cd server
npm install
npm start
```

Use an always-on Node hosting provider (Render, Railway, a VPS, etc.); Vercel's regular serverless functions cannot run this persistent WebSocket server. `GET /health` reports the room's real player count, bot count and spectator count separately.

Update `public/config.js` with the working public WSS URL when your game server is online:

```js
window.VINTAGE_CONFIG = { wsUrl: 'wss://YOUR-GAME-SERVER-HOST' };
```

Do not assume a `*.vercel.app` frontend URL is a game-server WebSocket address. HTTPS Vercel pages require **WSS**, backed by a TLS-enabled game host.

## Controls

| Context | Mouse / key | Behavior |
|---|---|---|
| Any active game | Mouse movement | Move the controlled cell toward cursor |
| Playing | Wheel scroll | Zoom in or out smoothly |
| Playing | + / − / reset panel | Alternative camera zoom |
| Playing | Space | Split |
| Playing | W | Feed |
| Playing | Tab | Switch multi connection |
| Playing | Hold right-click | Steer second multi connection |
| Free Spectate | Move mouse toward screen edges | Pan freely across the world |
| Free Spectate | Hold left-click and drag | Precisely pan the camera |
| Free Spectate | Wheel scroll | Zoom around the mouse pointer |
| Free Spectate | EXIT SPECTATE | Return to lobby |

Camera zoom preferences and other settings are stored in this browser's localStorage. Login buttons and cosmetic skins are labeled Coming Soon; they are not real OAuth integrations yet.

## Tests

```bash
node --test tests/*.test.cjs
```

10 offline automated tests cover isolated rooms, mass, split direction, automatic split, tag chat filtering, NPC counts, Mega multibox setup and WebSocket spectator protocol handling (with a test double). Browser interaction tests also exercised the lobby, free-camera edge-panning, left-dragging, wheel zoom and playing zoom. Network integration with an externally hosted Node server was **not** tested in this environment because the `ws` dependency could not be fetched from npm here; deploy the backend separately before claiming real online multiplayer is verified.
