"""Exercise loading, signatures, titles, drag placement, chat and replay metadata."""
import json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/vintage-identity-oct27';PORT=38885;BASE=f'http://127.0.0.1:{PORT}'
source=(ROOT/'public/client.js').read_text(encoding='utf-8')+r'''
window.__identity={arena,renderer,collection,skins,replays,get remote(){return remote},get settings(){return settings},get snapshot(){return remote?.latest||arena.snapshot}};
'''
def colors(page,values):
    for i,color in enumerate(values):page.locator('#reserved-name-color'+('-'+str(i) if i else '')).evaluate('(el,value)=>{el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));}',color)
report={'isolatedCollection':True,'results':{}}
with tempfile.TemporaryDirectory(prefix='vintage-identity-browser-') as temp:
    bootstrap='''const c=require('./server/collection.cjs'),create=c.createCollection;c.createCollection=()=>create({file:'''+json.dumps(str(Path(temp)/'profiles.json'))+'''});
    const core=require('./server/core.cjs'),join=core.join;core.join=function(...args){const p=join(...args);if(p.name.startsWith('Identity')){p.cells[0].mass=12500;p.movementStopped=true;}return p;};require('./server/index.js');'''
    server=subprocess.Popen(['node','-e',bootstrap],cwd=ROOT,env={**os.environ,'PORT':str(PORT),'MAX_CONN_PER_IP':'32'},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(60):
            try:urllib.request.urlopen(BASE+'/health',timeout=1).close();break
            except OSError:time.sleep(.1)
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
            try:
                for online in [False,True]:
                    key='online' if online else 'local';context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                    config={'wsUrl':f'ws://127.0.0.1:{PORT}' if online else '', 'regions':{'EU':[{'id':'test-'+m,'name':m.upper(),'mode':m,'wsUrl':''} for m in ['ffa','dual','mega']]}}
                    context.route('**/config.js',lambda route:route.fulfill(content_type='text/javascript',body='window.VINTAGE_CONFIG='+json.dumps(config)))
                    context.route('**/client.js*',lambda route:route.fulfill(content_type='text/javascript',body=source))
                    page.add_init_script('''window.__loading=[];new MutationObserver(()=>{const el=document.getElementById('boot-progress');if(el){const n=Number(el.getAttribute('aria-valuenow'));if(window.__loading.at(-1)!==n)window.__loading.push(n)}}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-valuenow']});''')
                    page.goto(BASE,wait_until='domcontentloaded');page.screenshot(path=str(OUT/('loading-'+key+'.png')))
                    try:page.wait_for_function('Boolean(window.__identity)&&!document.body.classList.contains("booting")',timeout=15000)
                    except Exception:
                        print(json.dumps({'boot':page.locator('#boot-detail').inner_text(),'errors':errors}));raise
                    progress=page.evaluate('window.__loading');assert progress[-1]==100 and progress==sorted(progress),progress
                    assert page.locator('#coin-shop-btn,#collection-coins,#coin-packages').count()==0
                    page.locator('#reserved-names-btn').click();page.locator('#reserved-name-input').fill('IdentityOnline' if online else 'IdentityLocal');page.locator('#reserved-name-mode').select_option('animated')
                    chosen=['#40DCFF','#B889FF','#FF70BA','#FFD880'];colors(page,chosen);page.locator('#reserve-name-submit').click()
                    page.wait_for_function('__identity.collection.activeIdentity()?.nameStyle.mode==="animated"');assert page.locator('#reserved-name-preview').evaluate('(el)=>el.classList.contains("signature-animated")')
                    page.screenshot(path=str(OUT/('signature-'+key+'.png')));page.locator('#collection-close').click();page.locator('#title-shop-btn').click()
                    page.wait_for_function('document.querySelectorAll(".insignia-card").length===20');page.locator('[data-title="killer"]').click();page.locator('#title-equip').click();page.wait_for_function('__identity.collection.activeTitle()==="killer"')
                    canvas=page.locator('#title-position-canvas');rect=canvas.bounding_box();page.mouse.move(rect['x']+rect['width']*.5,rect['y']+rect['height']*.3);page.mouse.down();page.mouse.move(rect['x']+rect['width']*.68,rect['y']+rect['height']*.59,steps=8);page.mouse.up()
                    pos0=page.evaluate('__identity.skins.getSlots()[0].titlePosition');assert pos0['x']>.3 and pos0['y']>0,pos0
                    page.locator('#skin-slot-1').click();pos1=page.evaluate('__identity.skins.getSlots()[1].titlePosition');assert pos0!=pos1
                    page.locator('#skin-slot-0').click();canvas.focus();page.keyboard.press('ArrowLeft');moved=page.evaluate('__identity.skins.getSlots()[0].titlePosition');assert moved['x']<pos0['x'],(moved,pos0)
                    page.screenshot(path=str(OUT/('titles-'+key+'.png')));page.locator('#skins-done').click();page.locator('#play-btn').click()
                    page.wait_for_function('()=>{const c=__identity,ids=c.remote?.myIds||c.arena.myIds;return ids.length===2&&ids.every(id=>c.snapshot.players.find(p=>p.id===id)?.titleId==="killer")}')
                    state=page.evaluate('()=>{const c=__identity,ids=c.remote?.myIds||c.arena.myIds;return ids.map(id=>{const p=c.snapshot.players.find(p=>p.id===id);return {titleId:p.titleId,titlePosition:p.titlePosition,nameStyle:p.nameStyle,name:p.name}})}')
                    assert all(p['nameStyle']['mode']=='animated' for p in state),state
                    assert state[0]['titlePosition']==moved and state[1]['titlePosition']==pos1,state
                    page.locator('#arena').click(position={'x':700,'y':400});page.keyboard.press('Enter');page.locator('#chat-input').fill('Identity colors test');page.locator('#chat-input').press('Enter');page.wait_for_function('Boolean(document.querySelector("#chat-messages .who.signature-animated"))')
                    page.wait_for_timeout(300);page.screenshot(path=str(OUT/('game-'+key+'.png')))
                    replay=page.evaluate('()=>{const c=__identity,clip=c.replays.buffer.clip({});return clip?.frames.at(-1).state.players.find(p=>p.titleId==="killer");}')
                    assert replay and replay['nameStyle']['mode']=='animated' and replay['titlePosition'],replay
                    page.reload(wait_until='domcontentloaded');page.wait_for_function('Boolean(window.__identity)&&!document.body.classList.contains("booting")&&__identity.collection.activeTitle()==="killer"')
                    assert page.evaluate('__identity.skins.getSlots()[0].titlePosition')==moved
                    page.locator('#reserved-names-btn').click();page.locator('#reserved-name-mode').select_option('static');colors(page,['#FFCC88']);page.locator('#reserve-name-submit').click();page.wait_for_function('__identity.collection.activeIdentity()?.nameStyle.mode==="static"');assert not page.locator('#reserved-name-preview').evaluate('(el)=>el.classList.contains("signature-animated")')
                    assert not errors,errors
                    report['results'][key]={'loadingProgress':progress,'titles':20,'animatedChat':True,'staticNames':True,'placementPersists':True,'replayMetadata':True,'players':state,'pageErrors':errors};context.close()
                context=browser.new_context(viewport={'width':430,'height':900});page=context.new_page();page.goto(BASE,wait_until='domcontentloaded');page.wait_for_function('document.getElementById("boot-screen").hidden');page.locator('#title-shop-btn').click();page.wait_for_selector('.insignia-card');page.screenshot(path=str(OUT/'titles-mobile.png'));report['mobileOverflow']=page.evaluate('document.documentElement.scrollWidth>innerWidth');assert not report['mobileOverflow'];context.close()
                context=browser.new_context();context.route('**/title-studio.js*',lambda route:route.fulfill(status=503,body='Unavailable'));page=context.new_page();page.goto(BASE,wait_until='domcontentloaded');page.wait_for_function('document.getElementById("boot-stage").textContent==="LOADING PAUSED"');report['loadingErrorDoesNotComplete']=page.evaluate('document.body.classList.contains("booting")&&Number(document.getElementById("boot-progress").getAttribute("aria-valuenow"))<100');assert report['loadingErrorDoesNotComplete'];context.close()
            finally:browser.close()
        report['passed']=True;(OUT/'browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
    finally:
        server.terminate()
        try:server.wait(timeout=5)
        except subprocess.TimeoutExpired:server.kill();server.wait()
