# VINTAGE.IO — latest complete build

## Run on Windows

1. Extract the entire ZIP.
2. Open the `Vintage.io-DualTar-Test` folder and run **RUN-VINTAGE.cmd**.
3. Open **http://localhost:3008/** in your browser. Use **Ctrl+F5** after an update.

Node.js 20 or newer is required. Keep the server window open while playing. The WebSocket dependency is included; the launcher can install it if it is missing.

## Included

- Complete browser game, assets and Node.js server.
- FFA, Dual and Mega; the latest Dual feed presentation improvements.
- Direct server switching and continuous spectating without resetting the world or camera.
- Transparent death screen, Vintage burst entrance, signatures and 20 title designs.
- Public free testing for all titles and reserved names, controlled by one server setting.
- Tests, licenses, change notes and a SHA-256 file manifest in `checksums.json`.

The latest validation passed 90 automated tests and local/online browser checks. Private user collections, account credentials and environment files are not bundled. The server creates its own local data store when needed.

## Hosting later

Online play uses the Node.js server and WebSocket connections. Configure the deployed endpoint in `public/config.js`. Uploading only the browser files to a static host does not deploy the game server.

See `PUBLIC-FREE-TRIAL.md` for the current free testing period and how to restore paid access. The earlier gameplay and entrance changes are described in `DUAL-WATCH-INTRO-OCT27.md`.
