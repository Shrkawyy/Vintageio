# Live death view and FFA feed presentation

Trial: **http://localhost:3008/**. Refresh with **Ctrl+F5**.

Later changes also apply natural sizing/tweening to Dual and extend continuous spectating to the main button. See [the latest update](DUAL-WATCH-INTRO-OCT27.md).

## Death screen

The new Vintage glass card has two actions: **PLAY** and **SPECTATE**. The fullscreen overlay is transparent, with blur limited to the card.

When both owned connections die, the browser enters a read-only live view automatically. Online, the first socket changes to the server's existing spectator role and the dead secondary socket closes. Locally, the existing arena keeps ticking and its visibility is no longer restricted to the dead connections. The previous camera location is retained. Choosing SPECTATE dismisses the card without resetting the world; PLAY starts a new owned session. One dead multibox connection alone does not end the match. Existing automatic respawn remains optional.

## FFA only

The user explicitly selected **FFA only** for this feed change. Dual and Mega feed profiles, movement, split trajectories, mass transfer, cadence and collision behavior are unchanged.

- The previous extra 1.65 drawing multiplier is removed for FFA. The displayed feed radius now uses the particle radius directly, independently of the food and cosmetic feed sliders. For the current 14.7-unit pellet, the comparison fixture changed from 6.36 to 3.85 screen pixels beside the same 95-pixel cell: about 39.4% smaller in radius/diameter.
- FFA pellets appear fully opaque from the first frame instead of fading in over 80 ms.
- Feed presentation uses linear interpolation from the current visible position to the latest target over the selected Animation delay. Retargeting retains the current visible position; Animation 0 is immediate. The physical flight and collection calculations remain authoritative.

## Reference and limits

The public [Senpa client](https://senpa.io/web/assets/main-CYoq09wt.js), obtained from the [official page](https://senpa.io/web/), was inspected as a reference on October 27, 2026. Its ejected-mass sprite scales a circular texture directly from the particle radius. Its generic cell animation advances the current tween before retargeting and interpolates linearly over `cellAnimation`. Its macro input forwards held/released state.

These are client presentation/input observations. They do **not** establish Senpa's authoritative ejected mass, cost, emission interval, flight constants or server collision rules. The earlier supplied Senpa recording showed MegaSplitX, not an independently measured FFA session. The isolated public-browser observation received no live world, so it did not produce server measurements. Exact server-physics parity is not claimed and server numbers were not invented for this update.

REA CLI evidence was retained for the public JavaScript artifact; its semantic graph is incomplete because parsing the large bundle exhausted the analysis worker's heap. The rendering and tween statements above were independently located by ordinary static source inspection. Source digest, byte offsets and limitations are in `artifacts/death-ffa-oct27/ffa-reference-findings.json`. No third-party client implementation was copied into the game.

## Validation

- `node --test tests/*.test.cjs`: FFA sizing, linear tween timing and retargeting, frame-rate independence, source-state immutability, mode physics and existing identity/skin/replay features.
- `python scripts/check-death-browser.py`: actual death, transparent overlay, live NPC movement, same-world spectating, PLAY and single-connection survival across local/online FFA, Dual and Mega.
- `python scripts/check-dual-tar-browser.py`: actual FFA/Dual controls, feeding, multibox and held run-split.
- `python scripts/check-feed-visual.py`: both real canvas renderers at identical mass and zoom; a static comparison fixture rather than live gameplay footage.
