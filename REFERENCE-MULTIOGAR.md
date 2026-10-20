# Comparison notes: MultiOgarII (Apache-2.0) vs Vintage

Read from github.com/m-byte918/MultiOgarII (src/config.js, Server.js, entity/*). The numbers are that project's defaults, NOT Senpa's. Ideas only; no code was copied.

| Rule | MultiOgarII | Vintage now |
|---|---|---|
| Server tick | 25 Hz (40 ms) | 20 Hz sim, 10 Hz broadcast |
| Size unit | radius; mass = radius^2 / 100 | radius = 2.45*sqrt(mass) |
| Move speed | `2.2 * radius^-0.45 * 40` px/tick | `baseSpeed / mass^power`, clamped |
| Eat rule | eater radius >= 1.15 x prey, distance < eater.r - prey.r/3 | mass x1.25, overlap 0.39 |
| Max cells | 16 | 64 |
| Split launch | `780 * size^0.0122`, boost decays 1/9 per tick | 620*(1000/mass)^0.12, drag 3.2/s |
| Merge time | max(30 s, radius*0.2 s) | 8-27 s by mass |
| Fresh-split ignore | 13 ticks (~0.5 s) before pieces can touch | none |
| Decay | 0.2 % per second above min size | 0.1 % every 12 s |
| Eject | cooldown 3 ticks (~8 Hz), random +-0.3 rad spread | 85 ms hold repeat, no spread |
| Virus | pops a cell into halves; shoots a new virus at max size | pops into 5-15 equal pieces; shoots after 7 pellets |
| Viruses / food | 50 (max 100) / 700 | 28 (max 34) / ~280 |
| Network | binary packets + quadtree view culling | JSON, full state to everyone |

## Worth borrowing later (not done)
1. View culling: send each client only what is near its view (needs the client to report zoom, so a protocol change).
2. A ~0.5 s no-touch window after a split so pieces do not instantly merge back.
3. Random +-0.3 rad eject spread for the natural "spray" look.
4. Binary packets instead of JSON, to cut bandwidth.
