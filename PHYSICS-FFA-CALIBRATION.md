# FFA video calibration — 22 October 2026

This calibration uses the supplied `ffa.mp4` (42.6513 seconds, 1920 × 1152).
SHA-256: `ee7b2d120c1fef93158c7f17c7f5068e678b83c2143156bf4fab84fc02dca694`.
The video is a reference recording, not Senpa server source or a network trace.

## Measured behavior

- Around 22.8–23.2 seconds, the unsplit player has approximately 1,000 mass.
  Tracking its position relative to a stationary pink virus, and dividing by
  the player's radius to compensate for changing zoom, gives roughly
  0.7–0.9 cell radii per second of movement.
- Around 24 seconds, a cell of approximately 994 mass splits into two cells
  of approximately 497 mass. The daughter initially overlaps its parent.
- From 24.6 to 25.4 seconds, both purple circles can be segmented separately.
  Their screen radius is approximately 33 pixels. Center separation grows
  from 2.24 radii at 24.6 seconds to about 2.62 radii at 25.1 seconds, then
  contracts as the recorded cursor changes direction.

`tests/fixtures/ffa-reference.json` retains the nine measured separations,
the sampled cursor targets, and the inferred starting position. Coordinates
are reconstructed relative to the stationary virus and scaled to Vintage's
mass/radius convention; they are not Senpa world coordinates. The replay's
24.04-second onset is fitted within the visible split transition.

## Applied to FFA

| Parameter | Previous | Calibrated |
| --- | ---: | ---: |
| Movement baseSpeed | 660 | 370 |
| Split impulse | 620 | 340 |
| Split damping per second | 3.2 | 1.8 |
| Spawn offset in daughter radii | 0.8 | 0 |
| Steering multiplier during boost | 0.32 | 0.75 |
| Sibling collision delay | 0.15 s | 0.5 s |

Lower initial launch and slower damping spread the split travel over time.
The collision delay allows the initial overlap seen in the recording.
These are fitted Vintage parameters, not recovered original constants.

Both the local FFA demo and the authoritative FFA rooms resolve to this profile.
`senpa-ffa` uses the explicit `senpa_ffa` preset; legacy `mode: 'ffa'` still
joins `vintage-ffa`. Dual and the other presets retain their previous values.
Mega subsequently received its own calibration from `shrkawyy.mp4`, documented
in **PHYSICS-MEGA-CALIBRATION.md**; this does not alter the FFA fit above.

## Limits and checks

The recording includes camera zoom, rendering interpolation, a displayed
latency of approximately 65–73 ms, and moving targets. This fit is approximate.
It covers movement near 1K mass and one clean split trajectory; it does not
establish the full mass/speed curve, feed timing, eating thresholds, virus
rules or merge cooldown. Repeated splitting prevents an isolated merge-time
measurement, so those rules retain their prior values.

Run `node scripts/sync-physics.cjs` after editing the source physics module,
then `node --test tests/*.test.cjs`. The reference test checks the recorded
separation trajectory at 20, 30 and 60 Hz with a tolerance of 0.3 daughter
radii RMS; it also checks movement speed and initial overlap. Existing tests
cover mass conservation, merging, eating, respawn and generated server parity.

Reload the browser after updating. A running Node backend must be restarted
to load its regenerated physics module. The current default configuration
still plays locally unless a WebSocket endpoint is configured.
