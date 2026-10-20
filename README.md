# VINTAGE — Cell Arena (Development Preview)

An independent Vintage Arena project based on the provided UI reference screenshots. The project is **not** a source export of the existing ChatGPT Site, which wasn't available for source download.

## What is implemented

- Original dark navy / ice blue Vintage UI: new lobby, three modes, animated game canvas, HUD, leaderboard, chat, radar.
- Three independent game worlds/rooms: `ffa`, `dual`, `mega`. Changing the mode switches the room and resets its world, not just the label.
- Initial player mass: FFA = 1,000; Dual = 1,000; Mega = 5,000. With two multi player connections, each starts at the mode's own initial mass.
- Player-controlled movement towards the mouse, Space to split, W to eject mass, Q to switch controlled multibox connection, hold right mouse to steer the second multi connection (if available).
- Automatic split at 25,500 mass toward the player's pointer, maximum 16 cells per player; physics is simplified for this development version.
- AI opponents, pellets, simple eating mechanics, death/respawn, camera tracking and minimap.
- Gameplay, theme, controls, and JSON import/export settings; changes are stored in localStorage and used by the game.
- `All` chat for the current game room and `Tag` chat for same-tag players in that room when connected to a real backend.
- A separate Node.js WebSocket backend for real two-browser multiplayer in the same room.

### What is still required for an official launch

The live multiplayer backend must be deployed independently on an always-on host; hosting only the frontend on Vercel gives you a **local playable demo**, not online multiplayer. Production-grade authentication, accounts, databases, cosmetics, moderation, cheat protection, persistence, ranking, replays and performance optimization are **not implemented**. Collision/merging rules are a development approximation rather than a commercial-grade authoritative physics model. The current ChatGPT Site deployment is not modified by this package.

## Structure

```text
Vintage-Arena/
├── public/
│   ├── index.html     # Page / responsive lobby and settings UI
│   ├── styles.css     # Vintage visual design
│   ├── game.js        # Local game engine, drawing and default settings
│   ├── client.js      # UI wiring, input, chat, WebSocket client
│   └── config.js      # Optional backend WebSocket URL
├── server/
│   ├── core.cjs       # Real-time game rooms and authoritative physics
│   ├── index.js       # HTTP health endpoint and WebSocket server
│   └── package.json   # ws dependency and scripts
├── tests/
│   └── server.test.cjs
├── vercel.json
└── README.md
```

## Deploy the website to GitHub + Vercel (no purchased domain needed)

1. Extract the ZIP. Create a NEW GitHub repository named `Vintage-Arena`.
2. Upload all files **inside** the `Vintage-Arena` folder, keeping `vercel.json` and the `public` folder in the repository root.
3. On https://vercel.com/new choose **Import Git Repository** and select your new repo.
4. Framework Preset: **Other**. Root Directory: `./` (repo root). Build command: leave empty; Output Directory: `public` (also set in `vercel.json`).
5. Click **Deploy**. Open the temporary `*.vercel.app` URL. You can play in Demo Mode immediately.
6. Every commit to the connected GitHub branch automatically redeploys the front end.

**Don't upload only the `server/` directory to Vercel.** Vercel cannot host the game's continuously running WebSocket server as a normal serverless function.

## Run the local playable demo

You can serve the `public` folder with any static web server, for example:

```bash
python -m http.server 8080 --directory public
```

Then open `http://localhost:8080`. Alternatively use VS Code's Live Server. Opening `index.html` directly as a `file://` page is not supported because it uses browser ES modules.

## Run the real online server separately

Requires Node.js 20+ on a service that accepts WebSocket connections and runs continuously.

```bash
cd server
npm install
npm start
```

The backend listens on `PORT` (default 3001) and reports `GET /health`. To try on one PC, change `public/config.js` to:

```js
window.VINTAGE_CONFIG = { wsUrl: 'ws://localhost:3001' };
```

For public Vercel hosting, deploy the `server/` directory to a supported Node.js hosting service (e.g. Railway, Render, VPS), with its own publicly reachable HTTPS/WSS host. Then edit `public/config.js`:

```js
window.VINTAGE_CONFIG = { wsUrl: 'wss://YOUR-ALWAYS-ON-GAME-SERVER' };
```

Commit `config.js`, wait for Vercel's redeploy, and test with two separate browser tabs. The WebSocket server hosts three independent logical rooms in one Node process: `ffa`, `dual` and `mega`.

For a backend host that asks for a start command, choose `npm start`, root directory `server`, install command `npm install`, and use the host-provided `PORT` environment variable. It must support long-lived WebSockets (not Vercel Functions).

## Add an official domain later

No domain is required during development. After buying one, open **Vercel Project → Settings → Domains**, add the domain and follow the DNS instructions shown by Vercel. Configure the game server's subdomain (such as `ws.example.com`) on its separate host; update `public/config.js` to its real WSS URL. Never assume `wss://` works without HTTPS/TLS on the backend host.

## Controls

| Action | Default |
|---|---|
| Move primary/selected cell | Mouse |
| Split towards cursor | Space |
| Eject mass | W |
| Switch multi connection | Q |
| Steer multi 2 while holding | Right mouse |
| Chat | Enter |
| Toggle All/Tag chat | C |
| Settings | S |
| Hide/show HUD | H |
| Lobby | Escape |
| Quick chat presets | Alt+1 ... Alt+5 |

Settings including key mappings persist in browser localStorage. Chat sent while in local Demo Mode is local-only; with the real server, All and Tag messages are delivered to eligible players within their mode.

## Tests

Run from the repository root:

```bash
node --test tests/server.test.cjs
```

Tests validate the three isolated rooms, initial masses, split direction/mass conservation, autosplit threshold and room-scoped Tag chat. The app has been checked for JS syntax and these unit tests, but production network load, browser compatibility and external hosting still require live acceptance tests.
