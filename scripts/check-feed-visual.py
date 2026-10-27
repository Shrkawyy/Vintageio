"""Compare both real canvas renderers at identical cell size and camera zoom."""
import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:3008'
mega='--mega' in sys.argv
OUT=ROOT/('artifacts/mega-feed-oct27' if mega else 'artifacts/death-ffa-oct27')
old=(ROOT/('artifacts/pre-mega-feed-oct27/public/game.js' if mega else 'artifacts/pre-death-ffa-oct27/public/game.js')).read_text(encoding='utf-8')
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
    try:
        page=browser.new_page(viewport={'width':1100,'height':590},device_scale_factor=1)
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        page.route('**/game.js?feed-before',lambda route:route.fulfill(content_type='text/javascript',body=old))
        page.goto(BASE+'/health',wait_until='domcontentloaded')
        report=page.evaluate(r'''async(config)=>{
          const before=await import('/game.js?feed-before'),after=await import('/game.js?feed-after');
          document.body.innerHTML='';document.body.style.cssText='margin:0;background:#141b24;color:#fff;font:16px Arial;display:flex';
          const food=Array.from({length:21},(_,i)=>({feedId:i+1,ownerId:'active',ejected:true,mass:36,radius:14.7,color:'#09759d',x:3300+(i%5)*55,y:3220+Math.floor(i/5)*51}));
          const snap={mode:config.mega?'mega':'ffa',worldSize:7000,players:[
            {id:'other',name:'',color:'#fff',cells:[{id:'a',x:2670,y:2800,mass:21900},{id:'b',x:3300,y:2450,mass:21800}]},
            {id:'active',name:'',color:'#09759d',cells:[{id:'c',x:2800,y:3350,mass:6400},{id:'d',x:2700,y:3850,mass:6900}]}],food,viruses:[]};
          const report={};
          for(const [label,module] of [['before',before],['after',after]]){
            const displayedFood=food.map(f=>({...f,radius:config.mega&&label==='before'?Math.sqrt(14)*.85:f.radius}));
            const panel=document.createElement('div');panel.innerHTML='<p style="margin:12px">'+label.toUpperCase()+' / same camera and mass</p>';
            const canvas=document.createElement('canvas'),radar=document.createElement('canvas');panel.append(canvas);document.body.append(panel);
            const renderer=new module.ArenaRenderer(canvas,radar,{viewport:()=>({width:550,height:550,ratio:1}),instantEffects:true});
            renderer.cam={x:2900,y:3100};renderer.zoom=95/module.radius(21900);
            const settings={...module.DEFAULT_SETTINGS,zoom:renderer.zoom,showMinimap:false,showSectors:false,backgroundImage:false,showThemeArtwork:false,showNames:false,showMass:true,showBorders:false,showSkins:false};
            const ctx=canvas.getContext('2d'),arc=ctx.arc.bind(ctx),pelletRadii=[];
            ctx.arc=function(x,y,r,...rest){if(food.some(f=>f.x===x&&f.y===y))pelletRadii.push(r);return arc(x,y,r,...rest)};
            renderer.draw({...snap,food:displayedFood},'active',settings,false,1/60,true,['active','other']);
            report[label]={zoom:renderer.zoom,cellRadiusPx:module.radius(21900)*renderer.zoom,feedRadiusPx:pelletRadii[0]*renderer.zoom,pelletCount:pelletRadii.length};
          }
          return report;
        }''',{'mega':mega})
        page.screenshot(path=str(OUT/'feed-before-after.png'))
        assert not errors,errors
        assert report['before']['pelletCount']==report['after']['pelletCount']==21
        if not mega:
            assert 3.8<report['after']['feedRadiusPx']<3.9
            assert abs(report['before']['feedRadiusPx']/report['after']['feedRadiusPx']-1.65)<1e-9
        else:
            assert 6<=report['after']['feedRadiusPx']<=7
            assert report['after']['feedRadiusPx']/report['before']['feedRadiusPx']>7
        report['pageErrors']=errors
        (OUT/'feed-render-browser.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report))
    finally:browser.close()
