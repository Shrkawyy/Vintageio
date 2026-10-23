# Playwright gameplay verification

Completed on 22 October 2026 in Microsoft Edge through Playwright, against the
local Node server at http://localhost:3001.

The verified run played for **123.637 seconds**, with **174 action cycles**.

| Session | Mode | Gameplay | Action cycles |
| --- | --- | ---: | ---: |
| Browser demo | Mega | 40.442 s | 57 |
| Browser demo | FFA | 10.612 s | 15 |
| Browser demo | Dual | 10.671 s | 15 |
| Local WebSocket backend | Mega | 40.479 s | 57 |
| Local WebSocket backend | FFA | 10.784 s | 15 |
| Local WebSocket backend | Dual | 10.649 s | 15 |

Actions included cursor movement, manual/multi splits, feed/macro feed, switching
connections, Stopmove, S/H, zoom, keyboard/mouse settings, private chat and emoji
insertion. Chat used a unique test tag so messages stayed within the test's own
connections. No gameplay objects or mass values were injected into the game.

## Issue fixed

The initial run logged a console error: `GET /favicon.ico` returned 404.
Added a Vintage SVG favicon, linked both HTML entry points to it, and redirected
the legacy `/favicon.ico` URL to the SVG. Both URLs now resolve successfully
with HTTP 200 and the correct SVG content type.

The first driver run also stopped at a server-switch confirmation because
Playwright dismisses dialogs when no handler is registered. The driver now
accepts that confirmation. This was a test-driver issue; the game's confirmation
behavior was preserved.

## Verified result

* Console errors: **0**.
* Uncaught page exceptions: **0**.
* HTTP errors and failed requests: **0**.
* WebSocket errors: **0**.
* Test-driver errors: **0**.
* Automated repository tests: **115 passed, 0 failed**.

The full verified log and samples are in `verified/report.json`, with six
screenshots in the same folder. `initial/report.json` preserves the initial
favicon error and the interrupted driver run. The local server remains running.
