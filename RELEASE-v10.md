# Vintage v10 — original open-world lobby

## What changed

- Replaced the previous three-column card lobby with a full-screen game-backed home screen (the Canvas is still live behind it).
- New independent Vintage identity: crimson/steel-blue lighting, custom split-cell emblem, floating circular light rings, top navigation, a bottom-left launch dock, and a bottom-right mode selector. This is not a copy of another game's branding or assets.
- Removed the bottom hotkey guide from the page and its inert switches from Settings. Existing hotkeys still work during gameplay.
- Mode selection updates the launch dock's name/mass, preserving real FFA/Dual/Mega starting mass and their isolated simulations.
- Play, free Spectate, and both Settings entry points remain functional.
- Discord/Facebook appear as **coming soon** in a login dropdown; there is no real OAuth or account functionality yet.
- The server list explicitly indicates local demo; no invented online population figures are shown.
- Existing physics, viruses, 10-bot limit per mode, automatic Multi, Tab respawn, and hold-to-macro-feed from v9 are retained. Node WebSocket online play still needs an independently hosted backend.

## Publish to GitHub + Vercel

Unzip the package, commit and push its contents to the existing Vintage repository. The included `vercel.json` serves the static `public` folder. Keep `public/config.js` configured for a live WebSocket backend only if your Node game server has actually been deployed separately. Do not expose tokens in `public/`.

## Tests

Run `node --test tests/*.test.cjs` from the project root. Browser UI sanity checks: select Mega (name and 5,000 mass update), open Settings, Play, Return to Lobby, and open Login dropdown. Tests use an offline module loader for the UI; final hosted behavior should be verified on Vercel.
