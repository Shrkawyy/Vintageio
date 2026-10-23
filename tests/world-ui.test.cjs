'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const core=require('../server/core.cjs'),virus=require('../server/virus.cjs');
async function game(){const root=path.resolve(__dirname,'../public'),encode=file=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(root,file),'utf8'));const s=fs.readFileSync(path.join(root,'game.js'),'utf8').replace("'./physics.js?v=11-world-ui'",JSON.stringify(encode('physics.js'))).replace("'./virus-rules.js?v=3-full-burst'",JSON.stringify(encode('virus-rules.js')));return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(s));}
test('Mega is 7200 square locally and online; FFA and Dual stay 4800',async()=>{
 const {LocalArena,DEFAULT_SETTINGS}=await game();
 for(const mode of ['ffa','dual','mega']){const a=new LocalArena();a.reset(mode,'Test','',true,DEFAULT_SETTINGS);const r=core.createRoom(mode),expected=mode==='mega'?7200:4800;assert.equal(a.worldSize,expected);assert.equal(a.snapshot.worldSize,expected);assert.equal(r.worldSize,expected);assert.equal(core.snapshot(r).worldSize,expected);assert.ok(a.food.every(f=>f.x>=0&&f.x<=expected&&f.y>=0&&f.y<=expected));}
});
test('movement, split, feed and respawn work beyond the old Mega boundary in both engines',async()=>{
 const {LocalArena,DEFAULT_SETTINGS}=await game();
 for(const local of [true,false]){
  const a=local?new LocalArena():core.createRoom('mega');let p,q;
  if(local){a.reset('mega','Test','',true,DEFAULT_SETTINGS);[p,q]=a.myIds.map(id=>a.getById(id));a.players=[p,q];}
  else{p=core.join(a,'Test','');q=core.join(a,'Second','');a.players=new Map([[p.id,p],[q.id,q]]);}
  a.food=[];a.viruses=[];a.nextFoodSpawnAt=Infinity;p.cells=[{x:6000,y:6100,mass:5000}];q.cells=[];
  local?a.setTarget(p.id,9000,6100):core.point(a,p,9000,6100);assert.equal(p.target.x,7200);
  local?a.tick(.05,DEFAULT_SETTINGS):core.step(a,.05);assert.ok(p.cells[0].x>6000);
  local?a.split(p.id):core.split(a,p);assert.equal(p.cells.length,2);
  local?a.feed(p.id):core.feed(a,p);assert.ok(a.food.some(f=>f.ejected&&f.x>4800&&f.x<7200));
  assert.equal(local?a.respawn(q.id,6800,6500):core.respawn(a,q,6800,6500),true);assert.ok(q.cells[0].x>4800&&q.cells[0].y>4800);
 }
});
test('a virus splits only the struck piece into progressively smaller fragments and preserves all mass',()=>{
 const untouched={x:5000,y:5000,mass:2000},p={cells:[{x:3000,y:3000,mass:83000},untouched]},before=85000;
 virus.stepViruses({players:[p],food:[],viruses:[virus.makeVirus(3000,3000)],width:7200,maxCells:64,time:1,dt:0});
 const burst=p.cells.filter(c=>c!==untouched).map(c=>c.mass).sort((a,b)=>b-a);
 assert.equal(p.cells.length,10);assert.equal(untouched.mass,2000);
 assert.deepEqual(burst,[41550,20775,10387.5,5193.75,2596.875,1298.4375,649.21875,324.609375,324.609375]);
 assert.ok(Math.abs(p.cells.reduce((s,c)=>s+c.mass,0)-(before+100))<1e-6);
});
test('settings migration removes grid, keeps the background and custom controls, and assigns S to skins',async()=>{
 const g=await game(),old={...g.DEFAULT_SETTINGS,visualStyleVersion:3,controlsVersion:1,showGrid:true,backgroundImage:true,keySettings:'S',keyToggleSkin:'NO KEY',keyStopMove:'U',mouseRight:'feed'};
 const v=g.normalizeVisualSettings(old,true),c=g.normalizeControlSettings(v,true);
 assert.equal(c.showGrid,false);assert.equal(c.backgroundImage,true);assert.equal(c.keySettings,'NO KEY');assert.equal(c.keyToggleSkin,'S');assert.equal(c.keyHUD,'H');assert.equal(c.keyStopMove,'U');assert.equal(c.mouseRight,'feed');assert.equal(c.controlsVersion,2);
});
test('skin visibility suppresses actual image drawing and disabled background fills black',async()=>{
 const g=await game(),old={Image:global.Image,innerWidth:global.innerWidth,innerHeight:global.innerHeight,devicePixelRatio:global.devicePixelRatio};
 try{
  Object.assign(global,{innerWidth:1000,innerHeight:700,devicePixelRatio:1,Image:class{complete=true;naturalWidth=64;naturalHeight=64;set src(v){this.url=v;}}});
  const calls=[],ctx=new Proxy({},{get:(o,k)=>o[k]||(k==='drawImage'?((...args)=>calls.push({image:args[0]})):k==='fillRect'?((...args)=>calls.push({fill:o.fillStyle,args})):(()=>{})),set:(o,k,v)=>(o[k]=v,true)}),canvas=()=>({getContext:()=>ctx,style:{}});
  const renderer=new g.ArenaRenderer(canvas(),canvas()),p={id:'p',name:'Test',cells:[{x:2400,y:2400,mass:5000}],skinUrl:'https://example.com/skin.png'},s={...g.DEFAULT_SETTINGS,backgroundImage:false,bgColor:'#123456',showMinimap:false};
  renderer.draw({worldSize:4800,players:[p]},'p',s);assert.ok(calls.some(c=>c.image?.url===p.skinUrl));assert.ok(calls.some(c=>c.fill==='#000000'&&c.args[2]===1000));
  calls.length=0;renderer.draw({worldSize:4800,players:[p]},'p',{...s,showSkins:false});assert.ok(!calls.some(c=>c.image));
 }finally{for(const [k,v]of Object.entries(old)){if(v===undefined)delete global[k];else global[k]=v;}}
});
