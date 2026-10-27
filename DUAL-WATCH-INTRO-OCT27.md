# Dual feed, continuous spectating and the Vintage burst intro

Trial: **http://localhost:3008/**. Refresh with **Ctrl+F5**.

## Dual feed

Dual now draws the physical pellet radius directly, removing its previous 1.65 cosmetic enlargement. It uses the same linear feed presentation over the selected Animation delay as FFA, without a spawn fade. Animation 0 is immediate. Feed is independent of the map-food size slider; the obsolete cosmetic feed slider is no longer shown. Old settings imports remain readable.

This update changes Dual presentation. Emitted mass, cost, cadence, flight, collection, movement and split rules have not been retuned or represented as recovered Senpa server constants. FFA retains its previous fix and Mega retains its own profile.

## Spectate without restarting

The main SPECTATE button now converts the existing session into a read-only view. Online, it reuses the primary WebSocket and the server's existing spectator role. Locally, it removes the owned connections from the running arena while preserving NPC objects, food, viruses and simulation time. Repeated SPECTATE clicks are idempotent. Camera position and effective zoom are retained; mouse-wheel zoom and the zoom setting still work while watching.

This covers entering from the lobby or an active match, in addition to the already-supported death-screen action. Spectating does not navigate/reload the page or replay the loading scene.

## Server switching

Selecting a different server no longer opens the confirmation dialog. Active players immediately join the new selection; spectators continue watching on the new selection. Choosing the current server does not restart the session.

Join, spectate and reconnect packets now carry the selected server ID. The actual server ID returned in the welcome packet is retained for an in-place switch to spectating, including non-default rooms of the same mode. Legacy/custom entries can still use the backend's existing mode fallback.

The STARTS AT … MASS line and starting-mass text in the server picker have been removed. Actual spawn mass is unchanged.

## Burst entrance

After the real resource progress reaches 100%, the Vintage logo breaks into eight image fragments with 28 crystal particles, a shockwave and a soft glow. The scene gets a short introduction interval even on a cached load, followed by a roughly 950 ms burst and fade into the lobby. It does not fabricate a slower loading percentage. Reduced-motion preferences skip the burst and use a short fade.

## Verification

- `node --test tests/*.test.cjs`: 85 tests, including local-world continuity and FFA/Dual feed sizing/tween behavior.
- `python scripts/check-dual-watch-intro-browser.py`: real local/online Dual feed, camera and world continuity, repeated spectating, direct switching between modes and between two distinct rooms of the same mode, no confirmation dialogs or page reload, cold/cached intro phases and reduced motion.
- `python scripts/check-death-browser.py`: local/online death-to-watch/play flows in all three modes.

Reports and screenshots: `artifacts/dual-watch-intro-oct27/`. Backend and physics source files match the previous release; this update requires a browser refresh and no server restart.
