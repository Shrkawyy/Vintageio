# Mode feed, merge timing and chat revision

Reference: the supplied Senpa recording ending `2026-10-22 19-12-11.mp4`,
452.266333 seconds at 1920 x 1152. The separately mentioned `ثسي.mp4` was
absent from the supplied path and could not be compared.

The 12-24 second section shows streams leaving individual fragments and feeding
nearby cells. The previous whole-cluster projection prevented that interaction.
This revision supersedes the feeding and merge descriptions in
MEGA-STABILITY-INPUT-CHAT.md; earlier movement/split trajectory fixtures still pass.

| Rule | FFA | Dual | Mega |
| --- | --- | --- | --- |
| Mass spent / pellet mass | 18 / 14 | 100 / 100 | 32 / 24 |
| Normal held feed interval | 140 ms | 120 ms | 120 ms |
| Macro feed interval | 80 ms | 75 ms | 75 ms |
| Placement | Source cell edge | Outside owned cluster | Source cell edge |
| Fresh feed between siblings | Allowed | Cluster grace of 600 ms | Allowed |
| Merge delay after split | Mass dependent, 15-30 s | Mass dependent, 8-27 s | Fixed 20 s |

These are explicit Vintage tuning choices informed by the visible behavior,
not recovered Senpa server constants. A split sets the parent's and child's
merge deadline. Splitting again gives those pieces a fresh deadline. Contact
alone cannot bypass it; after the deadline pieces must still overlap to merge.

Follow-up from `fi.mp4` (46.370833 seconds, 1920 x 1200): the second multibox
connection was too distant. Its requested gap is now 32 world units beyond
the two radii, and spawn validation requires 24 units beyond every fragment.
When the requested point is blocked, boundary candidates near that point are
checked before any global random placement. Mega feed now launches at 780
units/s with 2.6/s drag: about 278 units of travel in the first second, with a
300-unit limiting range, instead of the previous 500-unit range. Mass cost and
pellet value remain 32/24. These settings implement the requested medium feed.

FFA/Mega pellets identify their source cell: only that source has a short
recollection delay. Other fragments and the other connection can receive them
immediately. Feed loses the configured amount, preserves the mode's pellet
value, and expires after 12 seconds. Keyboard and all three mouse buttons use
the selected mode's cadence. The live backend uses the same profile's maximum
feed frequency; explicit macro-room overrides remain supported.

Sibling collision force ramps in over 200 ms and scales down in large clusters,
avoiding an abrupt separation of 64 overlapping pieces. Mega virus bursts retain
half of the combined mass in the main cell and distribute the rest among up to
15 new fragments, respecting the 64-cell cap. They use the same 20-second merge
deadline. Virus feeding tests the pellet's complete flight segment and selects
the first virus hit, so fast pellets cannot skip through it between updates.

The chat now has only two silver buttons, ALL and TAG, with a brighter selected
state. The NO TAG badge is removed. TAG still sends only to the matching tag.

Validation: 97 automated tests, including merge deadlines, repeated splits,
feeding siblings, per-mode costs/cadence, virus mass conservation and deadlines,
first-hit virus collision, and bounded 64-cell separation. Browser verification
also exercises all 30 mouse assignments and live WebSocket feeding/chat.
