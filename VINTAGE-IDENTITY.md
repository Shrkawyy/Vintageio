# Vintage: loading scene, signatures and titles

Open **http://localhost:3008/** and use **Ctrl+F5** after updating.

## Loading scene

The Diamond Observatory is an original CSS scene using the existing Vintage logo, rotating seals and floating crystals. It appears before the lobby. Progress counts completed critical interface resources; 100% is reached after the client initializes, fonts are ready and the logo decodes. A failed resource pauses loading and offers Retry. It does not invent a timed percentage or preload the entire optional skin catalog.

The later [burst intro update](DUAL-WATCH-INTRO-OCT27.md) gives this scene a brief visible introduction even on cached loads, then breaks the logo into crystal fragments before revealing the lobby. Reduced-motion preferences skip the burst.

## Locked names

Open **Reserved Names → Signature Studio**. Choose **Static** for one color or **Animated** for a blend of four editable colors. The same style is rendered in cells and chat, sent in authoritative snapshots and retained in replays. Both modes cost the existing 15,000 coins per reserved name; color changes are free. The existing single free rename is preserved.

On localhost, **TRY FREE ON LOCALHOST** previews a signature without spending coins, granting a reservation or consuming the free rename. Forwarded/public requests and production mode cannot use trials. Existing reservations, balances and owned VIP/YT/GOAT titles are retained.

## Original titles

Open either skin circle and select **Titles**, next to **Flags**. **Player Titles** opens the same tab. The catalog has 20 original SVG banners, including The Killer, GOAT, Apex, Phantom, Reaper, Sovereign, Warlord, Venom, Eclipse, Nova, Tempest, Frostbite, Inferno, Vandal, Ronin, Mythic, Voidwalker and Vintage Legend, plus VIP and YT.

VIP remains 75,000 coins and GOAT 100,000. New standard titles are configured at 20,000; Vintage Legend is 30,000. YT remains unavailable for purchase until a price is chosen. All designs support the existing localhost trial mechanism. Prices live in `public/titles.js`, synchronized to the server by `node scripts/sync-physics.cjs`.

Select a banner, then drag inside the live cell to position it. Arrow keys move it when the preview is focused; Reset restores the default. Position is saved separately for connection 1 and connection 2, sent through validated cosmetics and rendered inside every piece. Titles are separate from the nickname label. The banner center is constrained to the cell's interior.

The coin sales interface and package list have been removed. Coin balances and verified cosmetic purchases remain supported. No payment service was added.

## Verification

- `node --test tests/*.test.cjs`: includes signature persistence, ownership, input validation, unchanged physics, all modes and immutable replay metadata.
- `python scripts/check-identity-browser.py`: an isolated server and temporary collection database test actual loading, both name modes, all 20 titles, drag/keyboard placement, separate connections, reload persistence, local/online chat, replay metadata, mobile layout and loading failures.
- `python scripts/check-mega-browser.py`: regression checks for Mega splits, macro feed, switching and its existing x64 cap.

Reports and screenshots are in `artifacts/vintage-identity-oct27/`. The physics changes from the previous Mega fix remain in place; this update does not retune gameplay.
