# FFA update ? 23 October 2026

See [FFA-2026-10-23.md](FFA-2026-10-23.md) for the current FFA-only tuning,
22.5K automatic split, private tags, crystal reproduction, Vintage Atlas sectors,
working border/glow controls, scalable animated sectors, Background Studio,
live Scene Lab, the Vintage Control Room, validation and startup instructions.
Tag-only voice is included; see [VOICE-SETUP.md](VOICE-SETUP.md) for controls and
Internet HTTPS/WSS + TURN configuration.
The latest bug fixes cover smooth virus launches/bursts, ordinary feed colors
that stay fixed across Tab switches, eating your freshly respawned owned
connection, and spawning that connection beside your nearby fragment.
This supersedes earlier FFA feed/cap descriptions below. Mega and Dual keep
the previous release profiles and await separate tuning.

# Mega stability, input and chat — 22 October 2026

See **MEGA-STABILITY-INPUT-CHAT.md** for the comparison of the two latest videos
and the bot, mass, feed, split, control and chat fixes. Bots now spawn at 300–1,500
mass and return after five minutes outside player fragments. Mass decays
proportionally; MASS counts both owned connections and SCORE records the peak.
Controls migrate automatically to physical English keys, and every mouse button
supports all split/feed/switch actions. Names no longer receive ` II`; matching
tags share a bright label color, and untagged names/mass are white.

# FFA video calibration — 22 October 2026

FFA movement and split launch are now calibrated against the supplied `ffa.mp4`.
See **PHYSICS-FFA-CALIBRATION.md** for measurements, applied settings, validation,
and limits. Mega is now calibrated separately from `shrkawyy.mp4`; see
**PHYSICS-MEGA-CALIBRATION.md**. Its cells automatically split at 100,000 mass;
FFA and Dual retain 25,500. Dual still awaits its own recording. The playable
page is `public/index.html`; the current default configuration uses local AI.

**Cell animation:** Settings → Game → Cells → Animation controls visual movement
and size transitions from 0–500 ms (default 120 ms). Lower values respond faster;
0 displays changes immediately. It saves in the browser and is included in
settings import/export. Physics, movement speed and authoritative mass stay the
same. Online animation uses stable cell IDs from the updated Node backend.

**Cell appearance:** Theme → Cells provides opacity, independent nickname/mass
sizes, compact mass labels and Multibox / Normal colors. Multibox fills the
controlled connection's cells with blue (`#09759d`) and the other connection
with fixed white, matching the Mega recording. Tab swaps their active state,
including split fragments and online play. Normal keeps the game colors and
uses a blue active border / white inactive indicator. Theme → ActiveCell
adjusts the active color, inactive indicator radius (0–200%) and outline width
(default 10%). Multibox bodies stay flat; indicator controls apply to Normal.
The camera follows both connections without switching its target on Tab.
Single-connection play and spectators use each player's underlying game color.
Set `multi:false` on an entry in `public/config.js` to start only one connection;
FFA, Dual and Mega keep their existing multibox support. Primary/secondary cell,
nickname and mass color overrides have been removed from settings, presets,
custom themes and imports. Locked-name styling is reserved for a future change.
Canvas cell effects restores Vintage's shaded cell style; the default is flat.
This option affects cell rendering only.

# Current release: Vintage.io v13

Start with **UPDATE-v13-AR.md** for the latest grid map, team visibility, improved chat and scheduled world reset instructions. The v12/v11 notes below document prior versions.

---

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
- **Smarter bots:** Local and server bots look for nearby cells they can eat with a split, aim toward the selected prey and attack only when the split remains edible and no larger nearby cell makes the attack unsafe. Bots continue to evade dangerous cells and ignore spawn-protected targets.
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

All **171 automated tests pass**. They cover isolated rooms, mass conservation,
movement, merging/eating, virus reproduction and animation, multibox ownership,
nearby spawning, stable feed colors, input, visibility, settings and voice.
The browser scripts under `scripts/check-*-browser.py` exercise the actual
local client and local WebSocket server. The latest regression evidence is
`artifacts/ffa-2026-10-23/multi-virus-browser-check.json`. Public deployment and
Internet TURN connectivity still need testing on the deployed hosts.
