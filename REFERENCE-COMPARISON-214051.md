# Senpa reference follow-up: 21:40:51

Available reference: `Senpa.io - Play and 5 more pages - Personal - Microsoft Edge
2026-10-22 21-40-51.mp4`, 227.8679 seconds, 1920 x 1152.
The separately supplied Vintage recording ending `20-49-52.mp4` was absent
from its stated location. The comparison therefore uses the available Senpa
capture, the current executable Vintage simulation and the earlier cached
Vintage reference frames. It does not claim to have inspected the missing file.

Frames around 6, 31, 75, 158 and 164 seconds show complete daughter circles
during splits, dense trains of small pieces, and feed moving between nearby
pieces. Two implementation defects made these interactions unreliable:

* Feed movement used continuous damping, but receiver collision tested only
  the endpoint. A 780-unit/s pellet could cross a 25-mass receiver in a single
  20-Hz update without either endpoint falling inside it. Collection now tests
  the complete flight segment, selects the first eligible cell, respects source
  grace and caps NPC gains as before. A cell in front of a virus intercepts the
  pellet; a virus in front of a cell still receives it first.
* A newly split visual daughter started with radius 13 regardless of its actual
  mass, producing a growing dot. Its initial displayed radius now matches its
  simulated size while its position continues to interpolate smoothly.

The child also inherits the parent's full merge deadline. Further splitting
cannot create a daughter with an earlier deadline than its parent.

The last requested Mega medium feed remains 32 spent / 24 emitted, 780 units/s,
2.6/s damping, 120-ms feed / 75-ms macro repeat, and the 20-second merge lock.
FFA/Dual tuning, bot respawn rules, saved visuals and keybindings are preserved.
No new unmeasured Senpa constants were inferred from the missing Vintage video.

Validation includes small-receiver tunneling, first-hit ordering independent of
player order, source/sibling grace, virus/cell obstacle order, 20/30/60-Hz feeding,
inherited merge locks and the existing split trajectory regressions.
