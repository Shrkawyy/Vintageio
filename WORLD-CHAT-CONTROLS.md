# Larger Mega world, background and controls

Mega now uses a 7,200 x 7,200 world, up from 4,800 x 4,800: 1.5 times the
side length and 2.25 times the area. FFA and Dual remain 4,800 square. The
mode size is shared between browser and Node physics. Movement, split boosts,
feed, safe spawn and respawn, bots, viruses, clipping, background placement,
sector labels, minimap positions, spectator camera and snapshots use it.
The 5,000 Mega start, 64-cell maximum, 100,000 auto-split threshold, bot limits,
respawn timers and recently tuned Mega movement are preserved.

The Vintage background image is preserved. The blue grid defaults off and
migrates off for existing profiles. Turning off the background image leaves
the canvas black. Grid display remains available in Game > Render.

A virus distributes the entire struck cell's mass plus the existing 100-mass
virus bonus equally across its resulting fragments. It fills remaining slots
up to 64, maintaining a 25-mass minimum for new fragments. Other cells retain
their own mass. At the cell cap, the virus is consumed without exceeding it.
Existing merge deadlines are respected.

Chat history remains visible. The composer is hidden until Enter (or the
configured Open / send chat binding); Enter submits once and closes it, including
an empty composer. Escape closes without sending. Emoji insertion remains
available while composing. Text entry does not trigger gameplay hotkeys.

S toggles player skins through the renderer's showSkins flag; skins and optional
cell effects are suppressed while off, without changing the background. The
renderer supports a per-cell or per-player skinUrl and clips images to the cell.
H toggles the HUD, chat, leaderboard, minimap, status panels and grid/sector/border
overlays together. It restores the saved display preferences when toggled back.
Gameplay cells and the background remain visible. Settings are still accessible
from the lobby. Default S no longer opens Settings.

The controls migration preserves custom movement/mouse bindings, reserves S for
skin visibility and H for the HUD, and adds the chat binding to the keyboard UI.
Both bindings remain editable. Existing background image preferences persist.

Validation: 115 automated tests, plus browser checks for settings migration,
Enter/open/send/close, rebinding chat, S/H, background image removal to black,
movement past the former Mega boundary, and a full 64-piece virus burst.
