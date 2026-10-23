"""Exercise the actual local and WebSocket clients in an isolated headless browser."""
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/ffa-2026-10-23'
PORT = 38765
BASE = f'http://127.0.0.1:{PORT}'
report = {}
server = subprocess.Popen(['node', 'server/index.js'], cwd=ROOT, env={**os.environ, 'PORT': str(PORT)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
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
            page.add_init_script("""window.__drawn=[];
              const fill=CanvasRenderingContext2D.prototype.fillText;
              CanvasRenderingContext2D.prototype.fillText=function(text,...rest){
                window.__drawn.push(String(text));if(window.__drawn.length>4000)window.__drawn.shift();return fill.call(this,text,...rest);
              };""")
            config = {'wsUrl': f'ws://127.0.0.1:{PORT}' if online else ''}
            page.route('**/config.js', lambda route: route.fulfill(content_type='text/javascript', body='window.VINTAGE_CONFIG='+json.dumps(config)))
            client = (ROOT/'public/client.js').read_text(encoding='utf-8')
            client += "\nwindow.__check={arena,renderer,settings,get remote(){return remote},get playing(){return playing},get activeSlot(){return activeSlot},get snapshot(){return remoteSnapshot||arena.snapshot}};"
            page.route('**/client.js*', lambda route: route.fulfill(content_type='text/javascript', body=client))
            page.goto(BASE, wait_until='domcontentloaded')
            page.wait_for_function('Boolean(window.__check)')
            assert page.locator('#team-tag').get_attribute('type') == 'password'
            page.locator('#nickname').fill('FFA Tester')
            page.locator('#team-tag').fill('SECRET42')
            if not online:
                page.locator('#lobby-settings-btn').click()
                page.locator('#settings-tabs [data-tab="controls"]').click()
                # Capture standalone Shift on release, and preserve modifier combinations.
                for key in ['Home','Backspace','F12','Shift']:
                    page.get_by_label('Split', exact=True).click()
                    page.keyboard.press(key)
                    assert page.get_by_label('Split', exact=True).input_value() == key.upper()
                page.get_by_label('Double split', exact=True).click()
                page.keyboard.press('Control+q')
                assert page.get_by_label('Double split', exact=True).input_value() == 'CTRL+Q'
                page.keyboard.press('Escape')
                page.reload(wait_until='domcontentloaded')
                page.wait_for_function('Boolean(window.__check)')
                assert page.evaluate('window.__check.settings.keySplit') == 'SHIFT'
                assert page.evaluate('window.__check.settings.keyDoubleSplit') == 'CTRL+Q'
                page.locator('#nickname').fill('FFA Tester')
                page.locator('#team-tag').fill('SECRET42')
            page.locator('#play-btn').click()
            page.wait_for_function('window.__check.playing')
            if online:
                page.wait_for_function('window.__check.remote?.myIds.filter(Boolean).length===2 && window.__check.remote.latest')
            else:
                page.evaluate("""() => {
                  const {arena:a,settings:s}=window.__check;a.players=a.myIds.map(id=>a.getById(id));a.food=[];a.viruses=[];a.nextFoodSpawnAt=Infinity;
                  a.players.forEach((p,i)=>{p.cells=[{x:1800+i*700,y:2400,mass:5000}];p.target={x:3500,y:2400}});
                  s.backgroundImage=false;
                }""")
            page.mouse.move(1150, 500)
            def own_mass():
                return page.evaluate("""() => {const c=window.__check,ids=c.remote?c.remote.myIds:c.arena.myIds;return ids.map(id=>c.snapshot.players.find(p=>p.id===id)?.cells.reduce((s,c)=>s+c.mass,0)||0)}""")
            before = own_mass()
            page.keyboard.down('e')
            page.wait_for_timeout(550)
            page.keyboard.up('e')
            after = own_mass()
            assert after[0] < before[0]-80, (online,before,after)
            page.keyboard.press('Tab')
            assert page.evaluate('window.__check.activeSlot') == 1
            page.keyboard.down('e')
            page.wait_for_timeout(400)
            page.keyboard.up('e')
            assert own_mass()[1] < after[1]-60
            page.keyboard.press('Enter')
            page.locator('#chat-input').fill('FFA private tag check')
            page.keyboard.press('Enter')
            page.wait_for_timeout(150)
            assert page.locator('#chat-messages .who').last.inner_text() == 'FFA Tester: '
            assert not page.evaluate("window.__drawn.some(text=>text.includes('SECRET42'))")
            assert page.locator('#own-connections .connection-row').count() == 2
            assert page.locator('#score-box, #zoom-panel, #allies-heading, #map-team').count() == 0
            assert 'Controlling Connect' not in page.locator('#toast-area').inner_text()
            assert page.locator('#board-entries .leader-entry').count() == 2
            assert page.locator('#board-entries .leader-entry').first.locator('span').count() == 2
            assert 'FPS:' in page.locator('#live-stats').inner_text()
            if online:
                assert not page.evaluate("JSON.stringify(window.__check.remote.latest).includes('SECRET42')")
                assert page.evaluate("window.__check.remote.latest.players.filter(p=>!p.npc).every(p=>!('tag' in p)&&p.teamId)")
                assert page.evaluate('window.__check.remote.latest.worldSize') == 12000
                assert page.evaluate('window.__check.remote.latest.maxCells') == 16
                assert page.evaluate('window.__check.remote.latest.vision.length') >= 1
                assert page.evaluate('window.__check.remote.latest.players.filter(p=>window.__check.remote.myIds.includes(p.id)).length') == 2
                await_peers = """async () => {
                  window.__hudPeers=[];
                  for(const [name,tag] of [['Buddy','SECRET42'],['SoloOne',''],['SoloTwo','']]){
                    const record={name,ws:new WebSocket('ws://127.0.0.1:38765')};window.__hudPeers.push(record);
                    record.ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='welcome')record.id=m.playerId;if(m.type==='state')record.state=m;};
                    await new Promise(resolve=>{record.ws.onopen=()=>{record.ws.send(JSON.stringify({type:'join',mode:'ffa',name,tag}));resolve();};});
                  }
                }"""
                page.evaluate(await_peers)
                page.wait_for_function("window.__hudPeers.every(p=>p.state?.peers?.length)")
                page.wait_for_function("Array.from(document.querySelectorAll('.leader-name')).some(n=>n.textContent==='Buddy')")
                assert not page.locator('#board-entries').inner_text().find('SoloOne') >= 0
                assert page.evaluate("window.__hudPeers[0].state.peers.some(p=>p.name==='FFA Tester')")
                assert page.evaluate("window.__hudPeers.slice(1).every(r=>r.state.peers.some(p=>p.name==='SoloOne')&&r.state.peers.some(p=>p.name==='SoloTwo')&&r.state.peers.every(p=>!p.teamId))")
            else:
                page.evaluate("""() => {const a=window.__check.arena;const p=a.getById(a.myIds[0]);p.cells=[{x:1800,y:2400,mass:22500}]}""")
                page.wait_for_function('window.__check.arena.getById(window.__check.arena.myIds[0]).cells.length===2')
                page.evaluate("""() => {const a=window.__check.arena,p=a.getById(a.myIds[1]);p.cells=[{x:3000,y:2400,mass:16000}]}""")
                page.keyboard.press('d')
                page.wait_for_function('window.__check.arena.getById(window.__check.arena.myIds[1]).cells.length===16')
                page.screenshot(path=str(OUT/'local-ffa-16-cells.png'))
                # A readable feed screenshot using the same live renderer and keyboard inputs.
                page.evaluate("""() => {const a=window.__check.arena;a.players.forEach((p,i)=>p.cells=[{x:1900+i*650,y:2400,mass:5000}]);a.food=[];}""")
                page.keyboard.down('e');page.wait_for_timeout(750);page.keyboard.up('e')
                page.keyboard.press('Tab')
                page.evaluate("""() => {const a=window.__check.arena,p=a.getById(a.myIds[0]);p.cells=[{x:6000,y:6000,mass:2000}]}""")
                page.keyboard.press('Shift')
                assert page.evaluate('window.__check.arena.getById(window.__check.arena.myIds[0]).cells.length') == 2
                # Wheel and panel zoom span the enlarged range while sight stays fixed.
                page.evaluate("""() => {const a=window.__check.arena;a.players.forEach((p,i)=>{p.movementStopped=true;p.cells=[{x:6000+i*500,y:6000,mass:2000}]})}""")
                before_vision=page.evaluate('window.__check.snapshot.vision')
                page.mouse.move(800,600)
                for _ in range(8):page.mouse.wheel(0,-320)
                page.wait_for_timeout(200)
                assert page.evaluate('window.__check.settings.zoom') > 5
                page.mouse.move(800,600)
                for _ in range(24):page.mouse.wheel(0,320)
                page.wait_for_timeout(200)
                assert page.evaluate('window.__check.settings.zoom') < .1
                assert page.evaluate('window.__check.snapshot.vision') == before_vision
                page.screenshot(path=str(OUT/'ffa-sector-visibility-wide-zoom.png'))
                page.keyboard.press('Alt+3')
            page.screenshot(path=str(OUT/('online-ffa.png' if online else 'local-ffa-feed.png')))
            assert not errors, errors
            report['online' if online else 'local']={'feedPrimary':True,'feedSecondary':True,'tab':True,'tagHidden':True,'chatNameOnly':True,'vision':True,'worldSize':12000,'maxSplit':16,**({'keyboardAndZoom':True} if not online else {}),'pageErrors':errors}
            context.close()
        browser.close()
    (OUT/'browser-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report))
finally:
    server.terminate()
    server.wait(timeout=10)
