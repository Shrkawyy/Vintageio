"""Reproduce static Vercel hosting with no collection API, and test browser-only previews."""
import functools,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/static-free-trial-oct27'
SOURCE=(ROOT/'public/client.js').read_text(encoding='utf-8')+'\nwindow.__staticTrial={collection,arena,replays};\n'
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

OUT.mkdir(parents=True,exist_ok=True)
server=http.server.ThreadingHTTPServer(('127.0.0.1',38889),functools.partial(QuietHandler,directory=str(ROOT/'public')))
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
BASE='http://127.0.0.1:38889'
report={'staticHosting':True,'collectionApiAbsent':True}
try:
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
        try:
            context=browser.new_context(viewport={'width':1440,'height':1000})
            context.route('**/client.js*',lambda route:route.fulfill(content_type='text/javascript',body=SOURCE))
            page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(BASE,wait_until='domcontentloaded')
            page.wait_for_function('Boolean(window.__staticTrial?.collection.getProfile())&&!document.body.classList.contains("booting")')
            assert page.evaluate('__staticTrial.collection.getProfile().browserPreview') is True
            page.locator('#title-shop-btn').click()
            page.wait_for_function('document.querySelectorAll(".insignia-card").length===20')
            assert page.locator('.insignia-card > span').all_text_contents()==['FREE TO TRY']*20
            for title in ['yt','vip','goat']:
                page.locator('[data-title="'+title+'"]').click();assert page.locator('#title-equip').inner_text()=='TRY FOR FREE'
                page.locator('#title-equip').click();page.wait_for_function('(id)=>__staticTrial.collection.activeTitle()===id',arg=title)
            assert 'saved on this device' in page.locator('#title-selected-description').inner_text()
            page.screenshot(path=str(OUT/'static-titles-free.png'))
            page.locator('#skins-done').click();page.locator('#reserved-names-btn').click()
            assert 'THIS DEVICE ONLY' in page.locator('#collection-free-changes').inner_text()
            assert 'not reserved across players' in page.locator('#collection-terms').inner_text()
            page.locator('#reserved-name-input').fill('Static Free Pilot');page.locator('#reserved-name-mode').select_option('animated')
            page.locator('#reserve-name-submit').click();page.wait_for_function('__staticTrial.collection.activeIdentity()?.name==="Static Free Pilot"')
            p=page.evaluate('__staticTrial.collection.getProfile()')
            assert p['coins']==0 and p['activeIdentity']['nameStyle']['mode']=='animated' and p['ownedTitles']==[]
            page.screenshot(path=str(OUT/'static-names-free.png'));page.locator('#collection-close').click();page.locator('#play-btn').click()
            page.wait_for_function('__staticTrial.arena.myIds.length===2&&__staticTrial.arena.myIds.every(id=>__staticTrial.arena.getById(id).titleId==="goat")')
            assert page.evaluate('__staticTrial.arena.myIds.every(id=>__staticTrial.arena.getById(id).nameStyle?.mode==="animated")')
            page.locator('#arena').click(position={'x':700,'y':400});page.keyboard.press('Enter');page.locator('#chat-input').fill('Static trial colors');page.locator('#chat-input').press('Enter')
            page.wait_for_function('Boolean(document.querySelector("#chat-messages .who.signature-animated"))')
            page.screenshot(path=str(OUT/'static-trial-game.png'))
            page.reload(wait_until='domcontentloaded');page.wait_for_function('window.__staticTrial?.collection.activeTitle()==="goat"&&!document.body.classList.contains("booting")')
            assert page.evaluate('__staticTrial.collection.activeIdentity().name')=='Static Free Pilot'
            assert not errors,errors
            other=browser.new_context();other.route('**/client.js*',lambda route:route.fulfill(content_type='text/javascript',body=SOURCE))
            second=other.new_page();second.goto(BASE,wait_until='domcontentloaded');second.wait_for_function('Boolean(window.__staticTrial?.collection.getProfile())')
            assert second.evaluate('__staticTrial.collection.activeIdentity()') is None
            assert second.evaluate('__staticTrial.collection.activeTitle()')==''
            other.close()
            # Turning off the static-host preview switch revokes cached preview access after refresh.
            closed=(ROOT/'public/config.js').read_text(encoding='utf-8').replace('browserCollectionTrial: true','browserCollectionTrial: false')
            context.route('**/config.js',lambda route:route.fulfill(content_type='text/javascript',body=closed))
            page.reload(wait_until='domcontentloaded');page.wait_for_function('Boolean(window.__staticTrial)&&!document.body.classList.contains("booting")')
            page.locator('#title-shop-btn').click();page.wait_for_selector('.insignia-card')
            assert page.locator('#title-equip').is_disabled()
            assert page.evaluate('__staticTrial.collection.activeTitle()')==''
            assert page.evaluate('__staticTrial.collection.activeIdentity()') is None
            report.update({'allTwentyFree':True,'vipGoatYtUsable':True,'animatedNameInGameAndChat':True,'reloadPersists':True,'deviceIsolation':True,'noPaidOwnership':True,'zeroCoins':True,'disablingRevokesPreview':True,'pageErrors':errors,'passed':True})
            context.close()
        finally:browser.close()
finally:server.shutdown();server.server_close();thread.join(timeout=5)
(OUT/'browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report))
