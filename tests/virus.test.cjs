'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../server/core.cjs');
const {makeVirus,stepViruses,VIRUS_FEEDS_TO_SHOOT,VIRUS_MAX_COUNT}=require('../server/virus.cjs');

test('feeding a virus seven ejected pellets launches a new moving virus',()=>{
  const virus=makeVirus(800,900);const world={viruses:[virus],food:Array.from({length:VIRUS_FEEDS_TO_SHOOT},()=>({x:800,y:900,mass:22,ejected:true,vx:120,vy:0})),players:[],width:4800,maxCells:64,time:1,dt:0,spawnVirus:()=>makeVirus(3200,3200)};
  stepViruses(world);
  assert.equal(world.food.length,0);
  assert.equal(world.viruses.length,2);
  assert.equal(world.viruses[0].feedCount,0);
  assert.ok(world.viruses[1].vx>300);
});

test('virus collision bursts a large player cell and conserves mass plus viral bonus',()=>{
  const p={cells:[{x:1000,y:1000,mass:1800,color:'#fff',vx:0,vy:0,mergeAt:0}]};
  const world={viruses:[makeVirus(1000,1000)],food:[],players:[p],width:4800,maxCells:64,time:1,dt:0,spawnVirus:()=>makeVirus(3400,3400)};
  stepViruses(world);
  assert.ok(p.cells.length>=6);
  assert.ok(p.cells.every(c=>c.mass>0&&Number.isFinite(c.vx)));
  assert.ok(Math.abs(p.cells.reduce((sum,c)=>sum+c.mass,0)-1900)<.00001);
  assert.equal(world.viruses.length,1);
  assert.equal(world.viruses[0].x,3400);
});

test('small cells are not burst and virus count stays bounded',()=>{
  const p={cells:[{x:500,y:500,mass:90,vx:0,vy:0}]};
  const world={viruses:[makeVirus(500,500)],food:[],players:[p],width:4800,maxCells:64,time:0,dt:0,spawnVirus:()=>makeVirus(4400,4400)};
  stepViruses(world);
  assert.equal(p.cells.length,1);
  assert.equal(world.viruses.length,1);
  world.viruses.push(...Array.from({length:VIRUS_MAX_COUNT-1},(_,i)=>makeVirus(1200+i*20,1200)));
  world.food=Array.from({length:VIRUS_FEEDS_TO_SHOOT},()=>({x:500,y:500,ejected:true,mass:22,vx:100,vy:0}));
  stepViruses(world);
  assert.ok(world.viruses.length<=VIRUS_MAX_COUNT);
});

test('game server rooms each start with 10 bots and independent virus arrays',()=>{
  const f=core.createRoom('ffa'),m=core.createRoom('mega');
  assert.equal(f.viruses.length,28);
  assert.equal(m.viruses.length,28);
  assert.equal([...f.players.values()].filter(p=>p.npc).length,10);
  assert.notStrictEqual(f.viruses,m.viruses);
});
