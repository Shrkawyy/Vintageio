# Vintage v10.1 — hardening + bug fixes

## Fixed
- **Typing "s" in Name/Tag opened Settings.** The Settings hotkey was checked before the "is the user typing?" guard. Hotkeys are now ignored while any text field is focused (Esc still leaves the field).
- **Hotkey clash:** `Toggle skin` no longer defaults to `S` (it is "coming soon" anyway), so it cannot collide with `Settings`.
- **Feed threshold** is now identical offline and online (cells below 100 mass cannot feed).
- Lobby label said `v1.0`; it now says `v10.1`.

## Server hardening (deploy the `server/` folder again)
- **Split throttle:** a burst of 6 splits is allowed (so Q / T / D macros keep working), then 8 splits per second. Stops a modified client spamming split packets.
- **Origin allow-list:** set `ALLOWED_ORIGINS=https://your-game.vercel.app` on the game server host so other websites cannot open sockets to it. Empty = open (old behaviour).
- **Per-IP cap:** `MAX_CONN_PER_IP` (default 8; every Multi player uses 2 sockets). Behind Render/Railway also set `TRUST_PROXY=1` so the real client IP is used.

## Tests
`node --test tests/*.test.cjs` -> 33 pass (27 old + 6 new). A real `ws` server was also started and checked: wrong or missing Origin -> HTTP 401, allowed Origin -> connects.

## Not changed on purpose
FFA/Dual/Mega physics constants. They were calibrated from your reference video. See `REFERENCE-MULTIOGAR.md` for how a well-known open-source server (Apache-2.0) does it, if you want to compare.
