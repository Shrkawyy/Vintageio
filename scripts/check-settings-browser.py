"""Validate settings studio interactions and the complete arena square in Chrome."""
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/ffa-2026-10-23'
PORT=38766
BASE=f'http://127.0.0.1:{PORT}'
server=subprocess.Popen(['node','server/index.js'],cwd=ROOT,env={**os.environ,'PORT':str(PORT)},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
report={}
try:
    for _ in range(50):
        try:
            urllib.request.urlopen(BASE+'/health',timeout=1).close();break
        except OSError:time.sleep(.1)
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
        for mobile in [False,True]:
            context=browser.new_context(viewport={'width':390 if mobile else 1600,'height':844 if mobile else 1000})
            page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            source=(ROOT/'public/client.js').read_text(encoding='utf-8-sig')+'\nwindow.__studio={arena,renderer,get settings(){return settings}};'
            page.route('**/client.js*',lambda route:route.fulfill(content_type='text/javascript',body=source))
            page.goto(BASE,wait_until='domcontentloaded');page.wait_for_function('Boolean(window.__studio)')
            page.locator('#lobby-settings-btn').click()
            assert page.locator('#settings-tabs button').count()==7
            assert page.locator('#settings-overlay').bounding_box()['width']==(390 if mobile else 1600)
            page.locator('#settings-tabs [data-tab="graphics"]').click()
            page.get_by_label('Background grid',exact=True).check()
            assert page.locator('#settings-detail-title').inner_text()=='Background grid'
            assert page.locator('#settings-detail-value').inner_text()=='ON'
            assert page.locator('#settings-detail-default').inner_text()=='OFF'
            page.wait_for_timeout(250)
            page.screenshot(path=str(OUT/('settings-studio-mobile.png' if mobile else 'settings-studio-graphics.png')))
            if not mobile:
                page.locator('#settings-reset-tab').focus();page.keyboard.press('Tab')
                assert page.locator('#settings-search').evaluate('e=>e===document.activeElement')
                page.get_by_label('Search settings',exact=True).fill('animation')
                slider=page.get_by_label('Animation',exact=True)
                slider.evaluate("e=>{e.value='170';e.dispatchEvent(new Event('input',{bubbles:true}))}")
                assert page.evaluate('window.__studio.settings.animation')==170
                assert page.locator('#settings-reset-tab').is_disabled()
                page.locator('#settings-tabs [data-tab="graphics"]').click()
                page.locator('#settings-reset-tab').click()
                assert page.evaluate('window.__studio.settings.animation')==120
                assert not page.get_by_label('Background grid',exact=True).is_checked()
                page.locator('#settings-tabs [data-tab="game"]').click()
                page.get_by_label('Mouse wheel zoom',exact=True).uncheck()
                page.locator('#settings-discard').click()
                assert page.evaluate('window.__studio.settings.wheelZoom')
                page.locator('#lobby-settings-btn').click()
                page.locator('#settings-tabs [data-tab="controls"]').click()
                page.get_by_label('Split',exact=True).click();page.keyboard.press('Shift')
                assert page.get_by_label('Split',exact=True).input_value()=='SHIFT'
                page.wait_for_timeout(250)
                page.screenshot(path=str(OUT/'settings-studio-controls.png'))
                page.locator('#settings-tabs [data-tab="import"]').click()
                page.get_by_role('button',name='EXPORT JSON',exact=False).click()
                exported=json.loads(page.locator('#settings-json').input_value());assert exported['keySplit']=='SHIFT'
                page.keyboard.press('Escape');page.locator('#play-btn').click()
                page.evaluate("""()=>{
                  const {arena:a,renderer:r,settings:s}=window.__studio;
                  a.players=a.myIds.map(id=>a.getById(id));a.players.forEach((p,i)=>{p.cells=[{x:7000+i*400,y:7000+i*400,mass:1000}];p.movementStopped=true});
                  a.food=[];a.viruses=[];a.nextFoodSpawnAt=Infinity;s.zoom=.04;s.showGrid=true;s.gridColor='#3e7b87';s.backgroundImage=true;
                  r.zoom=.04;r.cam={x:7200,y:7200};
                }""")
                page.wait_for_timeout(300)
                page.screenshot(path=str(OUT/'arena-full-square-grid.png'))
                # A flat fixture makes the formerly black, hidden-sector background test deterministic.
                page.route('**/grid-fixture.svg',lambda route:route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#428799"/></svg>'))
                page.evaluate("window.__studio.settings.backgroundUrl=location.origin+'/grid-fixture.svg'")
                page.wait_for_function('window.__studio.renderer.background?.complete && window.__studio.renderer.background.naturalWidth>0')
                page.wait_for_timeout(100)
                rgba=page.evaluate("""()=>{const r=window.__studio.renderer;const x=Math.round(r.screenW/2+(1000-r.cam.x)*r.zoom),y=Math.round(r.screenH/2+(1000-r.cam.y)*r.zoom);return [...r.ctx.getImageData(x,y,1,1).data]}""")
                assert rgba[1]>30 and rgba[2]>30,rgba
                report['arenaSquare']={'backgroundOutsideSightIsVisible':True,'rgba':rgba}
            assert not errors,errors
            report['mobile' if mobile else 'desktop']={'settingsStudio':True,'noPageErrors':True}
            context.close()
        browser.close()
    (OUT/'settings-browser-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report))
finally:
    server.terminate();server.wait(timeout=10)
