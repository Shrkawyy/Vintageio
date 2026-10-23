'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
async function game(){
  const base=path.resolve(__dirname,'../public'),encode=f=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,f),'utf8'));
  const source=fs.readFileSync(path.join(base,'game.js'),'utf8').replace(/'\.\/virus-rules\.js\?[^']*'/,JSON.stringify(encode('virus-rules.js'))).replace(/'\.\/physics\.js\?[^']*'/,JSON.stringify(encode('physics.js')));
  return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
}
const validDesign=()=>({version:1,baseColor:'#112233',elements:[{type:'stroke',color:'#ff0000',width:12,opacity:.8,points:[[20,20],[400,400]]},{type:'shape',shape:'rect',x:100,y:200,w:400,h:200,fill:true,color:'#00ff00',opacity:1},{type:'sticker',text:'★',x:600,y:600,size:120,color:'#ffff00',opacity:1}]});
test('editable artwork survives settings normalization and JSON export/import',async()=>{
  const g=await game(),s=g.normalizeVisualSettings({...g.DEFAULT_SETTINGS,backgroundDesign:validDesign(),useDrawnBackground:true,backgroundUrl:'https://example.com/keep.png'});
  assert.equal(s.useDrawnBackground,true);assert.equal(s.backgroundDesign.elements.length,3);
  const imported=g.normalizeVisualSettings(JSON.parse(JSON.stringify(s)));assert.deepEqual(imported,s);
  const off=g.normalizeVisualSettings({...s,useDrawnBackground:false});assert.deepEqual(off.backgroundDesign,s.backgroundDesign);assert.equal(off.backgroundUrl,s.backgroundUrl);
});
test('invalid and oversized imported artwork cannot introduce executable objects or unbounded paths',async()=>{
  const g=await game(),input=validDesign();input.baseColor='url(javascript:alert(1))';input.html='<script>alert(1)</script>';
  input.elements.push({type:'html',html:'<img onerror="alert(1)">'},{type:'shape',shape:'unknown'},{type:'text',text:'A'.repeat(500),x:Infinity,y:NaN,size:9999,color:'red',rotation:99999});
  const normalized=g.normalizeBackgroundDesign(input);assert.equal(normalized.baseColor,'#061420');assert.equal(normalized.elements.length,4);assert.equal('html' in normalized,false);
  const text=normalized.elements.at(-1);assert.equal(text.text.length,80);assert.equal(text.size,360);assert.equal(text.rotation,180);assert.equal(text.x,512);assert.equal(text.color,'#ffffff');
  const huge={version:1,elements:Array.from({length:300},()=>({type:'stroke',points:Array.from({length:2000},()=>[12,45])}))};
  const safe=g.normalizeBackgroundDesign(huge);assert.ok(safe.elements.length<=g.BACKGROUND_MAX_ELEMENTS);assert.equal(safe.elements.reduce((sum,e)=>sum+e.points.length,0),g.BACKGROUND_MAX_POINTS);
  assert.equal(g.normalizeVisualSettings({...g.DEFAULT_SETTINGS,useDrawnBackground:true,backgroundDesign:{version:99,elements:[]}}).useDrawnBackground,false);
});
test('drawing source takes priority over both image URL and world logo, then restores them when disabled',async()=>{
  const g=await game(),previous={Image:global.Image,innerWidth:global.innerWidth,innerHeight:global.innerHeight,devicePixelRatio:global.devicePixelRatio};
  try{
    const loaded=[],calls=[];Object.assign(global,{innerWidth:1000,innerHeight:700,devicePixelRatio:1,Image:class{complete=true;naturalWidth=100;naturalHeight=100;set src(v){this.url=v;loaded.push(v);}}});
    const ctx=new Proxy({},{get:(o,k)=>o[k]||((...args)=>calls.push({method:k,args,color:o.fillStyle})),set:(o,k,v)=>(o[k]=v,true)}),canvas={getContext:()=>ctx,style:{}};
    const renderer=new g.ArenaRenderer(canvas,canvas),design=g.normalizeBackgroundDesign(validDesign());
    const s={...g.DEFAULT_SETTINGS,useDrawnBackground:true,backgroundDesign:design,backgroundUrl:'https://example.com/image.png',worldLogoUrl:'https://example.com/logo.png',showSectors:false,showBorders:false};
    renderer.draw(null,null,s,false);assert.equal(loaded.length,0);assert.ok(calls.some(c=>c.method==='fillRect'&&c.color==='#112233'));assert.ok(calls.some(c=>c.method==='fillText'&&c.args[0]==='★'));
    calls.length=0;renderer.draw(null,null,{...s,useDrawnBackground:false},false);assert.deepEqual(loaded,[s.backgroundUrl,s.worldLogoUrl]);assert.ok(calls.some(c=>c.method==='drawImage'&&c.args[0].url===s.backgroundUrl));
  }finally{for(const [k,v]of Object.entries(previous)){if(v===undefined)delete global[k];else global[k]=v;}}
});
test('sector scaling changes square spacing while preserving the original server sight area',async()=>{
  const g=await game(),physics=require('../server/physics.cjs'),state={worldSize:12000,players:[{id:'p',cells:[{x:5000,y:5000,mass:1000}]}],food:[],viruses:[]};
  const before=physics.limitVisibility(state,['p']).vision;
  for(const [scale,expected]of [[50,1200],[100,2400],[200,4800]]){
    const points=[],ctx=new Proxy({},{get:(o,k)=>o[k]||((...args)=>{if(k==='lineTo')points.push(args);}),set:(o,k,v)=>(o[k]=v,true)});
    g.drawArenaGuides(ctx,12000,.1,{...g.DEFAULT_SETTINGS,sectorScale:scale,showBorders:false});assert.equal(points[0][0],expected);
    assert.ok(points.every(p=>p.every(n=>n>=0&&n<=12000)));assert.deepEqual(physics.limitVisibility(state,['p']).vision,before);
  }
});
test('rainbow sector grid and Prism border advance with time and share the speed control',async()=>{
  const g=await game(),angles=[];
  const ctx=new Proxy({createConicGradient(angle){angles.push(angle);return{addColorStop(){}};}},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  g.drawArenaGuides(ctx,12000,1,{...g.DEFAULT_SETTINGS,sectorRainbow:true,borderStyle:'prism',prismSpeed:2},1);
  const first=[...angles];angles.length=0;g.drawArenaGuides(ctx,12000,1,{...g.DEFAULT_SETTINGS,sectorRainbow:true,borderStyle:'prism',prismSpeed:2},2);
  assert.equal(first.length,2);assert.ok(angles.every((angle,i)=>angle>first[i]));assert.equal(angles[0],angles[1]);
});
