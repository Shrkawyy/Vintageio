# Free previews on the current Vercel site

The public site was serving the updated frontend, but `/collection/profile` returned HTTP 404. The frontend needs that profile before enabling its title or name buttons, so the earlier server-backed free trial could not activate on a static deployment.

This build adds an explicitly enabled browser preview for that deployment. The normal **TRY FOR FREE** and name buttons work, and choices persist in browser storage. All 20 titles, including VIP, GOAT and YT, and both name color modes are available. The UI states that previews are saved on this device and that preview names are not globally reserved.

## Upload

Use the contents of the `Vintage.io-DualTar-Test` folder as the repository root. Keep `public/` and `vercel.json` together at that root. Vercel publishes the `public` directory. Commit and push through GitHub Desktop, wait for the connected Vercel deployment, then use Ctrl+F5 on the site.

The page and module version is `static-free-trial-oct27-9`. The new `public/browser-collection.js` module must be uploaded with the other public files. Updating only the HTML will not fix the collection.

## Close previews

On static hosting, set `browserCollectionTrial: false` in `public/config.js`, publish the update, and refresh. This disables free previews; paid reservations require the collection server and a persistent database.

When using the full Node.js game server, its `/collection/profile` remains authoritative. Its free trial is controlled by `server/collection.config.json` or `COLLECTION_FREE_TRIAL`. A server's paid-mode response or error never enables the browser preview. Browser fallback requires an explicit opt-in, a missing profile endpoint (404), and no configured online WebSocket server.

## Limits

The existing public configuration has no online game endpoint, so worlds and cosmetic previews run on each player's device. This update does not turn that deployment into a shared multiplayer server. Browser previews do not grant paid ownership, issue coins, synchronize accounts, or reserve names across players. A real collection service is required for those guarantees.

Validation: 96 automated tests plus browser checks against static hosting and the full Node.js collection server. Test profiles are isolated from player data.
