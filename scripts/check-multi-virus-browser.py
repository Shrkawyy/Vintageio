"""Reproduce multibox/feed/virus regressions in the real client and WebSocket transport."""
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/ffa-2026-10-23'
PORT = 38771
BASE = f'http://127.0.0.1:{PORT}'
# Fixtures stay inside this test process; production has no debug endpoint or mass command.
preload = r"""
const core=require('./server/core.cjs'),physics=require('./server/physics.cjs'),v=require('./server/virus.cjs');
const rooms={},create=core.createRoom,step=core.step;
core.createRoom=spec=>{const r=create({...spec,bots:0});r.food=[];r.viruses=[];r.nextFoodSpawnAt=Infinity;r.frozen=true;rooms[r.id]=r;return r;};
core.step=(r,dt)=>{if(r.frozen){r.time+=dt;return;}step(r,dt);};
let input='';process.stdin.on('data',chunk=>{input+=chunk;let end;while((end=input.indexOf('\n'))>=0){
 const command=input.slice(0,end).trim();input=input.slice(end+1);const r=rooms['vintage-ffa'],[a,b]=[...r.players.values()];
 if(!a||!b)continue;
 if(command==='feed'){
  a.cells=[{x:6000,y:6000,mass:5000}];b.cells=[{x:6800,y:6000,mass:1000}];a.target={x:7000,y:6000};
  r.food=[];core.feed(r,a);r.food[0].vx=r.food[0].vy=0;
 }else if(command==='respawn'){
  a.cells=[{x:6000,y:6000,mass:5000}];b.cells=[];
 }else if(command==='overlap'){
  a.cells[0].x=b.cells[0].x;a.cells[0].y=b.cells[0].y;physics.eatCells([a,b],r.physics,r.time);
 }else if(command==='virus'){
  a.cells=[{x:6000,y:6000,mass:6000}];b.cells=[{x:6800,y:6000,mass:1000}];
  a.target={x:6000,y:6000};b.target={x:6800,y:6000};a.movementStopped=b.movementStopped=true;
  r.viruses=[v.makeVirus(6000,6000),v.makeVirus(5600,5600)];
  r.food=Array.from({length:7},()=>({x:5600,y:5600,mass:25,ejected:true,vx:400,vy:0}));step(r,0);r.frozen=false;
 }
}});require('./server/index.js');
"""
server = subprocess.Popen(['node', '-e', preload], cwd=ROOT,
    env={**os.environ, 'PORT': str(PORT)}, stdin=subprocess.PIPE,
    stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
report = {}

def command(name):
    server.stdin.write(name+'\n')
    server.stdin.flush()

try:
    for _ in range(80):
        try:
            urllib.request.urlopen(BASE+'/health', timeout=1).close()
            break
        except OSError:
            time.sleep(.1)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe', headless=True)
        for online in [False, True]:
            context = browser.new_context(viewport={'width': 1440, 'height': 1000})
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            config = {'wsUrl': f'ws://127.0.0.1:{PORT}' if online else ''}
            page.route('**/config.js', lambda route: route.fulfill(content_type='text/javascript', body='window.VINTAGE_CONFIG='+json.dumps(config)))
            source = (ROOT/'public/client.js').read_text(encoding='utf-8')
            source += '\nwindow.__check={arena,renderer,settings,get remote(){return remote},get snapshot(){return remoteSnapshot||arena.snapshot}};'
            page.route('**/client.js*', lambda route: route.fulfill(content_type='text/javascript', body=source))
            page.goto(BASE, wait_until='domcontentloaded')
            page.wait_for_function('Boolean(window.__check)')
            page.locator('#nickname').fill('Multi regression')
            page.locator('#play-btn').click()
            if online:
                page.wait_for_function('window.__check.remote?.myIds.filter(Boolean).length===2 && window.__check.remote.latest')
            page.wait_for_function('window.__check.snapshot.players.filter(p=>!p.npc).length===2')
            initial_distance = page.evaluate('''() => {const ps=window.__check.snapshot.players.filter(p=>!p.npc);return Math.hypot(ps[0].cells[0].x-ps[1].cells[0].x,ps[0].cells[0].y-ps[1].cells[0].y)}''')
            assert initial_distance < 500, (online, initial_distance)
            page.evaluate('window.__check.settings.backgroundImage=false')
            if online:
                command('feed')
            else:
                page.evaluate('''() => {const a=window.__check.arena;a.players=a.myIds.map(id=>a.getById(id));a.food=[];a.viruses=[];a.nextFoodSpawnAt=Infinity;
                a.players.forEach((p,i)=>{p.cells=[{x:6000+i*800,y:6000,mass:i?1000:5000}];p.movementStopped=true});
                a.players[0].target={x:7000,y:6000};a.feed(a.myIds[0]);a.food[0].vx=a.food[0].vy=0;}''')
            page.wait_for_function('window.__check.snapshot.food.some(f=>f.ejected)')
            color_before = page.evaluate('window.__check.snapshot.food.find(f=>f.ejected).color')
            page.keyboard.press('Tab')
            page.wait_for_timeout(120)
            assert page.evaluate('window.__check.snapshot.food.find(f=>f.ejected).color') == color_before
            page.keyboard.press('Tab')
            # An actual Tab key invokes client placement and the production respawn handler.
            if online:
                command('respawn')
            else:
                page.evaluate('''() => {const a=window.__check.arena;a.players[0].cells=[{x:6000,y:6000,mass:5000}];a.players[1].cells=[];a.food=[];}''')
            page.wait_for_function('window.__check.snapshot.players.filter(p=>!p.npc)[1].cells.length===0')
            page.keyboard.press('Tab')
            page.wait_for_function('window.__check.snapshot.players.filter(p=>!p.npc)[1].cells.length===1')
            respawn_distance = page.evaluate('''() => {const ps=window.__check.snapshot.players.filter(p=>!p.npc);return Math.hypot(ps[0].cells[0].x-ps[1].cells[0].x,ps[0].cells[0].y-ps[1].cells[0].y)}''')
            assert respawn_distance < 550, (online, respawn_distance)
            if online:
                command('overlap')
            else:
                page.evaluate('''() => {const a=window.__check.arena,[p,q]=a.players;p.cells[0].x=q.cells[0].x;p.cells[0].y=q.cells[0].y;}''')
            page.wait_for_function('window.__check.snapshot.players.filter(p=>!p.npc)[1].cells.length===0', timeout=1000)
            page.keyboard.press('Tab')
            if online:
                command('virus')
            else:
                page.evaluate('''async () => {const a=window.__check.arena,v=await import('/virus-rules.js?v=5-smooth-launch');
                  a.players.forEach((p,i)=>{p.cells=[{x:6000+i*800,y:6000,mass:i?1000:6000}];p.movementStopped=true});
                  a.viruses=[v.makeVirus(6000,6000),v.makeVirus(5600,5600)];
                  a.food=Array.from({length:7},()=>({x:5600,y:5600,mass:25,ejected:true,vx:400,vy:0}));}''')
            page.wait_for_function('window.__check.snapshot.players.filter(p=>!p.npc)[0].cells.length===16')
            page.wait_for_function('window.__check.snapshot.viruses.some(v=>v.originX===5600)')
            samples = page.evaluate('''async () => {const c=window.__check,result=[];for(let i=0;i<24;i++){
              await new Promise(requestAnimationFrame);const v=c.snapshot.viruses.find(v=>v.originX===5600);
              result.push({id:v.id,actual:v.x,visual:c.renderer.virusAnimator.viruses.get('virus:'+v.id)?.x});
            }return result;}''')
            assert len({s['id'] for s in samples}) == 1
            assert len({round(s['visual'], 3) for s in samples if s['visual'] is not None}) >= 12
            if online:
                assert any(samples[i]['actual'] == samples[i-1]['actual'] and samples[i]['visual'] != samples[i-1]['visual'] for i in range(1, len(samples)))
            page.screenshot(path=str(OUT/('online-virus-multi-fixes.png' if online else 'local-virus-multi-fixes.png')))
            assert not errors, errors
            report['online' if online else 'local'] = {'initialDistance':initial_distance,'respawnDistance':respawn_distance,
                'feedColorAfterTab':color_before,'eatOwnedDuringShield':True,'burstCells':16,'virusSamples':samples,'pageErrors':errors}
            context.close()
        browser.close()
    (OUT/'multi-virus-browser-check.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report))
finally:
    server.terminate()
    server.wait(timeout=10)
