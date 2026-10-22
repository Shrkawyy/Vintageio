'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const physics=require('../server/physics.cjs'),virus=require('../server/virus.cjs'),core=require('../server/core.cjs');
const mass=p=>p.cells.reduce((s,c)=>s+c.mass,0);
test('Mega uses FFA merge timing, including a fresh deadline after a second split',()=>{
  const p={target:{x:2400,y:2400},cells:[{x:2400,y:2400,mass:16000}]};
  physics.splitCells(p,0,4800,64,'mega');
  for(const c of p.cells){c.x=2400;c.y=2400;}
  assert.equal(physics.mergeCells(p,14.999,4800,'mega'),0);
  physics.splitCells(p,14,4800,64,'mega');
  assert.ok(p.cells.every(c=>c.mergeAt===29));
  assert.equal(physics.mergeCells(p,28.999,4800,'mega'),0);
  for(const c of p.cells){c.x=2400;c.y=2400;}
  physics.mergeCells(p,29,4800,'mega');assert.equal(p.cells.length,1);assert.equal(mass(p),16000);
});
test('Mega uses FFA feeding while Dual retains its separate feed style',()=>{
  const profiles=['ffa','dual','mega'].map(mode=>physics.physicsFor(mode));
  assert.equal(new Set(profiles.map(p=>p.feedCost)).size,2);
  assert.equal(new Set(profiles.map(p=>[p.feedCost,p.macroFeedInterval].join())).size,2);
  for(const mode of ['ffa','dual','mega']){
    const p={id:'p',target:{x:4500,y:2400},cells:[{x:2400,y:2400,mass:1000}]},food=[],r=physics.physicsFor(mode);
    physics.ejectMass(p,food,1,4800,mode);
    assert.equal(mass(p),1000-r.feedCost);assert.equal(food[0].mass,r.feedMass);
    physics.absorbFood([p],food,mode,1.01);assert.equal(food.length,1,'source cannot instantly refund itself');
  }
});
test('Mega and FFA feed a sibling from the source edge without teleporting beyond that sibling',()=>{
  for(const mode of ['ffa','mega']){
    const source={x:2000,y:2400,mass:1000},receiver={x:2230,y:2400,mass:6000};
    const p={id:'p',target:{x:4500,y:2400},cells:[source,receiver]},food=[];
    physics.ejectMass(p,food,1,4800,mode);const pellet=food.find(f=>f.sourceId===source.feedSourceId);
    assert.ok(pellet.x<receiver.x);const initial=receiver.mass;
    physics.absorbFood([p],food,mode,1.01);assert.ok(receiver.mass>initial,'a sibling can receive fresh feed');
  }
});
test('Mega virus uses the FFA burst and merge deadline locally and on the server',()=>{
  for(const hz of [20,60]){
    const p={cells:[{x:2400,y:2400,mass:30000}]},viruses=[virus.makeVirus(2400,2400)];
    virus.stepViruses({players:[p],viruses,food:[],width:4800,maxCells:64,time:2,dt:1/hz,physics:physics.MEGA_PHYSICS,mergeDelay:m=>physics.mergeDelayFor(m,'mega')});
    assert.equal(p.cells.length,64);assert.ok(p.cells.every(c=>c.mass===30100/64));assert.ok(Math.abs(mass(p)-30100)<1e-6);
    assert.ok(p.cells.every(c=>c.mergeAt===17));
    for(const c of p.cells){c.x=2400;c.y=2400;}
    assert.equal(physics.mergeCells(p,16.99,4800,'mega'),0);
  }
  const room=core.createRoom('mega'),p=core.join(room,'Virus','');room.players=new Map([[p.id,p]]);room.food=[];
  Object.assign(p.cells[0],{x:2400,y:2400,mass:30000});p.target={x:2400,y:2400};room.viruses=[virus.makeVirus(2400,2400)];
  core.step(room,.05);assert.ok(p.cells.every(c=>c.mergeAt===15.05));
});
test('fast feed hits the first virus on its flight path even with a large update',()=>{
  const first=virus.makeVirus(1100,1000),second=virus.makeVirus(1200,1000);
  const world={players:[],viruses:[second,first],food:[{x:1000,y:1000,mass:24,ejected:true,vx:10000,vy:0,drag:2}],width:4800,maxCells:64,time:1,dt:.05};
  virus.stepViruses(world);assert.equal(world.food.length,0);assert.equal(first.feedCount,1);assert.equal(second.feedCount,0);
});
test('Mega feed has the FFA travel and cadence at 20 and 60 Hz',()=>{
 const results=[];
 for(const hz of [20,60]){
  const p={id:'feed',target:{x:4500,y:2400},cells:[{x:2400,y:2400,mass:5000}]},food=[];
  physics.ejectMass(p,food,0,4800,'mega');const start=food[0].x;
  for(let i=1;i<=hz;i++)virus.stepViruses({players:[],food,viruses:[],width:4800,maxCells:64,time:i/hz,dt:1/hz});
  const travel=food[0].x-start;assert.ok(travel>315&&travel<325);results.push(travel);
 }
 assert.ok(Math.abs(results[0]-results[1])<1e-6);
 assert.equal(physics.feedIntervalFor('mega',true),.08);
 assert.equal(physics.feedIntervalFor('mega',false),.14);
});
test('64-way coincident split remains finite and bounded when sibling collision starts',()=>{
  const p={target:{x:4000,y:2400},cells:[{x:2400,y:2400,mass:64000}]};
  for(let i=0;i<6;i++)physics.splitCells(p,0,4800,64,'mega');
  for(let i=1;i<=60;i++)physics.moveCells(p,1/60,i/60,4800,'mega');
  assert.equal(p.cells.length,64);assert.equal(mass(p),64000);
  assert.ok(p.cells.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.y)&&Math.abs(c.x-2400)<1500&&Math.abs(c.y-2400)<1500));
});







