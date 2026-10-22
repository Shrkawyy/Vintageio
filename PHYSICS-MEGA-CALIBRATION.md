# Mega reference calibration — 22 October 2026

Current behavior: following the user's `22-20-15` Vintage video (73.542866 s,
1920 x 1152), Mega retains FFA feed, merge and virus rules, but has its own run
and split launch. Run base is 560 with a 55-unit/s floor. Split impulse is 780,
damping 2.8/s and mass exponent .04, with at least 1.05 daughter radii of total
boost travel. This avoids a large cell's launch shrinking relative to its body.
These are Vintage tuning choices; they are not recovered Senpa constants.
FFA stays unchanged. Mega starts at 5,000, caps at 64 cells and auto-splits at 100,000.

Stop movement is now a per-connection toggle (default P, rebindable in Controls).
Mouse updates cannot cancel it. It disables cursor steering while allowing
existing split momentum, collisions and legal merges to finish. Pressing the
same binding again resumes steering. The active connection's STOP MOVE state
appears in the mode pill, and network snapshots carry the authoritative flag.

This supersedes the earlier full FFA copy and historical Mega tunings below.

Historical reference: the supplied `shrkawyy.mp4`, 108.738033 seconds, 1920 × 1152.
SHA-256: `20f6370a55d7bf3a8eb959239ac47a2daadbbae088c63fecc900e5ce0fb2f8ed`.
The recording supplies visual measurements; the 100,000 auto-split threshold
comes directly from the user's instruction.

At 32.85–33.35 seconds, the approximately 9.2K blue cell moves relative to a
stationary pink virus. Scaling with the other connection's 4.9K circle and
regressing the corrected coordinates gives approximately 34.4 Vintage world
units per second. Tracking relative to the other player alone overestimates
speed because that connection is also moving. Mega now gives about 34.5 units/s
at 9,160 mass, compared with about 65.3 before.

At 33.38 seconds the blue connection splits, while the other connection stays
white. Its two daughter circles still overlap strongly at 33.55–33.85 seconds.
The outline fits give separations of approximately 0.32, 0.45, 0.52, 0.65, 0.71,
0.84 and 0.83 daughter radii at 50 ms intervals. The old immediate spawn offset
and early sibling collision over-separated these cells. The retained replay in
`tests/fixtures/mega-reference.json` contains the measured separations, pointer
path and movement samples. Source mass is inferred from rounded labels.

| Parameter | Previous Mega | Calibrated Mega |
| --- | ---: | ---: |
| Movement base | 700 | 370 |
| Minimum movement speed | 45 | 20 |
| Split impulse | 760 | 960 |
| Split damping | 3.6 | 4 |
| Spawn offset / daughter radius | 0.8 | 0 |
| Steering during boost | 0.32 | 0.75 |
| Sibling collision delay | 0.15 s | 0.6 s |
| Auto split / individual cell | 25,500 | 100,000 |

These fitted parameters run in the local Mega mode, the `senpa-mega` room and
`comp-mega`, which share the `senpa_mega` profile. FFA, Dual and the other server
profiles retain their existing rules. Auto split happens at exactly 100,000
mass per cell, divides only oversized cells, preserves mass and honors the
64-cell limit. Manual splitting remains available below 100K. Snapshots expose
the current threshold so the HUD displays progress for the largest cell.

The video shows rapid feeding between the two connections; this does not
establish same-player merge cooldown. The initial calibration retained those
rules. Subsequent mass, feed, bot and input fixes from two further recordings
are documented in **MEGA-STABILITY-INPUT-CHAT.md**. Rendering interpolation and network
latency affect observed motion, so these are fitted Vintage values rather
than recovered Senpa server constants. The split reference replay includes
120 ms visual interpolation and passes below 0.16 daughter radii RMS error
at 20, 30 and 60 Hz.

## ActiveCell correction

The connection that splits at 33.4–33.9 seconds is blue; Tab switches it to
white and the other connection to blue. Multibox now uses **blue for the
controlled connection and fixed white for the other**, including all split
fragments. This corrects the reversed active-white implementation.

Normal coloring retains the underlying game colors and uses the blue active
outline / white inactive indicator shown around 21 seconds. Indicator size
controls the white outline radius, and border width controls outline thickness;
these controls do not repaint multibox cell bodies. The camera follows both
owned connections, so switching their active state does not move its target.
Single-connection modes keep natural colors without multibox outlines.
Deprecated player/name/mass color overrides remain removed.

Regenerate the server physics with `node scripts/sync-physics.cjs` after edits.
Run `npm.cmd test` in `server`, restart a running Node backend and reload the
browser to load updated physics and renderer modules.
