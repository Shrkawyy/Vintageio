# Vintage v0.9 — FFA speed calibration

The new FFA movement constants are in `public/physics.js`:

| Parameter | v0.8 | v0.9 |
|---|---:|---:|
| baseSpeed | 950 | 660 |
| speedPower | 0.245 | 0.260 |
| maxSpeed | 375 | 290 |
| splitImpulse | 810 | 620 |
| splitDrag | 2.75 | 3.20 |
| steerDuringBoost | 0.42 | 0.32 |

This was adjusted from Vintage's own gameplay capture showing overspeed, not from measured internal Senpa constants. These are a starting calibration, not exact duplication. Dual and Mega have their prior movement profile. After physics edits, run `node scripts/sync-physics.cjs` to regenerate authoritative server code.

For Multi Tab respawning and continuous Macro Feed, see README.md. Any changes to `server/` must also be deployed to the persistent Node game server for live multiplayer.

---

# Vintage v0.8 — FFA Physics Reference

Reference video: `Video Project 1 (1).mp4` supplied 2026-10-20, approximately 120.6 seconds at 1280×720 and 30 FPS.

The reference shows multi-cell play, repeated splits, tracking movement and interactions among colored players and viruses. Video pixels do **not** reveal Senpa's proprietary simulation tick-rate, world coordinates or hidden constants. Consequently, the rules below are an independently implemented approximation, **not** an exact reimplementation.

## Fixes compared with Vintage v0.7

1. **Split launch momentum:** The old factor `Math.pow(.83, dt*30)` caused a severe loss of velocity. The new `physics.js` uses closed-form exponential damping so travel is much more consistent at 20 / 30 / 60 FPS.
2. **Reliable merge:** Formerly pieces were always forced apart, even after merge cooldown. New code separates pieces only while merging is locked; when merging becomes legal it permits overlap, attracts nearby parts and fuses them deterministically.
3. **Mass conservation:** Splits preserve total cell mass; merging and eating transfer mass rather than duplicating it. Virus bursts add the defined virus mass bonus.
4. **Eat threshold:** Bigger cells only eat pieces when sufficiently large **and** sufficiently overlapped. This avoids distant or edge-only consumption.
5. **Consistent online and offline feel:** `server/physics.cjs` is generated from the *same* browser module `public/physics.js` with `node scripts/sync-physics.cjs`. Don't edit the generated file directly.
6. **Performance:** NPC count is still 10 per game mode. World boundary constraints and the maximum of 64 fragments remain enforced.

## FFA tuning controls (source constants)

Open `public/physics.js`. Edit `FFA_PHYSICS`, then run `node scripts/sync-physics.cjs` to sync the server.

| Key | Meaning |
|---|---|
| `baseSpeed`, `speedPower` | How movement speed changes with mass |
| `splitImpulse` | Initial split-launch velocity |
| `splitDrag` | How quickly split-launch momentum fades |
| `splitGap` | Initial offset of a spawned fragment |
| `steerDuringBoost` | Steering control during strong launch momentum |
| `mergeBase`, `mergeMassFactor`, `minMergeTime`, `maxMergeTime` | Merge wait, adjusted for mass |
| `cellPush`, `mergePull` | Pre-merge separation and post-cooldown attraction |
| `eatRatio`, `eatOverlap` | Relative mass and overlap needed to eat another player |

The other two modes retain a distinct `OTHER_PHYSICS` profile, so their feel can be tuned separately when Dual and Mega reference videos are provided.

## Viruses (preserved from v0.7)

- Press `W` to eject food toward a virus.
- Seven ejected pellets consumed by a virus shoot another virus, subject to the cap.
- A cell with sufficient mass colliding with a virus bursts into smaller fragments; total cell mass is preserved with the defined virus bonus.
- The neon crystal look remains original to Vintage.
- Virus rules are in `public/virus-rules.js` and `server/virus.cjs`.

## Testing

Run `node --test tests/*.test.cjs` in the project root. The tests include split direction, launch travel, mass conservation, merging after cooldown, large split counts, collision thresholds, spectator handling, virus feeding and fragmentation, room isolation, and generated-module parity.

Automated tests are not a replacement for manually testing combat against live players. A public Vercel deployment runs the local game unless the **separate persistent WebSocket server** has been deployed and its `wss://...` URL placed in `public/config.js`.
