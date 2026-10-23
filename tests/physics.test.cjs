'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const physics=require('../server/physics.cjs');
const core=require('../server/core.cjs');
const near=(a,b,epsilon=1e-5)=>Math.abs(a-b)<epsilon;
const fixture=(mass=2000,targetX=4000)=>({target:{x:targetX,y:2000},cells:[{x:2000,y:2000,mass,color:'#fff',vx:0,vy:0,mergeAt:0}]});

test('browser and server physics are generated from one source',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../public/physics.js'),'utf8');
  const names=[...source.matchAll(/^export\s+(?:const|function)\s+(\w+)/gm)].map(m=>m[1]);
  const expected="'use strict';\n"+source.replace(/^export\s+/gm,'')+'\nmodule.exports={'+names.join(',')+'};\n';
  assert.equal(fs.readFileSync(path.join(__dirname,'../server/physics.cjs'),'utf8'),expected);
});

test('FFA split keeps every gram and sends child towards pointer',()=>{
  const p=fixture(2000);assert.equal(physics.splitCells(p,0,4800,64,'ffa'),1);
  assert.equal(p.cells.length,2);
  assert.ok(near(p.cells.reduce((sum,c)=>sum+c.mass,0),2000));
  assert.ok(p.cells[1].vx>0);
  const x=p.cells[1].x;
  for(let i=1;i<=15;i++)physics.moveCells(p,1/60,i/60,4800,'ffa');
  assert.ok(p.cells[1].x>x+65,'split child should travel substantially, not stop instantly');
});

test('cells do not merge during cooldown but can really merge after cooldown',()=>{
  const p=fixture(2000,2000);p.target={x:2000,y:2000};
  physics.splitCells(p,0,4800,64,'ffa');
  for(let i=1;i<=180;i++)physics.moveCells(p,1/60,i/60,4800,'ffa');
  assert.equal(p.cells.length,2,'merge must wait for cooldown');
  for(let i=181;i<=1800 && p.cells.length>1;i++)physics.moveCells(p,1/60,i/60,4800,'ffa');
  assert.equal(p.cells.length,1,'fragments should fuse once allowed and brought together');
  assert.ok(near(p.cells[0].mass,2000));
});

test('FFA split macros stop at the configured cap of 16 cells and conserve mass',()=>{
  const p=fixture(65536,4000);
  for(let n=0;n<6;n++)physics.splitCells(p,n*.02,4800,64,'ffa');
  assert.equal(p.cells.length,16);
  assert.ok(near(p.cells.reduce((sum,c)=>sum+c.mass,0),65536));
  assert.equal(physics.splitCells(p,.13,4800,64,'ffa'),0);
});

test('eating only works with mass advantage and sufficiently deep overlap',()=>{
  const a=fixture(2000,2000),b=fixture(800,2000);
  a.cells[0].x=2000;b.cells[0].x=2500;
  assert.equal(physics.eatCells([a,b],'ffa'),0);
  b.cells[0].x=2030;
  assert.equal(physics.eatCells([a,b],'ffa'),1);
  assert.ok(near(a.cells[0].mass,2800));assert.equal(b.cells.length,0);
});

test('bots choose only nearby, edible split targets and avoid nearby threats',()=>{
  const bot={npc:true,cells:[{x:2000,y:2000,mass:2000}]};
  const prey={npc:false,cells:[{x:2300,y:2000,mass:500}]};
  assert.equal(physics.findSplitHunt(bot,[bot,prey],0,4800,64,'ffa').prey,prey);
  assert.equal(physics.findSplitHunt(bot,[bot,{npc:false,cells:[{x:2600,y:2000,mass:800}]}],0,4800,64,'ffa'),null,'target must remain edible after splitting');
  assert.equal(physics.findSplitHunt(bot,[bot,{npc:false,cells:[{x:2700,y:2000,mass:500}]}],0,4800,64,'ffa'),null,'target must be within attack range');
  assert.equal(physics.findSplitHunt(bot,[bot,{npc:false,spawnShieldUntil:1,cells:[{x:2300,y:2000,mass:500}]}],0,4800,64,'ffa'),null,'spawn-protected targets are ignored');
  const danger={npc:false,cells:[{x:2100,y:2000,mass:1300}]};
  assert.equal(physics.findSplitHunt(bot,[bot,prey,danger],0,4800,64,'ffa'),null,'bots do not split into a nearby threat');
});

test('server bot splits toward a nearby prey cell it can eat',()=>{
  const room=core.createRoom('ffa');
  room.viruses=[];room.food=[];
  const bot=[...room.players.values()].find(p=>p.npc);
  const prey=core.join(room,'Prey','');
  bot.cells[0].x=2000;bot.cells[0].y=2000;bot.cells[0].mass=2000;
  for(const other of room.players.values()){
    if(other.npc&&other!==bot){other.cells[0].x=4300;other.cells[0].y=4300;other.cells[0].mass=500;}
  }
  prey.cells[0].x=2300;prey.cells[0].y=2000;prey.cells[0].mass=500;
  prey.target={x:2300,y:2000};
  core.step(room,.01);
  assert.equal(bot.cells.length,2);
  assert.ok(bot.target.x>bot.cells[0].x,'bot aims toward its prey while attacking');
});

test('FFA movement is approximately consistent at 30 FPS and 60 FPS',()=>{
  const a=fixture(1200,4400),b=fixture(1200,4400);
  for(let i=1;i<=120;i++)physics.moveCells(a,1/60,i/60,4800,'ffa');
  for(let i=1;i<=60;i++)physics.moveCells(b,1/30,i/30,4800,'ffa');
  assert.ok(Math.abs(a.cells[0].x-b.cells[0].x)<2);
});

test('FFA game server still spawns 10 bots and maintains room isolation',()=>{
  const a=core.createRoom('ffa'),b=core.createRoom('dual');
  assert.equal([...a.players.values()].filter(p=>p.npc).length,10);
  assert.equal([...b.players.values()].filter(p=>p.npc).length,10);
  const p=core.join(a,'tester','X');core.point(a,p,p.cells[0].x+500,p.cells[0].y);
  core.split(a,p);core.step(a,.05);
  assert.equal(p.cells.length,2);
  assert.ok(!b.players.has(p.id));
});
test('split-launch travel stays close across 20, 30 and 60 FPS',()=>{
  const profiles=[];
  for(const fps of [20,30,60]){
    const p=fixture(2000,4000);physics.splitCells(p,0,4800,64,'ffa');
    for(let i=1;i<=fps;i++)physics.moveCells(p,1/fps,i/fps,4800,'ffa');
    profiles.push(p.cells[1].x);
  }
  assert.ok(Math.max(...profiles)-Math.min(...profiles)<15,`large FPS discrepancy: ${profiles}`);
});







