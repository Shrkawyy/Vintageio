# Mega fixes, controls and chat — 22 October 2026

Compared the two supplied recordings:

| Recording | Duration | Resolution | SHA-256 |
| --- | ---: | --- | --- |
| Vintage / VS Code, `17-41-07` | 89.1722 s | 1920 × 1200 | `0f7c3da22a4299a2ecdf21f2a42d70bf296bc074621f71bad4281bee0abe6b65` |
| Senpa / Edge, `17-47-51` | 291.552733 s | 1920 × 1152 | `2623ee3ecb4da0be7a760d3a8ae74284be88d2634ca279894132e303f1cc0480` |

## Comparison and fixes

| Behavior | Previous Vintage | Updated Vintage |
| --- | --- | --- |
| Incoming bots | Immediately replaced after being eaten, potentially inside player fragments; Mega bots could start near 8.5K | Random 300–1,500 in FFA, Dual and Mega, maximum total bot mass 1,500; replacement after 300 seconds and only in free space |
| Mass growth | Immediate replacements created a recurring source of mass; negligible decay | Frame-rate-independent proportional decay, safe bot and food placement, capped bot gains during eating rather than only at the end of a tick |
| Feed | Could appear inside another fragment of the sender and immediately refund its mass | Shoots beyond the sender's complete cluster; sender cannot collect fresh pellets for 0.6 seconds; other connections can receive them immediately |
| Multi-splits | All rounds created from the same initial position | Complete 2/4/8/16/32/64 commands, with later rounds spaced 40 ms apart and executed by the simulation |
| Name/labels | Second connection acquired ` II`; mass was pink | Both connections use the exact chosen name. Untagged names and mass are white; normalized matching tags share a bright assigned color |
| Input | Saved bindings could collide; keys followed typed characters and keyboard layout | One automatic controls migration; physical English key labels, unique bindings and working actions for left/middle/right mouse buttons |
| Chat | Large opaque HUD panel | Transparent history at the left, ALL/PARTY tabs, timestamps and a centered composer with working emoji insertion |

In the Senpa capture, the large Warrior cell declines from approximately 76.1K
at 0.1 seconds to 74.4K at 4 seconds. A decay constant of 0.006/s is consistent
with that scale. Vintage now applies `mass *= exp(-0.006 * dt)` above a 25-mass
floor. Bigger cells therefore lose more absolute mass each second. Eating still
transfers the consumed cell's mass; splitting conserves mass. Bot gains are
capped immediately, preventing a bot from chain-eating past 1.5K within one
update and consuming a larger player before the cap is applied.

The HUD's **MASS** and top **YOUR TOTAL MASS** now count both owned connections;
Tab no longer changes the meaning of the number. **SCORE** records the session
peak. Current mass declines with decay and feeding, while the peak remains.

Mega feed costs 32 mass and emits 24, allowing a 5K player split into 64 pieces
to feed. The 8-mass loss per pellet is a Vintage balancing choice; the video
does not establish Senpa's original pellet constants. FFA/Dual retain their
100-mass feed cost/value. Pellets launch at 1,100 world units/s with 2.2/s drag,
expire after six seconds and follow the visual color of their owner. Firing
against a wall does not clamp pellets back inside the sender. Free-space
placement checks all player fragments; if the map has no safe space, a bot
waits and retries instead of spawning inside a player.

## Controls

| Action | Default key |
| --- | --- |
| Split / double / triple | Space / Q / R |
| Split 16 / 32 / 64 | T / F / D |
| Feed / held macro feed | W / E |
| Switch connection | Tab |
| Stop movement | P |
| Chat / ALL–PARTY / show chat | Enter / C / V |
| Settings / menu | S / Escape |

Controls → Mouse offers None, Feed, Macro Feed, Split, Double Split, Triple
Split, Split 16, Split 32, Split 64 and Dual Toggle for each of the three
buttons. Macro Feed works while held; release, focus loss, menu and settings
stop held actions. Right-click steering remains optional when its action is
None. Changes save immediately. Controls are displayed in English and remain
usable when the operating system's active layout is Arabic. Assigning a key
removes conflicting assignments; Backspace clears a binding. Unsupported and
modifier-only keys cannot trigger an unbound action.

Old controls reset once automatically, while visual preferences remain saved.
The controls page also has RESET CONTROLS. Removed nonfunctional control rows
are no longer presented as available actions. Mouse wheel zoom can be inverted.

## Validation

`npm.cmd test` in `server` covers the shared browser/server physics, timed and
safe bot replacement, the bot mass cap during chain eating, a six-minute mass
budget reproduction, proportional decay, feed placement and loss, small-fragment
feeding, all macro sizes, settings migration and tag identity. Existing FFA and
Mega video-trajectory regressions remain in the suite.

Browser checks exercised the six keyboard split sizes, Arabic-layout D without
closing chat, all 30 mouse/button-action combinations, persisted controls, exact
multibox names, tagged/untagged label colors, combined mass/peak score, emoji
insertion, mobile layout and chat entry without game hotkeys. Live local
WebSocket checks exercised held macro feed, a complete 64-cell split command,
feeding from 64 cells, emoji messages, ALL broadcast and PARTY delivery to the
matching tag without exposing messages to another tag. These checks use the
local backend; public hosting has not been configured.

Run `node scripts/sync-physics.cjs` when changing the shared physics or virus
sources, then restart the Node backend. Reloading the browser loads the updated
module URLs and migrates controls automatically.
