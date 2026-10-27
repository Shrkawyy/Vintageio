# Free testing period: titles and reserved names

All 20 titles, including VIP, GOAT and YT, and both reserved-name color modes are temporarily free for every player. This works on public servers and localhost. Use the normal buttons in **Player Titles** or **Reserved Names**; no coins are required or deducted.

Static signatures use one color; animated signatures use four. Name colors continue to appear in cells, chat and saved replays. A trial reservation protects the name from other players while testing is enabled. Trial names can be renamed without using the existing paid-name rename allowance.

## Close or reopen testing

Edit `server/collection.config.json`:

```json
{
  "freeTrial": false
}
```

Restart the Node.js server, then refresh the browser with **Ctrl+F5**. This restores paid access for everyone, including localhost. Set the value to `true` and restart to reopen testing.

For hosting, the optional environment variable `COLLECTION_FREE_TRIAL=0` closes testing and `COLLECTION_FREE_TRIAL=1` enables it. This overrides the JSON setting. No end date or countdown is configured.

## Ownership and prices

Trial access does not grant permanent paid title ownership. When testing closes, trial names lose their reservation and color privileges, and unpaid trial titles are removed. Those names can then be purchased normally. Trial records are kept in the database so reopening testing can restore them if nobody has bought the name.

Previously purchased names and titles, coin balances and the paid-name rename allowance are preserved. Where available, the previous paid name and equipped paid title resume after testing closes. No free coins or payment service are added.

The configured paid prices remain unchanged: a reserved name costs 15,000 coins, VIP 75,000, GOAT 100,000, standard titles 20,000 and Vintage Legend 30,000. YT is available for testing but remains unavailable for paid purchase until a price is configured.

Browser collection identity is stored in an HTTP-only cookie. Keep the same browser profile to retain access to the same collection; account synchronization has not been added.

## Validation

- `node --test tests/*.test.cjs`: 90 tests, including free access, exclusive names, restoring paid prices, preserving previous purchases and blocking client-side pricing overrides.
- `python scripts/check-public-free-trial-browser.py`: production-mode fixture with forwarded public requests; checks the normal UI, VIP/GOAT/YT, name reservation, reload, and closing testing on the same database.
- `python scripts/check-identity-browser.py`: checks local and online name colors, chat, title placement, replays, mobile layout and loading.

Fixtures use isolated temporary databases. Private player collections are not included in the download archives.
