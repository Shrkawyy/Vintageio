'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const virus=require('../server/virus.cjs'),core=require('../server/core.cjs');
async function game(){
  const base=path.resolve(__dirname,'../public'),encode=f=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,f),'utf8'));
  const src=fs.readFileSync(path.join(base,'game.js'),'utf8').replace(/'\.\/virus-rules\.js\?[^']*'/,JSON.stringify(encode('virus-rules.js'))).replace(/'\.\/physics\.js\?[^']*'/,JSON.stringify(encode('physics.js')));
  return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(src));
}
const pellet=mass=>({x:1000,y:1000,mass,ejected:true,vx:120,vy:0});
const world=()=>({viruses:[virus.makeVirus(1000,1000)],food:[],players:[],width:12000,maxCells:16,time:1,dt:0});

test('a fully populated FFA room grows a new virus in both authoritative and local engines',async()=>{
  const g=await game();
  for(const local of [false,true]){
    const a=local?new g.LocalArena():core.createRoom('ffa');if(local)a.reset('ffa','Test','',false,g.DEFAULT_SETTINGS);
    assert.equal(a.viruses.length,32);
    a.players=local?[]:new Map();a.nextFoodSpawnAt=Infinity;
    a.viruses.forEach((v,i)=>{v.x=i?10000:1000;v.y=i?10000:1000;});
    a.food=Array.from({length:7},()=>pellet(25));
    local?a.tick(0):core.step(a,0);
    assert.equal(a.viruses.length,33);assert.equal(a.food.length,0);
    const child=a.viruses.at(-1);assert.ok(child.x>1000&&child.vx>300);assert.equal(a.viruses[0].feedMass,0);
    assert.ok(a.viruses.slice(1,-1).every(v=>v.vx===0&&v.vy===0),'feeding must never move an unrelated remote virus');
  }
});
test('crystal charge uses absorbed mass, not pellet count, and retains excess charge',()=>{
  const w=world();w.food=[pellet(100),pellet(50)];virus.stepViruses(w);
  assert.equal(w.viruses.length,1);assert.equal(w.viruses[0].feedMass,150);assert.equal(w.viruses[0].mass,250);
  w.food=[pellet(30)];virus.stepViruses(w);
  assert.equal(w.viruses.length,2);assert.equal(w.viruses[0].feedMass,5);assert.equal(w.viruses[0].mass,105);
});
test('a capped crystal retains charge and releases only after a free slot opens',()=>{
  const w=world();w.viruses.push(...Array.from({length:virus.VIRUS_MAX_COUNT-1},()=>virus.makeVirus(10000,10000)));
  w.food=Array.from({length:7},()=>pellet(25));virus.stepViruses(w);
  assert.equal(w.viruses.length,virus.VIRUS_MAX_COUNT);assert.equal(w.viruses[0].feedMass,175);
  assert.ok(w.viruses.every(v=>v.vx===0&&v.vy===0));
  w.viruses.pop();virus.stepViruses(w);assert.equal(w.viruses.length,virus.VIRUS_MAX_COUNT);assert.equal(w.viruses[0].feedMass,0);assert.ok(w.viruses.at(-1).vx>0);
});
test('outward-fed viruses launch inward at the arena boundary',()=>{
  const w=world(),v=w.viruses[0];v.x=50;v.angle=Math.PI;v.feedMass=175;virus.stepViruses(w);
  assert.equal(w.viruses.length,2);assert.ok(w.viruses[1].vx>0);assert.ok(w.viruses[1].x>v.x+72);
});
test('eating a charged crystal awards its absorbed mass as well as its base mass',()=>{
  const w=world(),p={cells:[{x:1000,y:1000,mass:1000}]};w.viruses[0].feedMass=150;w.players=[p];virus.stepViruses(w);
  assert.equal(w.viruses.length,0);assert.equal(p.cells.length,16);assert.ok(Math.abs(p.cells.reduce((s,c)=>s+c.mass,0)-1250)<1e-8);
});
function context(){
  const calls=[],state={},stack=[];
  const ctx=new Proxy(state,{get:(o,k)=>o[k]||((...args)=>{
    if(k==='save')stack.push({...o});if(k==='restore'){for(const key of Object.keys(o))delete o[key];Object.assign(o,stack.pop());}
    calls.push({method:k,args,...o});
  }),set:(o,k,v)=>(o[k]=v,true)});
  return {ctx,calls};
}
test('Atlas draws 25 distinct coordinates and eight divisions with stable pixel sizes',async()=>{
  const {drawArenaGuides,DEFAULT_SETTINGS}=await game();
  for(const z of [.04,1,12]){
    const {ctx,calls}=context();drawArenaGuides(ctx,12000,z,{...DEFAULT_SETTINGS,showBorders:false,sectorGridWidth:3,sectorLabelSize:14,sectorLabelPosition:'center'});
    const labels=calls.filter(c=>c.method==='fillText'),stroke=calls.find(c=>c.method==='stroke');
    assert.equal(labels.length,25);assert.equal(new Set(labels.map(c=>c.args[0])).size,25);
    assert.equal(labels[0].args[0],'A1');assert.equal(labels[4].args[0],'E1');assert.equal(labels[24].args[0],'E5');
    assert.equal(calls.filter(c=>c.method==='lineTo').length,8);assert.ok(Math.abs(stroke.lineWidth*z-3)<1e-9);
    assert.ok(Math.abs(parseFloat(labels[0].font.split(' ')[1])*z-14)<1e-8);
  }
});
test('border color, thickness and glow work independently of accent color at every zoom',async()=>{
  const {drawArenaGuides,DEFAULT_SETTINGS}=await game();
  for(const z of [.04,1,12]){
    const {ctx,calls}=context();drawArenaGuides(ctx,12000,z,{...DEFAULT_SETTINGS,showSectors:false,borderColor:'#123456',accentColor:'#ff0000',borderWidth:12,borderGlow:true,borderGlowColor:'#ffaa00',borderGlowDistance:40,borderGlowStrength:75});
    const edges=calls.filter(c=>c.method==='strokeRect');assert.equal(edges.length,2);assert.equal(edges.at(-1).strokeStyle,'#123456');
    assert.equal(edges[0].shadowColor,'#ffaa00');assert.equal(edges[0].shadowBlur,40);assert.equal(edges[0].globalAlpha,.75);
    for(const edge of edges){assert.equal(edge.lineWidth*z,12);assert.equal(edge.args[0],6/z);assert.equal(edge.args[2]+edge.lineWidth,12000);}
  }
});
test('disabled guides draw nothing; imported guide settings are bounded and persist their switches',async()=>{
  const g=await game(),{ctx,calls}=context();g.drawArenaGuides(ctx,12000,1,{...g.DEFAULT_SETTINGS,showBorders:false,showSectors:false});assert.equal(calls.length,0);
  const s=g.normalizeVisualSettings({...g.DEFAULT_SETTINGS,borderWidth:999,sectorGridWidth:-50,sectorLabelSize:999,borderColor:'bad',borderGlowDistance:Infinity,borderStyle:'bad',sectorLabelPosition:'bad',showSectors:false});
  assert.equal(s.borderWidth,24);assert.equal(s.sectorGridWidth,.5);assert.equal(s.sectorLabelSize,96);assert.equal(s.borderColor,g.DEFAULT_SETTINGS.borderColor);assert.equal(s.borderStyle,'solid');assert.equal(s.sectorLabelPosition,'corner');assert.equal(s.showSectors,false);
  const upgraded=g.normalizeVisualSettings({...g.DEFAULT_SETTINGS,visualStyleVersion:4,showGrid:true,showSectors:false},true);assert.equal(upgraded.showSectors,true);assert.equal(upgraded.showGrid,true);
  assert.equal(g.normalizeVisualSettings({...upgraded,showSectors:false},true).showSectors,false,'later reloads preserve the sector switch');
});
