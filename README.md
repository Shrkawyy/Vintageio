# Current release: Vintage v11

Read **START-HERE-AR.md** for the current changes, setup and limits. Earlier release notes below are historical.

# VINTAGE v10.1 — see RELEASE-v10.1.md (bug fixes + server hardening)

The sections below describe earlier releases (v0.7 – v10) and remain accurate unless RELEASE-v10.1.md says otherwise.

---

# VINTAGE v0.9 — FFA movement, Multi Tab respawn, held Macro Feed

This release fixes the gameplay problems shown in the user-supplied 41.6-second Vintage video (20 October 2026).

## Fixed in v0.9

- **FFA movement is slower:** `baseSpeed` is 660 (was 950), mass-speed power is 0.26 (was 0.245). **FFA split launch is reduced** from 810 to 620 and damps sooner. These are tuning estimates, **not identical to Senpa's proprietary physics**. The existing Dual/Mega movement profiles are preserved separately.
- **Multi when consumed:** If your main cell consumes the second Multi connection, keep playing, move the cursor to the new location and press **Tab**. The next connection's dead cell respawns with the mode's initial mass (FFA/Dual: 1000, Mega: 5000) at your cursor's game-world position. Switching to a live cell still works normally. Each connection must already belong to your Multi setup; Tab does not spawn unlimited connections.
- **Corrected Game Over detection:** Losing the currently active Multi cell does **not** end the session while another of your Multi cells is alive.
- **Held Macro Feed:** Hold **E** to continuously eject mass at approximately 11–12 actions per second; release E to stop. **W** remains the regular single feed key. The game server rate-limits received feed actions to stop redundant bursts.
- **Spawn safety:** A newly respawned cell gets 1.5 seconds of protection from being consumed and a 1.8-second per-connection respawn cooldown. This allows a Multi cell to appear at the cursor instead of instantly disappearing inside your main cell.
- All rooms still have **10 bots** and **FFA, Dual and Mega** remain isolated.
- Online Tab respawning requires deploying updated `server/` code to the separate persistent WebSocket host, **not just the Vercel frontend**.

### If FFA still feels fast after updating

In **Settings → Game → Camera**, check **Mouse movement speed**. An old saved sensitivity above 1.0 multiplies the movement speed. You can reset the defaults with **Settings → Import/Export → RESET DEFAULTS** if necessary. Compare under the same zoom level as the reference video.

### Deployment and verification

Update the files in your existing GitHub repository (no new repo) and let Vercel rebuild the `public/` frontend. The demo plays locally against NPCs until a working `wss://` URL is configured in `public/config.js` and the Node backend is deployed independently.

All **27 automated tests pass** on Node, including the new respawn, protection and mass-conservation checks. An isolated Chromium UI interaction smoke test also passed: holding E for about one second reduced the active cell mass from 1,000 to 792, Tab switched to the other multi cell, and no JavaScript errors appeared. This does not verify external online server deployment; verify live respawning after updating the Node backend.

---

## Prior release: Vintage v0.8 — FFA physics update

An independent cell game built from the Vintage project files and your reference screenshots. This is a complete **frontend + optional Node.js WebSocket backend** source package. Do not confuse the local preview with a publicly hosted multiplayer game.

## What's new in v0.8

**FFA physics update based on the user-supplied 2-minute FFA reference video.** This is an independent, testable approximation of the visible behavior, not a claim of perfect Senpa parity.

- Reworked movement response and frame-rate-independent split boost: pieces now travel visibly before losing momentum.
- Fixed the previous separation rule that made merge practically impossible. Fragments now merge consistently after a mass-adjusted cooldown.
- Corrected cell-eating overlap checks to require a real collision and sufficient mass advantage.
- The front-end and authoritative Node server use **one source of physics rules** (`public/physics.js`, synced to `server/physics.cjs` with `node scripts/sync-physics.cjs`).
- The crystal-virus behavior from v0.7 stays enabled and tested; FFA, Dual and Mega keep their own mode rooms and 10 bots each.

Read `PHYSICS-FFA.md` for tuning parameters and known differences from the reference.

## Previously added in v0.7

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
   git commit -m "Vintage v0.8 FFA physics and merge update"
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

Automated tests cover isolated rooms, mass conservation, split direction, FPS-consistent launch motion, merging, eating, virus feeding/bursting, NPC counts, Mega multibox setup, and WebSocket spectator protocol handling (with a test double). **22 automated tests pass.** A full browser smoke-test was attempted but this sandbox blocks browser navigation to local test servers; browser interaction with v0.8 must still be verified after deploying it. Network integration with an externally hosted Node server was not tested in this environment; deploy the backend separately before claiming live multiplayer is verified.
