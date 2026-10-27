# Reading dual.tar and testing its physics in Vintage

**October 27 update:** the active FFA/Dual profiles now use the [Senpa video calibration](SENPA-OCT27-CALIBRATION.md), including a 100,000 auto-split threshold. The walkthrough below records the earlier archive port. Its untouched reference profile remains available as `DUAL_TAR_REFERENCE`; source-comparison tests use that explicit profile where tuning has changed.

The test game runs at **http://localhost:3008/**. The original Vintage folder is unchanged. This folder is a separate experiment; use `RUN-VINTAGE.cmd` here to restart it.

Source archive: `C:/Users/sch2/Downloads/dual.tar`, SHA-256 `318f24bcc05aa5c3fc4b09110ac9c8be4cdc9bbc0c2753fd1cb257c95dc24aa3`. It contains a modified MultiOgar-Edited server, identified by package metadata as 1.6.2 (the server's own version string is 1.6.1). Source files were selected from the TAR as ordinary files, excluding Git history, shell history, logs, account data and package-manager configuration. Archive entry points and install scripts were not run.

## 1. Find the settings that actually run

Reading `src/gameserver.ini` alone gives the wrong physics. `serverGamemode=0` selects `gamemodes/FFA.js`; `GameServer.start()` invokes that mode's `onServerInit()` after configuration loads. The mode overwrites several INI values and replaces `Virus.prototype.onEat`.

| Setting | INI | Active mode value | Test copy |
|---|---:|---:|---:|
| Player speed multiplier | 1 | 1 | 1 |
| Split launch coefficient | 920 | 920 | 920 |
| Start radius | 600 | 500 = 2,500 mass | Existing FFA 1,000 / Dual 500 mass |
| Minimum player radius | 31.6228 | 85 | 85 |
| Minimum manual split radius | 59.1608 | 121 ≈ 146.41 mass | 121 |
| Maximum pieces | 90 | 90 | Existing x16 |
| Auto-split radius | 30,000 | 150,000,000 | Existing 1,500 = 22,500 mass |
| Ejected pellet radius | 56.06 | 45 = 20.25 mass | 45 |
| Ejection loss radius | 57.43 | 50 = 25 mass | 50 |
| Ejection cooldown ticks | 0 | 0 | One volley per 40 ms simulation tick |
| Virus radius | 200 | 200 = 400 mass | 200 |
| Virus maximum count | 17 | 50 | 50 |
| Virus response to feed | Grow/split in base class | Push by 220; no growth | Push by 220 |

The supplied file is named `dual.tar`, but its active mode calls itself `MegaSplit 1` and implements two player trackers per socket. File names are not reliable evidence of which settings execute. This test applies its movement/collision kernel to both Vintage FFA and Dual.

## 2. Convert size to mass

`entity/Cell.js:setSize()` computes:

```text
mass = size² / 100
size = 10 × sqrt(mass)
```

`size` is the geometric radius. The archive confusingly calls `size²` the `radius` field. That field is squared radius, used as an area/mass proxy, rather than the visual radius.

Vintage already uses a distance conversion factor of **0.245**. The port applies that factor to lengths and speeds together; mass and real time remain unchanged. Thus radius 100 in the archive is radius 24.5 in Vintage coordinates.

## 3. Cursor movement and speed

`GameServer.timerLoop()` advances one tick every **40 ms**, or **25 updates per second**. `PlayerCell.getSpeed()` calculates a maximum displacement for one update:

```text
step = 2.2 × sourceRadius^(-0.439) × 40 × playerSpeed
```

`movePlayer()` points the movement vector toward the cursor and scales it by `min(cursorDistance, step) / cursorDistance`. Cells slow down as they grow and stop at a nearby cursor. There is no hard minimum-speed plateau or added movement acceleration.

The archive's `Vec2` distance calculation truncates the x/y components to integers. The test preserves this small cursor dead zone, with a tiny rounding guard to prevent converting a scaled integer such as 220 into 219.99999999999997 before truncation.

| Mass | Previous Vintage speed | Archive speed in Vintage units/s | Merge eligibility |
|---:|---:|---:|---:|
| 100 | 102.47 | 71.38 | 30.00 s |
| 500 | 71.94 | 50.14 | 44.72 s |
| 1,000 | 61.77 | 43.06 | 63.25 s |
| 5,000 | 43.36 | 30.25 | 141.42 s |
| 22,500 | 31.15 | 21.74 | 300.00 s |

These are code-derived steady cursor speeds in the same distance units, not measurements of a video or a claim that either game renders at the same camera zoom. The archive's movement is approximately 30% slower than the previous Vintage OgarX profile at these masses.

## 4. Splitting and boost

`splitCells()` processes the current pieces toward the cursor. A piece must reach source radius 121 and leave a parent of at least radius 85. `splitPlayerCell()` halves its mass and creates the child **at the exact parent centre**, rather than adding an initial offset.

The child's launch budget is:

```text
launchDistance = 920 × childSourceRadius^0.0122
```

That is remaining travel distance, not pixels per second. `boostCell()` moves by `boostDistance / 9` and keeps the other `8/9` each 40 ms update. The sum of those shrinking steps approaches the initial launch budget. The port uses `(8/9)^(25 × elapsedSeconds)` so its boost math agrees at source ticks and remains stable for fractional direct calls.

Splitting preserves the old parent's age and gives the child age zero. Macros advance one split round per simulation tick. Existing x16 mode limits remain in place. Starting at 1,000 mass does not guarantee x16: a piece must still meet the source's minimum split size; grow before testing x16.

## 5. Why pieces separate softly

`checkRigidCollision()` ignores sibling collision until both pieces reach age **13 ticks = 520 ms**. Before they can merge, `resolveRigidCollision()` separates overlap using relative squared radius (equivalent to relative mass) and multiplies each displacement by **0.3**.

```text
overlapFactor = (radiusA + radiusB - distance) / distance
pushA = relativeVector × overlapFactor × massB/(massA+massB) × 0.3
pushB = relativeVector × overlapFactor × massA/(massA+massB) × 0.3
```

The smaller cell moves farther. The original player scan can visit a pair twice in a tick; the port retains that pair-search behaviour. Exactly coincident cells skip the push, as in the source. Launch movement first separates freshly split pieces; no random separation angle is invented.

## 6. Merge timing and eating

`movePlayer()` sets merge eligibility from:

```text
mergeSeconds = max(30, sourceRadius × 0.2)
```

Both siblings must be eligible and sufficiently overlap. This produces much longer waits for large cells than the old Vintage profile. Eligibility does not pull distant cells together.

For different owners, an eater needs at least **1.15 times the victim's radius**, equivalent to **1.3225 times its mass**. The swallowing test is:

```text
distance < eaterRadius - victimRadius / 3
```

Matching tags and linked ownership do not create immunity. A large cell at radius 250 or more receives no growth from player pieces of radius 41 or less when `playerBotGrow=0`, although those victims can still be eaten. The port retains that source rule.

One deliberate small fix: merge eligibility still progresses when the cursor sits exactly on the cell. The archive returns early from `movePlayer()` at that point and can leave its cached merge flag stale.

## 7. Feed placement and reception

Each successful ejection removes **25 mass** and makes a pellet of **20.25 mass**. It starts at the edge of the source **after** the source shrinks. Its remaining launch budget is **780 source units**, decaying by the same `1/9` rule.

The last angle assignment in `ejectMass()` is the one that executes:

```text
angle = cursorAngle + random() × 0.4 - 0.3
```

So spread is **−0.3 to +0.1 radians**, approximately −17.2° to +5.7° in the code's `atan2(x,y)` convention. Its mean is biased; the comment above it does not make the spread zero. Both normal and held feed are bounded to one volley per 40 ms simulation update. The archive's network handler stores a boolean W request, so zero configured cooldown does not mean unlimited independent volleys in one game update.

Reception uses current collision geometry. There is no artificial credit to a selected recipient, source refund timer, owner protection, legacy cluster teleport placement or swept-path collision. With overlapping split pieces, freshly ejected pellets may immediately be eaten by siblings. The receiver gains 20.25 while the sender loses 25.

## 8. Decay, viruses and boundaries

`updateSizeDecay()` runs once each 25 ticks. Only cells above radius **316.227766**, about **1,000 mass**, decay. Each qualifying update multiplies mass by **0.998**, a 0.2% loss. The port retains the source's global tick phase.

The active mode replaces normal virus growth with a push of **220 remaining source-distance units** in the pellet direction. Virus mass remains **400**. It stops swallowing ejected pellets at 50 viruses. Eating a virus uses the archive's `Virus.onEaten()` mass distribution and splits only the struck piece into available slots, with the project's x16 cap. The port bounds output slots and rejects invalid fragments to keep values finite.

`Cell.checkBorder()` clamps cell centres using **half the cell radius** and reflects boost on each crossed axis. The same boundary rule is used here, so a cell can visibly overlap the map edge by half its radius.

## 9. What belongs to Vintage rather than this archive

The original Vintage installation is untouched. In this test copy, FFA and Dual use the new kernel in both local and authoritative simulation. Mega's complete physics configuration matches the saved pre-port fixture. FFA still starts at 1,000, Dual at 500, both cap at x16 and auto-split at 22,500; the archive's active auto threshold is effectively unreachable and its cap is 90, which are different server-mode choices.

World size, ordinary food layout, bot policy, skins, shields, flags, replay controls, animation delay settings, chat and account services remain Vintage's. The source's virus base size, push behaviour and 16-virus target are applied to FFA/Dual. Existing safe owned-connection spawning remains in place.

Vintage uses a spatial grid and its own network snapshots rather than copying the archive's quadtree and protocol. Arithmetic comparisons match the audited methods; arbitrary crowded collision ordering across those different spatial indexes is not claimed to be bit-identical. The local arena and server both use a 25 Hz fixed update for these modes, with a bounded catch-up budget. Mega retains its 20 Hz fixed update. Unobserved server rooms pause simulation.

The source also contains unrelated runtime defects: an undefined `g123123` in its round transition, misspelled `tickCoutner` in input throttles, and assignment of `movingNodes = null` inside its movement scan. Its restart comparison treats the loaded value as ticks despite the INI documentation describing minutes. Those startup/round/network systems are not part of this physics port.

## 10. Files and verification

- `public/dual-tar-kernel.js`: the ported movement/collision/eat/boost/split/feed/virus kernel, with Apache-2.0 attribution.
- `public/physics.js`: selects the kernel for FFA/Dual and preserves the previous Mega profile.
- `server/dual-tar-kernel.cjs`, `server/physics.cjs`: generated Node equivalents. Run `node scripts/sync-physics.cjs` after editing the browser source.
- `tests/helpers/dual-tar-oracle.cjs`: a bounded harness that evaluates only the audited original arithmetic/entity methods; it does not start the old server, load its accounts or install its packages.
- `tests/dual-tar-physics.test.cjs`: direct source-method comparisons, collision/feed/merge checks, fixed-step parity and a twenty-second finite-state stress simulation.
- `scripts/check-dual-tar-browser.py`: real Chrome controls against a separate fixture process, covering local/online FFA/Dual, Space, x16, held feed and Tab.
- `artifacts/test-results.tap` and `artifacts/browser-controls.json`: actual check results. The browser fixture sets test masses and positions for deterministic controls; it does not modify the user-facing localhost:3008 server.

Run the test-copy suite with `node --test tests/*.test.cjs`. Source/license copies and the archive inventory are in `vendor/dual-tar` and `vendor/dual-tar-inventory.json`.
