"""Exercise live theme colors, drag objects, and inspect their game/lobby pixels."""
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/ffa-2026-10-23'
PORT=38769
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
        page=browser.new_page(viewport={'width':1600,'height':1000},accept_downloads=True)
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        source=(ROOT/'public/client.js').read_text(encoding='utf-8-sig')+'\nwindow.__theme={renderer,get settings(){return settings},get draft(){return themeDraft},get scene(){return scenePreview}};'
        page.route('**/client.js*',lambda route:route.fulfill(content_type='text/javascript',body=source))
        page.goto(BASE,wait_until='domcontentloaded');page.wait_for_function('Boolean(window.__theme)')
        page.locator('#lobby-settings-btn').click();page.locator('#settings-tabs [data-tab="theme"]').click()
        page.locator('#settings-nav').get_by_role('button',name='Background',exact=True).click();page.get_by_label('Use background image',exact=True).uncheck()
        page.locator('#settings-nav').get_by_role('button',name='Scene Lab',exact=True).click()
        stage=page.get_by_label('Live theme scene',exact=True)
        def color(label,value):
            page.get_by_label(label,exact=True).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}))}',value)
        def slider(label,value):
            page.get_by_label(label,exact=True).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}))}',str(value))
        initial=stage.evaluate('c=>c.toDataURL()');page.wait_for_timeout(700);assert initial!=stage.evaluate('c=>c.toDataURL()'),'live cells and feed must move'
        color('Theme Accent','#ff9933');color('Theme Panel / HUD','#283045');color('Theme Interface text','#ffeecc');color('Theme Field background','#102030');color('Theme Food','#33ff88');color('Theme Grid','#557799')
        assert page.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()')=='#ff9933'
        assert page.evaluate('window.__theme.settings.accentColor')!='#ff9933','a draft must not overwrite saved preferences before Save'
        page.wait_for_timeout(90)
        pixel=stage.evaluate('c=>[...c.getContext("2d").getImageData(4,4,1,1).data]');assert pixel[:3]==[16,32,48],pixel
        page.get_by_label('Scene object',exact=True).select_option('diamond');page.get_by_role('button',name='Add object',exact=True).click()
        assert len(page.evaluate('window.__theme.draft.themeArtwork.elements'))==1
        def position(x,y):
            box=stage.bounding_box();pos=page.evaluate('''p=>{const r=window.__theme.scene.renderer;return{x:r.screenW/2+(p[0]/1024*1200-r.cam.x)*r.zoom,y:r.screenH/2+(p[1]/1024*1200-r.cam.y)*r.zoom}}''',[x,y]);return {'x':box['x']+pos['x'],'y':box['y']+pos['y']}
        item=page.evaluate('window.__theme.draft.themeArtwork.elements[0]');a=position(item['x']+85,item['y']+85);b=position(300,700)
        page.mouse.move(a['x'],a['y']);page.mouse.down();page.mouse.move(b['x'],b['y'],steps=12);page.mouse.up()
        moved=page.evaluate('window.__theme.draft.themeArtwork.elements[0]');assert moved['y']>500,moved
        color('Scene object color','#ff0000');slider('Scene object size',220);slider('Scene object rotation',30)
        page.get_by_role('button',name='Delete',exact=True).click();assert not page.evaluate('window.__theme.draft.themeArtwork.elements')
        page.locator('.theme-scene-tools').get_by_role('button',name='Undo',exact=True).click();assert len(page.evaluate('window.__theme.draft.themeArtwork.elements'))==1
        for kind,color_value in [('star','#f4c46d'),('hexagon','#81d8b8'),('cross','#9a9cff')]:
            page.get_by_label('Scene object',exact=True).select_option(kind);page.get_by_role('button',name='Add object',exact=True).click();color('Scene object color',color_value)
        page.get_by_role('button',name='Add symbol 🪐',exact=True).click()
        assert len(page.evaluate('window.__theme.draft.themeArtwork.elements'))==5
        page.screenshot(path=str(OUT/'live-theme-scene-desktop.png'))
        page.get_by_role('button',name='SAVE & APPLY THEME',exact=True).click()
        expected=page.evaluate('window.__theme.settings.themeArtwork');assert expected['transparent']
        assert page.evaluate('window.__theme.settings.rainbowFood') is False
        assert page.evaluate('window.__theme.settings.showGrid') is True
        page.keyboard.press('Escape')
        lobby_pixel=page.evaluate('''()=>{const art=window.__theme.settings.themeArtwork,e=art.elements[0],a=e.rotation*Math.PI/180;const px=e.x+Math.cos(a)*e.w/2-Math.sin(a)*e.h/2,py=e.y+Math.sin(a)*e.w/2+Math.cos(a)*e.h/2;const c=document.querySelector('#theme-artwork-overlay'),ratio=c.width/innerWidth,span=Math.min(innerWidth,innerHeight)*.92;return [...c.getContext('2d').getImageData(((innerWidth-span)/2+px/1024*span)*ratio,((innerHeight-span)/2+py/1024*span)*ratio,1,1).data]}''')
        assert lobby_pixel[:3]==[255,0,0],lobby_pixel
        page.screenshot(path=str(OUT/'live-theme-lobby.png'))
        page.locator('#play-btn').click()
        game_pixel=page.evaluate('''()=>{const {renderer:r,settings:s}=window.__theme,e=s.themeArtwork.elements[0],a=e.rotation*Math.PI/180,px=(e.x+Math.cos(a)*e.w/2-Math.sin(a)*e.h/2)/1024*12000,py=(e.y+Math.sin(a)*e.w/2+Math.cos(a)*e.h/2)/1024*12000;r.cam={x:6000,y:6000};r.zoom=.04;r.draw({mode:'ffa',worldSize:12000,players:[],food:[],viruses:[]},null,{...s,zoom:.04,showGrid:false,showSectors:false},false,0,true);return [...r.ctx.getImageData(r.screenW/2+(px-6000)*.04,r.screenH/2+(py-6000)*.04,1,1).data]}''')
        assert game_pixel[:3]==[255,0,0],game_pixel
        page.reload();page.wait_for_function('Boolean(window.__theme)');assert page.evaluate('window.__theme.settings.themeArtwork')==expected
        page.locator('#lobby-settings-btn').click();page.locator('#settings-tabs [data-tab="theme"]').click();page.locator('#settings-nav').get_by_role('button',name='Scene Lab',exact=True).click()
        color('Theme Accent','#11ccdd');page.get_by_role('button',name='Add object',exact=True).click();page.keyboard.press('Escape')
        assert page.evaluate('window.__theme.settings.themeArtwork')==expected
        assert page.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()')=='#ff9933'
        page.locator('#lobby-settings-btn').click();page.locator('#settings-tabs [data-tab="import"]').click();page.get_by_role('button',name='EXPORT JSON',exact=False).click()
        exported=page.locator('#settings-json').input_value();assert json.loads(exported)['themeArtwork']==expected
        page.locator('#settings-json').fill(exported);page.get_by_role('button',name='IMPORT JSON',exact=False).click();assert page.evaluate('window.__theme.settings.themeArtwork')==expected
        page.locator('#settings-tabs [data-tab="theme"]').click();page.locator('#settings-nav').get_by_role('button',name='Scene Lab',exact=True).click()
        page.locator('#settings-reset-tab').click();assert page.evaluate('window.__theme.settings.themeArtwork') is None;assert page.evaluate('window.__theme.draft.themeArtwork') is None
        assert not errors,errors
        report['desktop']={'liveRenderer':True,'immediateColorPreview':True,'dragResizeRotate':True,'fiveObjectsSaved':True,'draftRevertsOnClose':True,'reloadAndJSON':True,'resetClearsScene':True,'lobbyPixel':lobby_pixel,'gamePixel':game_pixel,'noPageErrors':True}
        mobile=browser.new_page(viewport={'width':390,'height':844});mobile_errors=[];mobile.on('pageerror',lambda e:mobile_errors.append(str(e)))
        mobile.goto(BASE,wait_until='domcontentloaded');mobile.locator('#lobby-settings-btn').click();mobile.locator('#settings-tabs [data-tab="theme"]').click();mobile.locator('#settings-nav').get_by_role('button',name='Scene Lab',exact=True).click()
        assert mobile.get_by_label('Live theme scene',exact=True).is_visible()
        mobile.get_by_role('button',name='Add object',exact=True).click();mobile.get_by_label('Scene object color',exact=True).evaluate('e=>{e.value="#aa44ff";e.dispatchEvent(new Event("input",{bubbles:true}))}')
        mobile.screenshot(path=str(OUT/'live-theme-scene-mobile.png'))
        mobile.get_by_role('button',name='SAVE & APPLY THEME',exact=True).click();assert not mobile_errors,mobile_errors
        report['mobile']={'liveStageVisible':True,'addAndSaveObject':True,'noPageErrors':True}
        browser.close()
    (OUT/'live-theme-browser-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
finally:
    server.terminate();server.wait(timeout=10)
