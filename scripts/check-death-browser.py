"""Kill controlled fixture players to verify the real death-to-watch/play flow."""
import json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/death-ffa-oct27';PORT=38886;BASE=f'http://127.0.0.1:{PORT}'
source=(ROOT/'public/client.js').read_text(encoding='utf-8')+r'''
window.__death={arena,renderer,get remote(){return remote},get settings(){return settings},get snapshot(){return remote?.latest||arena.snapshot},get playing(){return playing},get spectating(){return spectating},get dead(){return showDeaths}};
'''
report={'fixtureServer':True,'results':{}}
with tempfile.TemporaryDirectory(prefix='vintage-death-test-') as temp:
    bootstrap=r'''
const http=require('node:http'),core=require('./server/core.cjs'),collection=require('./server/collection.cjs'),create=collection.createCollection;
collection.createCollection=()=>create({file:COLLECTION_FILE});
const rooms=[],createRoom=core.createRoom,join=core.join;
core.createRoom=function(...args){const r=createRoom(...args);rooms.push(r);return r;};
core.join=function(...args){const p=join(...args);if(!p.name.startsWith('DeathFixture'))return p;const room=args[0],n=[...room.players.values()].filter(q=>!q.npc&&q.name.startsWith('DeathFixture')).length-1;p.cells=[{x:2000+n*450,y:2200,mass:9000,age:1000,boost:0,boostX:0,boostY:0}];p.target={x:p.cells[0].x,y:2200};p.movementStopped=true;room.viruses=room.viruses.filter(v=>Math.hypot(v.x-2200,v.y-2200)>700);const npc=[...room.players.values()].find(q=>q.npc&&q.cells.length);if(npc){npc.cells[0].x=2800;npc.cells[0].y=2400;}return p;};
const createServer=http.createServer;http.createServer=function(handler){return createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(req.method==='POST'&&url.pathname==='/__deathFixture/kill'){for(const room of rooms.filter(r=>r.mode===url.searchParams.get('mode'))){const players=[...room.players.values()].filter(p=>!p.npc&&p.name.startsWith('DeathFixture'));for(const p of(url.searchParams.has('first')?players.slice(0,1):players))p.cells=[];}res.writeHead(200);res.end('ok');return;}handler(req,res);});};require('./server/index.js');
'''.replace('COLLECTION_FILE',json.dumps(str(Path(temp)/'collection.json')))
    server=subprocess.Popen(['node','-e',bootstrap],cwd=ROOT,env={**os.environ,'PORT':str(PORT),'MAX_CONN_PER_IP':'32'},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(60):
            try:urllib.request.urlopen(BASE+'/health',timeout=1).close();break
            except OSError:time.sleep(.1)
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
            try:
                for online in [False,True]:
                    for mode in ['ffa','dual','mega']:
                        key=('online-' if online else 'local-')+mode;context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                        config={'wsUrl':f'ws://127.0.0.1:{PORT}' if online else '', 'regions':{'EU':[{'id':'test-'+m,'name':m.upper(),'mode':m,'wsUrl':''} for m in ['ffa','dual','mega']]}}
                        context.route('**/config.js',lambda route:route.fulfill(content_type='text/javascript',body='window.VINTAGE_CONFIG='+json.dumps(config)))
                        context.route('**/client.js*',lambda route:route.fulfill(content_type='text/javascript',body=source))
                        page.goto(BASE,wait_until='domcontentloaded');page.wait_for_function('Boolean(window.__death)&&document.getElementById("boot-screen").hidden')
                        if mode!='ffa':page.locator('#server-picker-btn').click();page.locator('.server-entry').filter(has=page.locator('strong',has_text=mode.upper())).click()
                        page.locator('#nickname').fill('DeathFixture');page.locator('#play-btn').click()
                        if online:page.wait_for_function('__death.remote?.myIds.length===2&&__death.remote.latest?.players.length>0')
                        else:page.evaluate('()=>{const a=__death.arena;a.myIds.forEach((id,i)=>{const p=a.getById(id);p.cells=[{x:2000+i*450,y:2200,mass:9000,age:1000,boost:0,boostX:0,boostY:0}];p.movementStopped=true;});a.viruses=a.viruses.filter(v=>Math.hypot(v.x-2200,v.y-2200)>700);const npc=a.players.find(p=>p.npc&&p.cells.length);npc.cells[0].x=2800;npc.cells[0].y=2400;}')
                        page.wait_for_timeout(250)
                        def kill(first=False):
                            if online:
                                req=urllib.request.Request(BASE+'/__deathFixture/kill?mode='+mode+('&first=1' if first else ''),method='POST');urllib.request.urlopen(req).close()
                            else:page.evaluate('(first)=>{const a=__death.arena;for(const id of(first?a.myIds.slice(0,1):a.myIds))a.getById(id).cells=[];}',first)
                        kill(True);page.wait_for_timeout(300);assert not page.locator('#gameover').is_visible(),key
                        kill();page.wait_for_function('__death.dead&&__death.spectating&&!__death.playing');page.wait_for_selector('#gameover',state='visible')
                        page.wait_for_function('()=>{const c=__death;return !c.snapshot.vision&&c.snapshot.players.some(p=>p.npc&&p.cells.length)}')
                        before=page.evaluate('()=>({time:__death.arena.elapsed,players:__death.snapshot.players.filter(p=>p.npc&&p.cells.length).map(p=>({id:p.id,x:p.cells[0].x,y:p.cells[0].y}))})');page.wait_for_timeout(350)
                        after=page.evaluate('()=>({time:__death.arena.elapsed,players:__death.snapshot.players.filter(p=>p.npc&&p.cells.length).map(p=>({id:p.id,x:p.cells[0].x,y:p.cells[0].y}))})')
                        assert any(abs(q['x']-p['x'])+abs(q['y']-p['y'])>.1 for p in before['players'] for q in after['players'] if p['id']==q['id']),(key,before,after)
                        if not online:assert after['time']>before['time']
                        assert page.locator('#gameover button').count()==2
                        overlay=page.locator('#gameover').evaluate('(el)=>({background:getComputedStyle(el).backgroundColor,filter:getComputedStyle(el).backdropFilter})');assert overlay=={'background':'rgba(0, 0, 0, 0)','filter':'none'},overlay
                        assert int(page.locator('#death-score').inner_text().replace(',',''))>0
                        page.screenshot(path=str(OUT/('death-'+key+'.png')))
                        npc_ids=[p['id'] for p in after['players']];page.locator('#death-spectate-btn').click();assert not page.locator('#gameover').is_visible();assert page.evaluate('__death.spectating&&!__death.dead&&!__death.playing')
                        assert any(p in page.evaluate('__death.snapshot.players.filter(p=>p.npc).map(p=>p.id)') for p in npc_ids)
                        page.locator('#menu-btn').click();page.locator('#play-btn').click();page.wait_for_function('()=>{const c=__death,ids=c.remote?.myIds||c.arena.myIds;return c.playing&&ids.length===2&&ids.every(id=>c.snapshot.players.find(p=>p.id===id)?.cells.length)}')
                        kill();page.wait_for_function('__death.dead');page.locator('#respawn-btn').click();page.wait_for_function('()=>{const c=__death,ids=c.remote?.myIds||c.arena.myIds;return c.playing&&!c.dead&&ids.length===2&&ids.every(id=>c.snapshot.players.find(p=>p.id===id)?.cells.length)}')
                        assert not errors,errors;report['results'][key]={'transparentOverlay':True,'worldKeepsMoving':True,'oneDeadConnectionDoesNotEndMatch':True,'spectatePreservesWorld':True,'playRespawns':True,'pageErrors':errors};context.close()
            finally:browser.close()
        report['passed']=True;(OUT/'death-browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
    finally:
        server.terminate()
        try:server.wait(timeout=5)
        except subprocess.TimeoutExpired:server.kill();server.wait()
