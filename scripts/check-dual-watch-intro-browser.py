"""Test actual Dual feed, in-place spectate, room switching and the intro timeline."""
import json,os,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/dual-watch-intro-oct27';PORT=38887;BASE=f'http://127.0.0.1:{PORT}'
source=(ROOT/'public/client.js').read_text(encoding='utf-8')+r'''
window.__flow={arena,renderer,get remote(){return remote},get settings(){return settings},get snapshot(){return remote?.latest||arena.snapshot},get playing(){return playing},get spectating(){return spectating},get serverId(){return serverId},get mode(){return mode}};
'''
observe=r'''
window.__intro={readyAt:null,burstAt:null,endAt:null};window.__packets=[];
const originalSend=WebSocket.prototype.send;WebSocket.prototype.send=function(raw){try{const p=JSON.parse(raw);window.__packets.push({type:p.type,serverId:p.serverId});}catch{}return originalSend.call(this,raw);};
new MutationObserver(()=>{const screen=document.getElementById('boot-screen'),progress=document.getElementById('boot-progress');if(!screen)return;const s=window.__intro;if(progress?.getAttribute('aria-valuenow')==='100'&&s.readyAt===null)s.readyAt=performance.now();if(screen.dataset.phase==='burst'&&s.burstAt===null)s.burstAt=performance.now();if(!document.body.classList.contains('booting')&&s.endAt===null)s.endAt=performance.now();}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-valuenow','data-phase','class']});
'''
entries=[{'id':i,'name':n,'mode':m,'wsUrl':''} for i,n,m in [('vintage-ffa','FFA','ffa'),('senpa-dual','DUAL','dual'),('aster-domination','DUAL TWO','dual'),('senpa-mega','MEGA','mega'),('senpa-ffa','FFA TWO','ffa')]]
report={'isolatedFixture':True,'results':{}}
with tempfile.TemporaryDirectory(prefix='vintage-dual-flow-') as temp:
    bootstrap=r'''
const collection=require('./server/collection.cjs'),create=collection.createCollection;collection.createCollection=()=>create({file:COLLECTION_FILE});
const core=require('./server/core.cjs'),join=core.join;core.join=function(...args){const p=join(...args);if(!p.name.startsWith('FlowFixture'))return p;const room=args[0],slot=[...room.players.values()].filter(q=>q.multiKey===p.multiKey).length-1;p.cells=[{x:1500+slot*2400,y:2500,mass:5000,age:1000,boost:0,boostX:0,boostY:0}];p.target={x:p.cells[0].x,y:2500};p.movementStopped=true;room.viruses=room.viruses.filter(v=>Math.hypot(v.x-p.cells[0].x,v.y-2500)>600);return p;};require('./server/index.js');
'''.replace('COLLECTION_FILE',json.dumps(str(Path(temp)/'profiles.json')))
    server=subprocess.Popen(['node','-e',bootstrap],cwd=ROOT,env={**os.environ,'PORT':str(PORT),'MAX_CONN_PER_IP':'32'},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for _ in range(60):
            try:urllib.request.urlopen(BASE+'/health',timeout=1).close();break
            except OSError:time.sleep(.1)
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
            try:
                for online in [False,True]:
                    key='online' if online else 'local';context=browser.new_context(viewport={'width':1440,'height':1000});context.add_init_script(observe);page=context.new_page();errors=[];dialogs=[];navigations=[]
                    page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:(dialogs.append(d.message),d.dismiss()));page.on('framenavigated',lambda f:navigations.append(f.url) if f==page.main_frame else None)
                    config={'wsUrl':f'ws://127.0.0.1:{PORT}' if online else '', 'regions':{'EU':entries}}
                    context.route('**/config.js',lambda route:route.fulfill(content_type='text/javascript',body='window.VINTAGE_CONFIG='+json.dumps(config)));context.route('**/client.js*',lambda route:route.fulfill(content_type='text/javascript',body=source))
                    page.goto(BASE,wait_until='domcontentloaded');page.wait_for_function('document.getElementById("boot-screen").dataset.phase==="burst"');page.wait_for_timeout(120);page.screenshot(path=str(OUT/('intro-burst-'+key+'.png')));page.wait_for_function('Boolean(window.__flow)&&document.getElementById("boot-screen").hidden')
                    intro=page.evaluate('__intro');assert intro['readyAt']<=intro['burstAt']<intro['endAt'] and intro['endAt']-intro['burstAt']>=800,intro
                    assert page.locator('.boot-logo-fragments>i').count()==8 and page.locator('.boot-shard').count()==28
                    assert not page.locator('#lobby-mode-mass').count();assert 'STARTS AT' not in page.locator('#lobby').inner_text();origin=page.evaluate('performance.timeOrigin')
                    def menu():
                        if not page.locator('#lobby').is_visible():page.locator('#menu-btn').click()
                    def pick(server_id):
                        menu();page.locator('#server-picker-btn').click();page.locator('.server-entry[data-server-id="'+server_id+'"]').click()
                    def ready_play(mode):
                        page.wait_for_function('mode=>{const c=__flow,ids=c.remote?.myIds||c.arena.myIds;return c.playing&&c.mode===mode&&ids.length===2&&ids.every(id=>c.snapshot.players.find(p=>p.id===id)?.cells.length)}',arg=mode)
                    def watch_from_lobby():
                        menu();return page.locator('#spectate-btn').evaluate(r'''el=>{const c=__flow,old={cam:{...c.renderer.cam},zoom:c.renderer.zoom,time:c.arena.elapsed};window.__beforeWatch={zoom:c.renderer.zoom,remote:c.remote,socket:c.remote?.sockets[0],food:c.arena.food,npc:c.arena.players.find(p=>p.npc)};el.click();return {cameraPreserved:JSON.stringify(old.cam)===JSON.stringify(c.renderer.cam),zoomPreserved:old.zoom===c.renderer.zoom,worldPreserved:c.remote?c.remote===window.__beforeWatch.remote&&c.remote.sockets[0]===window.__beforeWatch.socket:c.arena.food===window.__beforeWatch.food&&c.arena.players.includes(window.__beforeWatch.npc)&&c.arena.elapsed===old.time};}''')
                    pick('senpa-dual');page.locator('#nickname').fill('FlowFixture');initial=watch_from_lobby();assert initial['cameraPreserved'] and initial['zoomPreserved'],initial
                    page.wait_for_function('__flow.spectating&&(__flow.remote?__flow.remote.connected:__flow.arena.myIds.length===0)')
                    if not online:assert initial['worldPreserved'],initial
                    sent=page.evaluate('__packets.filter(p=>p.type==="spectate").length');again=watch_from_lobby();assert again['worldPreserved'];assert page.evaluate('__packets.filter(p=>p.type==="spectate").length')==sent
                    menu();page.locator('#play-btn').click();ready_play('dual')
                    if not online:page.evaluate('()=>{const a=__flow.arena;a.myIds.forEach((id,i)=>{const p=a.getById(id);p.cells=[{x:1500+i*2400,y:2500,mass:5000,age:1000,boost:0,boostX:0,boostY:0}];p.movementStopped=true;});a.viruses=a.viruses.filter(v=>Math.hypot(v.x-1500,v.y-2500)>600&&Math.hypot(v.x-3900,v.y-2500)>600);}')
                    page.evaluate(r'''()=>{const c=__flow;c.settings.zoom=.6;c.renderer.zoom=.42;c.settings.foodSize=2;c.settings.feedSize=2;c.settings.animation=100;window.__feed={samples:[],radii:[],smoothing:false};const animator=c.renderer.feedAnimator,sample=animator.sample.bind(animator),ctx=c.renderer.ctx,arc=ctx.arc.bind(ctx);animator.sample=function(...args){const result=sample(...args),feed=result.filter(f=>f.ejected);window.__lastFeed=feed;for(const f of feed){const raw=args[0].find(p=>p.feedId===f.feedId);__feed.samples.push({radius:f.radius,alpha:f.renderAlpha});if(raw&&Math.hypot(raw.x-f.x,raw.y-f.y)>.01)__feed.smoothing=true;}return result;};ctx.arc=function(x,y,r,...rest){if(window.__lastFeed?.some(f=>f.x===x&&f.y===y))__feed.radii.push(r);return arc(x,y,r,...rest);};document.activeElement?.blur();}''')
                    page.mouse.move(1400,500);page.keyboard.down('e');page.wait_for_timeout(380);page.keyboard.up('e');page.wait_for_timeout(100)
                    feed=page.evaluate('__feed');assert feed['samples'] and feed['radii'] and feed['smoothing'],feed
                    assert all(abs(r-14.7)<1e-8 for r in feed['radii']) and all(f['alpha']==1 for f in feed['samples']),feed
                    page.screenshot(path=str(OUT/('dual-feed-'+key+'.png')))
                    watch=watch_from_lobby();assert all(watch.values()),watch
                    page.wait_for_timeout(250);assert page.evaluate("Math.abs(__flow.renderer.zoom-window.__beforeWatch.zoom)<.00001")
                    if online:page.wait_for_function('__flow.remote.opts.spectator&&!__flow.snapshot.vision');assert page.evaluate('__flow.remote.opts.serverId')=='senpa-dual'
                    menu();page.locator('#play-btn').click();ready_play('dual');pick('aster-domination');ready_play('dual')
                    if online:assert page.evaluate('__flow.remote.opts.serverId')=='aster-domination'
                    nondefault=watch_from_lobby();assert all(nondefault.values());page.wait_for_timeout(100)
                    if online:assert page.evaluate('__flow.remote.opts.serverId')=='aster-domination'
                    pick('senpa-ffa');page.wait_for_function('__flow.spectating&&__flow.mode==="ffa"&&(!__flow.remote||__flow.remote.connected)')
                    if online:assert page.evaluate('__flow.remote.opts.serverId')=='senpa-ffa'
                    pick('senpa-mega');page.wait_for_function('__flow.spectating&&__flow.mode==="mega"&&(!__flow.remote||__flow.remote.connected)');menu();page.locator('#play-btn').click();ready_play('mega');pick('vintage-ffa');ready_play('ffa')
                    assert not dialogs and len(navigations)==1 and page.evaluate('performance.timeOrigin')==origin,(dialogs,navigations)
                    page.reload(wait_until='domcontentloaded');page.wait_for_function('Boolean(window.__flow)&&document.getElementById("boot-screen").hidden');cached=page.evaluate('__intro');assert cached['endAt']-cached['burstAt']>=800 and cached['burstAt']>=1300,cached
                    assert not errors,errors;report['results'][key]={'intro':intro,'cachedIntro':cached,'dualRadius':feed['radii'][0],'dualSmoothing':True,'noDialogOnSwitch':True,'correctServerIDs':True,'spectatePreservesWorld':True,'spectatePreservesCamera':True,'noPageReloadOnWatchOrSwitch':True,'pageErrors':errors};context.close()
                context=browser.new_context(reduced_motion='reduce');page=context.new_page();page.goto(BASE,wait_until='domcontentloaded');page.wait_for_function('document.getElementById("boot-screen").hidden');report['reducedMotionSkipsBurst']=page.locator('.boot-shard').count()==0;assert report['reducedMotionSkipsBurst'];context.close()
            finally:browser.close()
        report['passed']=True;(OUT/'browser-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
    finally:
        server.terminate()
        try:server.wait(timeout=5)
        except subprocess.TimeoutExpired:server.kill();server.wait()
