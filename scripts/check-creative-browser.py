"""Check the real drawing editor, persistence/source switching, and animated grids."""
import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/ffa-2026-10-23'
PORT=38768
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
        source=(ROOT/'public/client.js').read_text(encoding='utf-8-sig')+'\nwindow.__creative={arena,renderer,get settings(){return settings}};'
        page.route('**/client.js*',lambda route:route.fulfill(content_type='text/javascript',body=source))
        page.route('**/fallback.svg',lambda route:route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#884422"/></svg>'))
        page.goto(BASE,wait_until='domcontentloaded');page.wait_for_function('Boolean(window.__creative)')
        page.locator('#lobby-settings-btn').click();page.locator('#settings-tabs [data-tab="theme"]').click()
        page.locator('#settings-nav').get_by_role('button',name='Sectors',exact=True).click()
        def set_range(label,value):
            page.get_by_label(label,exact=True).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}))}',str(value))
        set_range('Sector size',200);assert page.evaluate('window.__creative.settings.sectorScale')==200
        set_range('Coordinate size',56);assert page.evaluate('window.__creative.settings.sectorLabelSize')==56
        page.get_by_label('Rainbow sector grid',exact=True).check();set_range('Rainbow flow speed',1.5)
        page.get_by_label('Rainbow sector grid',exact=True).focus()
        a=page.locator('#settings-preview canvas').evaluate('c=>c.toDataURL()');page.wait_for_timeout(650)
        b=page.locator('#settings-preview canvas').evaluate('c=>c.toDataURL()');assert a!=b,'settings preview must keep animating'
        page.screenshot(path=str(OUT/'settings-creative-sectors.png'))
        set_range('Sector size',100);set_range('Coordinate size',14)
        page.locator('#settings-nav').get_by_role('button',name='Border',exact=True).click()
        page.get_by_label('Edge style',exact=True).select_option('prism')
        def grid_pixel():
            return page.evaluate('''()=>{const {renderer:r,settings:s}=window.__creative;r.cam={x:6000,y:6000};r.zoom=.04;r.draw({mode:'ffa',worldSize:12000,players:[],food:[],viruses:[]},null,{...s,zoom:.04},false,0,true);const x=Math.round(r.screenW/2+(2400-r.cam.x)*r.zoom),y=Math.round(r.screenH/2);return [...r.ctx.getImageData(x,y,1,1).data]}''')
        a=grid_pixel();page.wait_for_timeout(700);b=grid_pixel();assert a!=b,(a,b)
        report['animatedPreviewAndGame']={'before':a,'after':b}
        page.locator('#settings-nav').get_by_role('button',name='Background',exact=True).click()
        url=page.locator('[data-setting="backgroundUrl"] input');url.fill(BASE+'/fallback.svg');url.press('Tab')
        page.get_by_role('button',name='OPEN BACKGROUND STUDIO',exact=True).click()
        editor=page.get_by_role('dialog',name='Background Studio',exact=True)
        assert editor.is_visible()
        def change(label,value):
            editor.get_by_label(label,exact=True).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("change",{bubbles:true}))}',str(value))
        canvas=editor.get_by_label('Background drawing canvas',exact=True)
        canvas.focus();page.keyboard.press('Tab');assert editor.get_by_role('button',name='Back',exact=True).evaluate('e=>e===document.activeElement')
        page.keyboard.press('Shift+Tab');assert canvas.evaluate('e=>e===document.activeElement')
        box=canvas.bounding_box();assert abs(box['width']-box['height'])<2,box
        def point(x,y):
            b=canvas.bounding_box();return {'x':b['x']+x*b['width'],'y':b['y']+y*b['height']}
        def drag(x1,y1,x2,y2):
            a=point(x1,y1);b=point(x2,y2);page.mouse.move(a['x'],a['y']);page.mouse.down();page.mouse.move(b['x'],b['y'],steps=15);page.mouse.up()
        def click(x,y):
            a=point(x,y);page.mouse.click(a['x'],a['y'])
        def pixel(x,y):
            return canvas.evaluate('(c,p)=>[...c.getContext("2d").getImageData(p[0]*1024,p[1]*1024,1,1).data]',[x,y])
        change('Canvas color','#102030');change('Ink color','#73e5df')
        drag(.08,.08,.3,.3)
        editor.get_by_role('button',name='□ Rectangle',exact=True).click();change('Ink color','#ff0000');drag(.1,.6,.4,.85)
        assert pixel(.22,.7)[:3]==[255,0,0]
        editor.get_by_role('button',name='◌ Eraser',exact=True).click();change('Brush / outline size',40);drag(.18,.7,.32,.7)
        assert pixel(.22,.7)[:3]==[16,32,48]
        editor.get_by_role('button',name='Undo',exact=True).click();assert pixel(.22,.7)[:3]==[255,0,0]
        editor.get_by_role('button',name='Redo',exact=True).click();assert pixel(.22,.7)[:3]==[16,32,48]
        editor.get_by_role('button',name='Undo',exact=True).click()
        change('Brush / outline size',8);change('Ink color','#00ff00')
        editor.get_by_role('button',name='○ Circle',exact=True).click();drag(.6,.1,.82,.32)
        for label,color_value,coords in [('△ Triangle','#a78bfa',(.4,.08,.54,.25)),('☆ Star','#ffe66d',(.1,.35,.3,.55)),('╱ Line','#ffffff',(.45,.75,.6,.9)),('↗ Arrow','#ff73c2',(.65,.85,.85,.65))]:
            editor.get_by_role('button',name=label,exact=True).click();change('Ink color',color_value);drag(*coords)
        editor.get_by_role('button',name='Sticker 🪐',exact=True).click();click(.77,.5)
        editor.get_by_label('Your text',exact=True).fill('Vintage Cairo')
        editor.get_by_role('button',name='T Text',exact=True).click();change('Ink color','#ffffff');click(.5,.45)
        editor.get_by_role('button',name='↖ Select',exact=True).click();drag(.5,.45,.56,.47);change('Rotation',-15)
        count=editor.locator('.studio-status').inner_text()
        editor.get_by_role('button',name='Clear canvas',exact=True).click();assert '0 /' in editor.locator('.studio-status').inner_text()
        editor.get_by_role('button',name='Undo',exact=True).click();assert editor.locator('.studio-status').inner_text()==count
        with page.expect_download() as info:editor.get_by_role('button',name='Download PNG',exact=True).click()
        download=info.value;download.save_as(str(OUT/'background-studio-export.png'));assert (OUT/'background-studio-export.png').stat().st_size>10000
        page.screenshot(path=str(OUT/'background-studio-desktop.png'))
        editor.get_by_role('button',name='Save & use',exact=True).click()
        assert not editor.count();assert page.get_by_label('Use my drawing',exact=True).is_checked()
        expected=page.evaluate('window.__creative.settings.backgroundDesign');assert len(expected['elements'])==9,len(expected['elements'])
        assert expected['elements'][-1]['rotation']==-15
        assert page.evaluate('window.__creative.settings.backgroundUrl')==BASE+'/fallback.svg'
        page.reload();page.wait_for_function('Boolean(window.__creative)')
        assert page.evaluate('window.__creative.settings.backgroundDesign')==expected
        assert page.evaluate('window.__creative.settings.useDrawnBackground')
        def background_pixel():
            return page.evaluate('''()=>{const {renderer:r,settings:s}=window.__creative;r.cam={x:6000,y:6000};r.zoom=.04;r.draw({mode:'ffa',worldSize:12000,players:[],food:[],viruses:[]},null,{...s,zoom:.04,showSectors:false,showBorders:false},false,0,true);const x=Math.round(r.screenW/2+(11400-r.cam.x)*r.zoom),y=Math.round(r.screenH/2+(800-r.cam.y)*r.zoom);return [...r.ctx.getImageData(x,y,1,1).data]}''')
        drawing_pixel=background_pixel();assert drawing_pixel[:3]==[16,32,48],drawing_pixel
        page.locator('#lobby-settings-btn').click();page.locator('#settings-tabs [data-tab="theme"]').click();page.locator('#settings-nav').get_by_role('button',name='Background',exact=True).click()
        page.get_by_label('Use my drawing',exact=True).uncheck()
        page.wait_for_function('window.__creative.renderer.background?.complete && window.__creative.renderer.background.naturalWidth>0 && window.__creative.renderer.background.src.endsWith("/fallback.svg")')
        fallback_pixel=background_pixel();assert fallback_pixel[:3]!=drawing_pixel[:3],fallback_pixel
        page.get_by_label('Use my drawing',exact=True).check();assert background_pixel()==drawing_pixel
        page.get_by_role('button',name='EDIT DRAWING',exact=True).click();page.keyboard.press('Escape')
        assert not page.get_by_role('dialog',name='Background Studio',exact=True).count();assert page.locator('#settings-overlay').is_visible()
        page.locator('#settings-tabs [data-tab="import"]').click();page.get_by_role('button',name='EXPORT JSON',exact=False).click()
        exported=page.locator('#settings-json').input_value();assert json.loads(exported)['backgroundDesign']==expected
        altered=json.loads(exported);altered['useDrawnBackground']=False
        page.locator('#settings-json').fill(json.dumps(altered));page.get_by_role('button',name='IMPORT JSON',exact=False).click();assert not page.evaluate('window.__creative.settings.useDrawnBackground')
        page.locator('#settings-json').fill(exported);page.get_by_role('button',name='IMPORT JSON',exact=False).click();assert page.evaluate('window.__creative.settings.backgroundDesign')==expected
        assert not errors,errors
        report['desktop']={'drawingTools':True,'eraserUndoRedo':True,'moveRotate':True,'pngExport':True,'persistReload':True,'sourceToggle':True,'jsonRoundTrip':True,'drawingPixel':drawing_pixel,'fallbackPixel':fallback_pixel,'noPageErrors':True}

        mobile=browser.new_page(viewport={'width':390,'height':844});mobile_errors=[];mobile.on('pageerror',lambda e:mobile_errors.append(str(e)))
        mobile.goto(BASE,wait_until='domcontentloaded');mobile.locator('#lobby-settings-btn').click();mobile.locator('#settings-tabs [data-tab="theme"]').click()
        mobile.locator('#settings-nav').get_by_role('button',name='Background',exact=True).click();mobile.get_by_label('Use my drawing',exact=True).click()
        editor=mobile.get_by_role('dialog',name='Background Studio',exact=True);assert editor.is_visible()
        canvas=editor.get_by_label('Background drawing canvas',exact=True);b=canvas.bounding_box();assert b['width']>200 and abs(b['width']-b['height'])<2,b
        mobile.mouse.move(b['x']+30,b['y']+30);mobile.mouse.down();mobile.mouse.move(b['x']+150,b['y']+150,steps=10);mobile.mouse.up()
        mobile.screenshot(path=str(OUT/'background-studio-mobile.png'))
        editor.get_by_role('button',name='Save design',exact=True).click();assert not mobile.get_by_label('Use my drawing',exact=True).is_checked()
        mobile.get_by_label('Use my drawing',exact=True).check();assert not mobile_errors,mobile_errors
        report['mobile']={'editorFits':True,'drawAndSave':True,'enableFromToggle':True,'noPageErrors':True}
        browser.close()
    (OUT/'creative-browser-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
finally:
    server.terminate();server.wait(timeout=10)
