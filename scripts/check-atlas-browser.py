"""Exercise Atlas/border controls and sample actual canvas pixels in Chrome."""
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/ffa-2026-10-23'
PORT=38767
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
        page=browser.new_page(viewport={'width':1600,'height':1000});errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        source=(ROOT/'public/client.js').read_text(encoding='utf-8-sig')+'\nwindow.__atlas={arena,renderer,drawArenaGuides,get settings(){return settings}};'
        page.route('**/client.js*',lambda route:route.fulfill(content_type='text/javascript',body=source))
        page.goto(BASE,wait_until='domcontentloaded');page.wait_for_function('Boolean(window.__atlas)')
        page.locator('#lobby-settings-btn').click()
        page.locator('#settings-tabs [data-tab="theme"]').click()
        page.locator('#settings-nav').get_by_role('button',name='Border',exact=True).click()

        def color(label,value):
            page.get_by_label(label+' hex',exact=True).fill(value)
            assert page.get_by_label(label,exact=True).input_value()=='#'+value.lower()
        def slider(label,value):
            page.get_by_label(label,exact=True).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}))}',str(value))

        color('Border color','FFFFFF');slider('Border width',12)
        page.get_by_label('Edge glow',exact=True).check();color('Glow color','F947D7')
        slider('Glow spread',45);slider('Glow intensity',85)
        page.get_by_label('Edge style',exact=True).select_option('prism')
        page.screenshot(path=str(OUT/'settings-atlas-border.png'))
        page.locator('#settings-nav').get_by_role('button',name='Sectors',exact=True).click()
        page.get_by_label('Atlas sectors',exact=True).check()
        color('Sector grid color','FF2020');color('Sector label color','FFFFFF')
        slider('Sector line width',3);slider('Coordinate size',14)
        page.get_by_label('Coordinate placement',exact=True).select_option('center')
        page.screenshot(path=str(OUT/'settings-atlas-sectors.png'))
        page.locator('#settings-nav').get_by_role('button',name='Background',exact=True).click()
        page.get_by_label('Use background image',exact=True).uncheck()
        page.get_by_label('Background grid',exact=True).uncheck();color('Background color','002233')
        page.reload();page.wait_for_function('Boolean(window.__atlas)')
        saved=page.evaluate('({...window.__atlas.settings})')
        for key,value in {'borderColor':'#FFFFFF','borderWidth':12,'borderStyle':'prism','borderGlow':True,'borderGlowDistance':45,'borderGlowStrength':85,'sectorGridColor':'#FF2020','sectorGridWidth':3,'sectorLabelSize':14,'sectorLabelPosition':'center','showSectors':True,'backgroundImage':False,'bgColor':'#002233'}.items():
            assert saved[key]==value,(key,saved[key],value)
        report['settingsPersistAcrossReload']=True

        # Pause the test page loop, then render fixtures without another frame racing the pixel reads.
        page.locator('#play-btn').click()
        page.evaluate('window.requestAnimationFrame=()=>0');page.wait_for_timeout(80)
        pixels=page.evaluate('''()=>{
          const {renderer:r,settings:s}=window.__atlas;
          const state={mode:'ffa',worldSize:12000,players:[],food:[],viruses:[],vision:[{left:2400,top:2400,right:9600,bottom:9600}]};
          const read=(x,y)=>[...r.ctx.getImageData(Math.round(r.screenW/2+(x-r.cam.x)*r.zoom),Math.round(r.screenH/2+(y-r.cam.y)*r.zoom),1,1).data];
          const out=[];
          for(const zoom of [.04,.1]){
            r.cam={x:6000,y:6000};r.zoom=zoom;
            const settings={...s,zoom,borderStyle:'solid',borderGlow:false,showMinimap:false};
            r.draw(state,null,settings,false,0,true);
            out.push({zoom,edge:read(4/zoom,6000),sector:read(2400,6000),background:read(1200,1200),outsideSightSector:read(2400,1200)});
          }
          r.cam={x:6000,y:6000};r.zoom=.04;
          r.draw(state,null,{...s,zoom:.04,borderStyle:'solid',borderGlow:false,showMinimap:false},false,0,true);
          const noGlow=read(-200,6000);
          r.draw(state,null,{...s,zoom:.04,borderStyle:'solid',borderGlow:true,showMinimap:false},false,0,true);
          const glow=read(-200,6000);
          const solid=read(6000,100);
          r.draw(state,null,{...s,zoom:.04,borderStyle:'prism',borderGlow:false,showMinimap:false},false,0,true);
          const prism=read(6000,100);
          r.draw(state,null,{...s,zoom:.04,showSectors:false,showBorders:false,showMinimap:false},false,0,true);
          const hidden=read(2400,6000);
          r.draw(state,null,{...s,zoom:.04,borderStyle:'prism',borderGlow:true,showMinimap:false},false,0,true);
          return {out,noGlow,glow,solid,prism,hidden};
        }''')
        for item in pixels['out']:
            assert item['edge'][:3]==[255,255,255],item
            assert item['sector'][:3]==[255,32,32],item
            assert item['outsideSightSector'][:3]==[255,32,32],item
            assert item['background'][:3]==[0,34,51],item
        assert pixels['glow'][0]>pixels['noGlow'][0]+10,pixels
        assert pixels['solid'][:3]!=pixels['prism'][:3],pixels
        assert pixels['hidden'][:3]==[0,34,51],pixels
        report['renderedPixels']=pixels
        page.screenshot(path=str(OUT/'arena-atlas-prism.png'))
        assert not errors,errors
        report['noPageErrors']=True
        browser.close()
    (OUT/'atlas-browser-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report))
finally:
    server.terminate();server.wait(timeout=10)
