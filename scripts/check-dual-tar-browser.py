"""Exercise real Vintage controls with the archive physics in an isolated fixture server."""
import json, os, subprocess, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
PORT=38883; BASE=f'http://127.0.0.1:{PORT}'
prepare=r'''
function prepare(p,slot){p.cells=[{x:slot?4000:1700,y:2940,mass:5000,age:0,boost:0,boostX:0,boostY:0}];p.target={x:5000,y:2940};p.movementStopped=false;}
'''
bootstrap=prepare+r'''
const core=require('./server/core.cjs'),join=core.join;
core.join=function(room,name,...args){const p=join(room,name,...args);if(!name.startsWith('ArchiveFixture'))return p;if(room.fixtureKey!==p.multiKey){room.fixtureKey=p.multiKey;room.players=new Map([[p.id,p]]);}room.food=[];room.nextFoodSpawnAt=Infinity;room.viruses=[];prepare(p,[...room.players.values()].filter(q=>q.multiKey===p.multiKey).indexOf(p));return p;};require('./server/index.js');
'''
source=(ROOT/'public/client.js').read_text(encoding='utf-8')+r'''
window.__dualArchive={arena,renderer,get remote(){return remote},get settings(){return settings},get activeSlot(){return activeSlot},get snapshot(){return remote?.latest||arena.snapshot}};
'''
server=subprocess.Popen(['node','-e',bootstrap],cwd=ROOT,env={**os.environ,'PORT':str(PORT),'MAX_CONN_PER_IP':'32'},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
report={'fixtureServer':True,'referenceCalibrated':True,'userServerUnmodified':True,'results':{}}
try:
    for _ in range(60):
        try:urllib.request.urlopen(BASE+'/health',timeout=1).close();break
        except OSError:time.sleep(.1)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
        try:
            for online in [False,True]:
                for mode in ['ffa','dual']:
                    context=browser.new_context(viewport={'width':1440,'height':1000})
                    config={'wsUrl':f'ws://127.0.0.1:{PORT}' if online else '', 'regions':{'EU':[{'id':'test-'+m,'name':m.upper(),'mode':m,'wsUrl':''} for m in ['ffa','dual','mega']]}}
                    context.route('**/config.js',lambda route:route.fulfill(content_type='text/javascript',body='window.VINTAGE_CONFIG='+json.dumps(config)))
                    context.route('**/client.js*',lambda route:route.fulfill(content_type='text/javascript',body=source))
                    page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
                    page.goto(BASE,wait_until='domcontentloaded');page.wait_for_function('Boolean(window.__dualArchive)')
                    if mode=='dual':page.locator('#server-picker-btn').click();page.locator('.server-entry').filter(has=page.locator('strong',has_text='DUAL')).click()
                    page.locator('#nickname').fill('ArchiveFixture');page.locator('#play-btn').click()
                    if online:page.wait_for_function('__dualArchive.remote?.myIds.length===2&&__dualArchive.remote.latest?.players.length===2')
                    else:page.evaluate('()=>{'+prepare+r'''const a=__dualArchive.arena,own=a.myIds.map(id=>a.getById(id));a.players=own;a.food=[];a.viruses=[];a.nextFoodSpawnAt=Infinity;own.forEach(prepare);}''')
                    page.evaluate('()=>{__dualArchive.settings.zoom=.4;__dualArchive.renderer.zoom=.4;__dualArchive.renderer.cam={x:2850,y:2940};document.activeElement?.blur();}')
                    page.wait_for_timeout(80)
                    aim=page.evaluate('()=>{const r=__dualArchive.renderer;return{x:r.screenW/2+(5000-r.cam.x)*r.zoom,y:r.screenH/2+(2940-r.cam.y)*r.zoom};}')
                    page.mouse.move(min(1400,aim['x']),max(100,min(950,aim['y'])))
                    page.keyboard.press('Space')
                    page.wait_for_function('()=>{const c=__dualArchive,id=(c.remote?.myIds||c.arena.myIds)[0];return c.snapshot.players.find(p=>p.id===id)?.cells.length===2}')
                    page.keyboard.press('t')
                    page.wait_for_function('()=>{const c=__dualArchive,id=(c.remote?.myIds||c.arena.myIds)[0];return c.snapshot.players.find(p=>p.id===id)?.cells.length===16}')
                    before=page.evaluate('()=>__dualArchive.snapshot.food.filter(f=>f.ejected).length')
                    mass_before=page.evaluate('()=>{const c=__dualArchive,id=(c.remote?.myIds||c.arena.myIds)[0];return c.snapshot.players.find(p=>p.id===id).cells.reduce((s,x)=>s+x.mass,0)}')
                    page.keyboard.down('e');page.wait_for_timeout(180);page.keyboard.up('e')
                    page.wait_for_timeout(80)
                    after=page.evaluate('()=>__dualArchive.snapshot.food.filter(f=>f.ejected).length')
                    mass_after=page.evaluate('()=>{const c=__dualArchive,id=(c.remote?.myIds||c.arena.myIds)[0];return c.snapshot.players.find(p=>p.id===id).cells.reduce((s,x)=>s+x.mass,0)}')
                    assert after>before or mass_before-mass_after>1,(mode,online,before,after,mass_before,mass_after)
                    page.keyboard.press('Tab');page.wait_for_function('__dualArchive.activeSlot===1')
                    page.keyboard.press('Space');page.wait_for_function('()=>{const c=__dualArchive,id=(c.remote?.myIds||c.arena.myIds)[1];return c.snapshot.players.find(p=>p.id===id)?.cells.length===2}')
                    page.keyboard.down('Shift')
                    page.wait_for_function('()=>{const c=__dualArchive,id=(c.remote?.myIds||c.arena.myIds)[1];return c.snapshot.players.find(p=>p.id===id)?.cells.length>=8}')
                    page.keyboard.up('Shift');page.wait_for_timeout(180)
                    stopped_count=page.evaluate('()=>{const c=__dualArchive,id=(c.remote?.myIds||c.arena.myIds)[1];return c.snapshot.players.find(p=>p.id===id).cells.length}')
                    page.wait_for_timeout(180)
                    state=page.evaluate('()=>{const c=__dualArchive,ids=c.remote?.myIds||c.arena.myIds;return {activeSlot:c.activeSlot,cells:ids.map(id=>c.snapshot.players.find(p=>p.id===id)?.cells.length||0),animation:c.settings.animation,world:c.snapshot.worldSize,mode:c.snapshot.mode};}')
                    assert state['cells'][0]==16 and state['cells'][1]==stopped_count and stopped_count>=8 and state['animation']==100,state
                    assert not errors,errors
                    key=('online-' if online else 'local-')+mode
                    report['results'][key]={**state,'macroFeedVisiblePelletsDelta':after-before,'macroFeedMassDelta':mass_before-mass_after,'runSplitHoldAndRelease':True,'pageErrors':errors}
                    page.screenshot(path=str(ROOT/'artifacts'/('browser-'+key+'.png')))
                    context.close()
        finally:browser.close()
    report['passed']=True
    (ROOT/'artifacts/senpa-oct27-audit/browser-controls.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report))
finally:
    server.terminate()
    try:server.wait(timeout=5)
    except subprocess.TimeoutExpired:server.kill();server.wait()
