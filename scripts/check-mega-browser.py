"""Test actual Mega controls locally and over WebSocket on an owned fixture server."""
import json,os,subprocess,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
PORT=38884;BASE=f'http://127.0.0.1:{PORT}'
prepare=r'''function prepare(p,slot){p.cells=[{x:slot?4200:1500,y:2940,mass:64000,age:1000,boost:0,boostX:0,boostY:0}];p.target={x:5800,y:2940};p.movementStopped=false;}'''
bootstrap=prepare+r'''
const core=require('./server/core.cjs'),join=core.join;
core.join=function(room,name,...args){const p=join(room,name,...args);if(!name.startsWith('MegaFixture'))return p;if(room.fixtureKey!==p.multiKey){room.fixtureKey=p.multiKey;room.players=new Map([[p.id,p]]);}room.food=[];room.viruses=[];room.nextFoodSpawnAt=Infinity;prepare(p,[...room.players.values()].filter(q=>q.multiKey===p.multiKey).indexOf(p));return p;};require('./server/index.js');
'''
source=(ROOT/'public/client.js').read_text(encoding='utf-8')+r'''
window.__mega={arena,renderer,get remote(){return remote},get settings(){return settings},get activeSlot(){return activeSlot},get snapshot(){return remote?.latest||arena.snapshot}};
'''
report={'fixtureServer':True,'userServerUnmodified':True,'results':{}}
server=subprocess.Popen(['node','-e',bootstrap],cwd=ROOT,env={**os.environ,'PORT':str(PORT),'MAX_CONN_PER_IP':'32'},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
    for _ in range(60):
        try:urllib.request.urlopen(BASE+'/health',timeout=1).close();break
        except OSError:time.sleep(.1)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
        try:
            for online in [False,True]:
                context=browser.new_context(viewport={'width':1440,'height':1000})
                config={'wsUrl':f'ws://127.0.0.1:{PORT}' if online else '', 'regions':{'EU':[{'id':'test-'+m,'name':m.upper(),'mode':m,'wsUrl':''} for m in ['ffa','dual','mega']]}}
                context.route('**/config.js',lambda route:route.fulfill(content_type='text/javascript',body='window.VINTAGE_CONFIG='+json.dumps(config)))
                context.route('**/client.js*',lambda route:route.fulfill(content_type='text/javascript',body=source))
                page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(BASE,wait_until='domcontentloaded');page.wait_for_function('Boolean(window.__mega)')
                page.locator('#server-picker-btn').click();page.locator('.server-entry').filter(has=page.locator('strong',has_text='MEGA')).click()
                page.locator('#nickname').fill('MegaFixture');page.locator('#play-btn').click()
                if online:page.wait_for_function('__mega.remote?.myIds.length===2&&__mega.remote.latest?.players.length===2')
                else:page.evaluate('()=>{'+prepare+'''const a=__mega.arena,own=a.myIds.map(id=>a.getById(id));a.players=own;a.food=[];a.viruses=[];a.nextFoodSpawnAt=Infinity;own.forEach(prepare);}''')
                page.evaluate('()=>{__mega.settings.zoom=.27;__mega.renderer.zoom=.27;__mega.renderer.cam={x:2850,y:2940};document.activeElement?.blur();}')
                page.mouse.move(1380,500);page.keyboard.press('Space')
                page.wait_for_function('()=>{const c=__mega,id=(c.remote?.myIds||c.arena.myIds)[0];return c.snapshot.players.find(p=>p.id===id)?.cells.length===2}')
                page.keyboard.press('d')
                page.wait_for_function('()=>{const c=__mega,id=(c.remote?.myIds||c.arena.myIds)[0];return c.snapshot.players.find(p=>p.id===id)?.cells.length===64}')
                def measure():return page.evaluate('()=>{const c=__mega,id=(c.remote?.myIds||c.arena.myIds)[0];return {mass:c.snapshot.players.find(p=>p.id===id).cells.reduce((n,x)=>n+x.mass,0),pellets:c.snapshot.food.filter(f=>f.ejected).length};}')
                before=measure();page.keyboard.down('e');page.wait_for_timeout(350);page.keyboard.up('e');page.wait_for_timeout(60);after=measure()
                assert after['pellets']>before['pellets'] or before['mass']-after['mass']>1,(before,after)
                radii=page.evaluate('()=>__mega.snapshot.food.filter(f=>f.ejected).map(f=>f.radius)')
                assert radii and all(abs(r-14.7)<1e-8 for r in radii),radii[:10]
                page.keyboard.press('Tab');page.wait_for_function('__mega.activeSlot===1');page.keyboard.press('Space')
                page.wait_for_function('()=>{const c=__mega,id=(c.remote?.myIds||c.arena.myIds)[1];return c.snapshot.players.find(p=>p.id===id)?.cells.length===2}')
                state=page.evaluate('()=>{const c=__mega,ids=c.remote?.myIds||c.arena.myIds;return {mode:c.snapshot.mode,cells:ids.map(id=>c.snapshot.players.find(p=>p.id===id).cells.length),animation:c.settings.animation,activeSlot:c.activeSlot};}')
                assert state['mode']=='mega' and state['cells']==[64,2] and state['animation']==100,state
                assert not errors,errors
                key='online' if online else 'local';report['results'][key]={**state,'macroFeedPelletsDelta':after['pellets']-before['pellets'],'massDelta':before['mass']-after['mass'],'feedCollisionRadius':radii[0],'pageErrors':errors}
                page.screenshot(path=str(ROOT/f'artifacts/mega-feed-oct27/browser-{key}.png'));context.close()
        finally:browser.close()
    report['passed']=True;(ROOT/'artifacts/mega-feed-oct27/browser-controls.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
finally:
    server.terminate()
    try:server.wait(timeout=5)
    except subprocess.TimeoutExpired:server.kill();server.wait()
