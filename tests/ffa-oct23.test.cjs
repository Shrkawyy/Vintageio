'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const rules=require('../server/physics.cjs'),core=require('../server/core.cjs'),virus=require('../server/virus.cjs');
const mass=p=>p.cells.reduce((sum,c)=>sum+c.mass,0);
async function game(){
  const base=path.resolve(__dirname,'../public'),encode=file=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,file),'utf8'));
  const source=fs.readFileSync(path.join(base,'game.js'),'utf8').replace(/'\.\/virus-rules\.js\?[^']*'/,JSON.stringify(encode('virus-rules.js'))).replace(/'\.\/physics\.js\?[^']*'/,JSON.stringify(encode('physics.js')));
  return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
}

test('each FFA multibox connection splits at 22.5K per cell, independently of combined mass and peak score',async()=>{
  const {LocalArena,DEFAULT_SETTINGS}=await game();
  for(const local of [true,false]){
    const a=local?new LocalArena():core.createRoom('ffa');
    if(local)a.reset('ffa','Player','PRIVATE',true,DEFAULT_SETTINGS);
    const players=local?a.myIds.map(id=>a.getById(id)):[core.join(a,'Player','PRIVATE'),core.join(a,'Player','PRIVATE')];
    if(local)a.players=players;else a.players=new Map(players.map(p=>[p.id,p]));
    const step=()=>{a.food=[];a.viruses=[];a.nextFoodSpawnAt=Infinity;local?a.tick(.01,DEFAULT_SETTINGS):core.step(a,.01);};
    for(const [index,p] of players.entries()){p.cells=[{x:1200+index*2400,y:2400,mass:22499}];p.target={...p.cells[0]};p.peakScore=100000;}
    step();assert.deepEqual(players.map(p=>p.cells.length),[1,1],'44.9K total is not a per-cell trigger');
    players[0].cells[0].mass=22500;step();
    assert.deepEqual(players.map(p=>p.cells.length),[2,1]);
    assert.ok(Math.abs(mass(players[0])-22500*Math.exp(-.006*.01))<1e-6);
    players[1].cells[0].mass=22500;step();assert.deepEqual(players.map(p=>p.cells.length),[2,2]);
    players[0].cells=Array.from({length:16},(_,i)=>({x:1200+i*.01,y:2400,mass:22500,mergeAt:Infinity}));
    step();assert.equal(players[0].cells.length,16,'automatic split respects FFA cap');
  }
});

test('FFA crosses the automatic split threshold on a food gain before decay locally and online',async()=>{
  const {LocalArena,DEFAULT_SETTINGS}=await game();
  for(const local of [true,false]){
    const a=local?new LocalArena():core.createRoom('ffa');
    if(local)a.reset('ffa','Gain','',false,DEFAULT_SETTINGS);
    const p=local?a.getById(a.myIds[0]):core.join(a,'Gain','');
    p.cells=[{x:2400,y:2400,mass:22490}];p.target={x:2400,y:2400};
    if(local)a.players=[p];else a.players=new Map([[p.id,p]]);
    a.food=[{x:2400,y:2400,mass:10}];a.viruses=[];a.nextFoodSpawnAt=Infinity;
    local?a.tick(.05,DEFAULT_SETTINGS):core.step(a,.05);
    assert.equal(p.cells.length,2);assert.ok(Math.abs(mass(p)-22500*Math.exp(-.006*.05))<1e-6);
  }
});

test('FFA feed is larger, slower and short ranged at 20, 30 and 60 Hz',()=>{
  const distances=[];
  for(const hz of [20,30,60]){
    const p={id:'source',target:{x:4500,y:2400},cells:[{x:2000,y:2400,mass:5000}]},food=[];
    rules.ejectMass(p,food,0,4800,'ffa');const pellet=food[0],start={x:pellet.x,y:pellet.y};
    assert.equal(mass(p),4970);assert.equal(pellet.mass,25);
    assert.equal(pellet.radius,9.5);assert.ok(pellet.radius>Math.sqrt(14)*1.7*1.4);
    assert.ok(Math.abs(Math.hypot(pellet.vx,pellet.vy)-400)<1e-8);
    for(let i=1;i<=hz*2;i++)virus.stepViruses({players:[],food,viruses:[],width:4800,maxCells:32,time:i/hz,dt:1/hz});
    const d=Math.hypot(pellet.x-start.x,pellet.y-start.y);distances.push(d);
    assert.ok(d>99&&d<=100,'travel is bounded to 100 world units from launch');
    assert.ok(Math.hypot(pellet.vx,pellet.vy)<1);
  }
  assert.ok(Math.max(...distances)-Math.min(...distances)<1e-6);
});

test('FFA feed from both multibox connections uses the same profile and preserves sibling reception',async()=>{
  const {LocalArena,DEFAULT_SETTINGS}=await game();
  for(const local of [true,false]){
    const a=local?new LocalArena():core.createRoom('ffa');if(local)a.reset('ffa','Feed','',true,DEFAULT_SETTINGS);
    const players=local?a.myIds.map(id=>a.getById(id)):[core.join(a,'Feed',''),core.join(a,'Feed','')];
    a.food=[];
    for(const [i,p] of players.entries()){
      p.cells=[{x:1200+i*2400,y:2400,mass:1000}];p.target={x:4500,y:2400};
      assert.equal(local?a.feed(p.id):core.feed(a,p),1);
    }
    assert.deepEqual(a.food.map(f=>[f.mass,f.radius,f.drag]),[[25,9.5,4],[25,9.5,4]]);
    assert.equal(rules.absorbFood(players,a.food,'ffa',0),0,'source grace prevents immediate refund');
    const receiver={id:'receiver',cells:[{x:a.food[0].x,y:a.food[0].y,mass:25}]};
    rules.absorbFood([receiver],a.food,'ffa',0);assert.equal(mass(receiver),50);
  }
});

test('public snapshots reveal opaque team membership without exposing join tags or breaking ally visibility',async()=>{
  const {getVisibleAllies}=await game(),r=core.createRoom('ffa');
  const a=core.join(r,'A','SECRET42'),b=core.join(r,'B','SECRET42'),c=core.join(r,'C','OTHER789');
  const snap=core.snapshot(r),view=id=>snap.players.find(p=>p.id===id);
  assert.ok(!JSON.stringify(snap).includes('SECRET42'));assert.ok(!JSON.stringify(snap).includes('OTHER789'));
  assert.ok(snap.players.every(p=>!Object.hasOwn(p,'tag')));
  assert.equal(view(a.id).teamId,view(b.id).teamId);assert.notEqual(view(a.id).teamId,view(c.id).teamId);
  assert.equal(core.snapshot(r).players.find(p=>p.id===a.id).teamId,view(a.id).teamId);
  assert.deepEqual(getVisibleAllies(snap,a.id).map(p=>p.id),[a.id,b.id]);
  assert.deepEqual(core.chatRecipients(r,a,'tag').map(p=>p.id),[a.id,b.id]);
  const other=core.createRoom('ffa'),same=core.join(other,'A','SECRET42');
  assert.notEqual(core.snapshot(other).players.find(p=>p.id===same.id).teamId,view(a.id).teamId,'ids are not reusable across rooms');
  r.players.delete(a.id);r.players.delete(b.id);core.snapshot(r);assert.ok(!r.teamIds.has('SECRET42'));
});
