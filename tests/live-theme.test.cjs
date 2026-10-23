'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
async function game(){const base=path.resolve(__dirname,'../public'),encode=f=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,f),'utf8'));const source=fs.readFileSync(path.join(base,'game.js'),'utf8').replace(/'\.\/virus-rules\.js\?[^']*'/,JSON.stringify(encode('virus-rules.js'))).replace(/'\.\/physics\.js\?[^']*'/,JSON.stringify(encode('physics.js')));return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));}
const design=()=>({version:1,baseColor:'#000000',elements:[{type:'shape',shape:'diamond',x:100,y:200,w:170,h:170,width:5,fill:true,color:'#ff0000',opacity:1,rotation:30}]});
function canvas(){const calls=[],ctx=new Proxy({},{get:(o,k)=>o[k]||((...args)=>calls.push({method:k,args,fillStyle:o.fillStyle,composite:o.globalCompositeOperation})),set:(o,k,v)=>(o[k]=v,true)});return{canvas:{getContext:()=>ctx,style:{}},ctx,calls};}
test('scene objects survive JSON normalization as a transparent layer without replacing background preferences',async()=>{
 const g=await game(),s=g.normalizeVisualSettings({...g.DEFAULT_SETTINGS,themeArtwork:design(),backgroundUrl:'https://example.com/bg.png',useDrawnBackground:false});
 assert.equal(s.themeArtwork.transparent,true);assert.equal(s.themeArtwork.elements[0].rotation,30);
 const imported=g.normalizeVisualSettings(JSON.parse(JSON.stringify(s)));assert.deepEqual(imported.themeArtwork,s.themeArtwork);assert.equal(imported.backgroundUrl,s.backgroundUrl);
 const off=g.normalizeVisualSettings({...s,showThemeArtwork:false});assert.deepEqual(off.themeArtwork,s.themeArtwork);assert.equal(off.showThemeArtwork,false);
});
test('transparent scene artwork draws its elements without painting an opaque paper rectangle',async()=>{
 const g=await game(),{ctx,calls}=canvas();g.drawBackgroundDesign(ctx,g.normalizeBackgroundDesign({...design(),transparent:true}),1024);
 assert.ok(calls.some(c=>c.method==='fill'&&c.fillStyle==='#ff0000'));assert.ok(!calls.some(c=>c.method==='fillRect'));
 assert.ok(calls.some(c=>c.method==='rotate'&&Math.abs(c.args[0]-Math.PI/6)<1e-8));
});
test('the shared game renderer fits an independent preview viewport and renders a switchable scene layer',async()=>{
 const g=await game(),main=canvas(),radar=canvas(),r=new g.ArenaRenderer(main.canvas,radar.canvas,{viewport:()=>({width:420,height:300,ratio:2})});
 const settings={...g.DEFAULT_SETTINGS,backgroundImage:false,showGrid:false,showSectors:false,showBorders:false,themeArtwork:g.normalizeBackgroundDesign({...design(),transparent:true})};
 r.draw(null,null,settings,false);assert.equal(main.canvas.width,840);assert.equal(main.canvas.height,600);assert.equal(r.screenW,420);assert.equal(r.screenH,300);
 assert.ok(main.calls.some(c=>c.method==='fill'&&c.fillStyle==='#ff0000'));main.calls.length=0;r.draw(null,null,{...settings,showThemeArtwork:false},false);assert.ok(!main.calls.some(c=>c.method==='fill'));
});
test('diamond, hexagon and cross shapes remain editable through normalization and draw closed paths',async()=>{
 const g=await game();for(const shape of ['diamond','hexagon','cross']){const d=design();d.elements[0].shape=shape;const saved=g.normalizeBackgroundDesign(d),{ctx,calls}=canvas();assert.equal(saved.elements[0].shape,shape);g.drawBackgroundDesign(ctx,saved);assert.ok(calls.some(c=>c.method==='closePath'));assert.ok(calls.filter(c=>c.method==='lineTo').length>=3);}
});
