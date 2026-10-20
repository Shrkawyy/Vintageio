# VINTAGE v0.7 — GitHub / Vercel development build

An independent cell game built from the Vintage project files and your reference screenshots. This is a complete **frontend + optional Node.js WebSocket backend** source package. Do not confuse the local preview with a publicly hosted multiplayer game.

## What's new in v0.7

- Removed the large **FREE CAMERA** banner and its exit button. To leave Spectate, **right-click anywhere on the playfield**; no keyboard shortcut is needed.
- Camera behavior tuned from the supplied Senpa reference video: use wheel zoom to move between extreme wide-world views (showing the world boundary) and close-ups. Pan with the mouse near screen edges or hold left-click and drag. Zoom anchors around your cursor.
- **Original Vintage neon-crystal viruses**, drawn directly on the HTML canvas. These have real game effects, both in the browser demo and in the optional dedicated Node.js server:
  - Feed viruses by pressing W toward them (ejected mass travels and charges a virus).
  - Every seven ejected pellets consumed launches another moving virus, up to a bounded total.
  - Large player cells touching viruses burst into smaller moving pieces; mass is conserved plus virus mass; the consumed virus respawns elsewhere.
- All three modes still contain **10 local bots** and support the existing multibox features.

The reference video shows the desired camera behavior, but these are independently implemented rules and visuals, not proprietary Senpa internals or guaranteed exact parity with Senpa physics.

## Put this update on your existing GitHub + Vercel project

1. Extract the ZIP into a folder.
2. Open your existing Vintageio GitHub repository, and replace/update the files **at the repository root**. In particular, keep `vercel.json` at the root and `index.html` inside `public/`. You do **not** need to create a second repository.
3. If you use Git locally, from the repository folder:

   ```bash
   git add .
   git commit -m "Vintage v0.7 crystal virus gameplay and spectate camera"
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
| Free Spectate | Wheel scroll | Zoom around the mouse pointer, including far wide-view |
| Free Spectate | Right-click on playfield | Return to lobby |

Camera zoom preferences and other settings are stored in this browser's localStorage. Login buttons and cosmetic skins are labeled Coming Soon; they are not real OAuth integrations yet.

## Tests

```bash
node --test tests/*.test.cjs
```

Automated tests cover isolated rooms, mass, split direction, automatic split, tag chat filtering, NPC counts, Mega multibox setup and WebSocket spectator protocol handling (with a test double). Browser interaction tests also exercised the lobby, free-camera edge-panning, left-dragging, wheel zoom and playing zoom. Network integration with an externally hosted Node server was **not** tested in this environment because the `ws` dependency could not be fetched from npm here; deploy the backend separately before claiming real online multiplayer is verified.
