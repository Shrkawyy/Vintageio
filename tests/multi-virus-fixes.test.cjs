'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const core=require('../server/core.cjs'),physics=require('../server/physics.cjs'),virus=require('../server/virus.cjs');
const key='a'.repeat(32),radius=physics.cellRadius;
async function game(){
  const root=path.resolve(__dirname,'../public'),url=file=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(root,file),'utf8'));
  const source=fs.readFileSync(path.join(root,'game.js'),'utf8').replace(/'\.\/virus-rules\.js\?[^']*'/,JSON.stringify(url('virus-rules.js'))).replace(/'\.\/physics\.js\?[^']*'/,JSON.stringify(url('physics.js')));
  return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
}
function closeEnough(a,b){const gap=Math.hypot(a.x-b.x,a.y-b.y)-radius(a.mass)-radius(b.mass);assert.ok(gap>=24-1e-6&&gap<=272,gap);}

test('owned second connection initially spawns beside the first and ownership is limited to two',()=>{
  for(const mode of ['ffa','mega','dual']){
    const room=core.createRoom(mode);room.players.clear();
    const first=core.join(room,'First','TEAM',0,key),second=core.join(room,'Second','TEAM',0,key);
    closeEnough(first.cells[0],second.cells[0]);
    const third=core.join(room,'Third','TEAM',0,key);assert.equal(third.multiKey,undefined);
    assert.ok(!JSON.stringify(core.snapshot(room)).includes(key));
  }
});

test('owned respawn follows the nearest actual fragment instead of a far cursor or random fallback',()=>{
  for(const mode of ['ffa','mega','dual']){
    const room=core.createRoom(mode);room.players.clear();
    const first=core.join(room,'First','',0,key),second=core.join(room,'Second','',0,key);
    first.cells=[{x:600,y:600,mass:5000},{x:2200,y:2200,mass:1000}];second.cells=[];
    assert.equal(core.respawn(room,second,10000,10000),true);closeEnough(first.cells[1],second.cells[0]);
    const blocked={multiKey:'other',cells:[{x:2000,y:2000,mass:2000000}]};
    first.cells=[{x:2000,y:2000,mass:1000}];second.cells=[];room.time+=2;room.players.set('blocked',blocked);
    assert.equal(core.respawn(room,second,2000,2000),false,'a crowded owned spawn never teleports to another zone');
  }
});

test('fresh owned multibox cells can be eaten immediately; other people in the same tag keep protection',async()=>{
  const {LocalArena,DEFAULT_SETTINGS}=await game();
  for(const backend of ['local','server']){
    const arena=backend==='local'?new LocalArena():core.createRoom('ffa');let first,second;
    if(backend==='local'){arena.reset('ffa','Test','TAG',true,DEFAULT_SETTINGS);[first,second]=arena.myIds.map(id=>arena.getById(id));arena.players=[first,second];}
    else{arena.players.clear();first=core.join(arena,'First','TAG',0,key);second=core.join(arena,'Second','TAG',0,key);}
    first.cells=[{x:2400,y:2400,mass:5000}];second.cells=[];
    assert.equal(backend==='local'?arena.respawn(second.id,2600,2400):core.respawn(arena,second,2600,2400),true);
    Object.assign(first.cells[0],{x:second.cells[0].x,y:second.cells[0].y});
    const enemy={tag:'TAG',cells:[{...second.cells[0]}],spawnShieldUntil:1.5};
    assert.equal(physics.eatCells([first,enemy],'ffa',0),0);
    assert.equal(physics.eatCells([first,second],'ffa',0),1);assert.equal(first.cells[0].mass,6000);
  }
  const a={multiKey:key,cells:[{x:1000,y:1000,mass:1000}]},b={multiKey:key,cells:[{x:1000,y:1000,mass:1000}]};
  assert.equal(physics.eatCells([a,b],'ffa',0),0,'equal masses still cannot eat one another');
});

test('ejected feed stores ordinary food colors independently of owner color in every mode',()=>{
  for(const mode of ['ffa','mega','dual']){
    const p={id:'p',color:'#123456',target:{x:4000,y:2000},cells:[{x:2000,y:2000,mass:10000,color:'#654321'}]},food=[];
    for(let i=0;i<10;i++)physics.ejectMass(p,food,i,12000,mode);
    assert.ok(food.every(f=>physics.FEED_COLORS.includes(f.color)));assert.equal(new Set(food.map(f=>f.color)).size,5);
    const before=food.map(f=>f.color);p.color='#ffffff';assert.deepEqual(food.map(f=>f.color),before);
  }
});

test('virus requires swallowing and burst fragments launch continuously from the struck center',()=>{
  const p={cells:[{x:2000,y:2000,mass:6000,color:'#abcdef'}]},v=virus.makeVirus(2000+radius(6000)+5,2000);
  const world={viruses:[v],players:[p],food:[],width:12000,maxCells:16,time:1,dt:0,addRespawn:()=>{}};
  virus.stepViruses(world);assert.equal(p.cells.length,1,'edge proximity does not burst');
  v.x=2000;virus.stepViruses(world);assert.equal(p.cells.length,16);assert.equal(world.viruses.length,0);
  assert.ok(p.cells.every(c=>c.x===2000&&c.y===2000));assert.ok(Math.abs(p.cells.reduce((n,c)=>n+c.mass,0)-6100)<1e-8);
  const before=p.cells.map(c=>({...c}));p.target={x:2000,y:2000};
  physics.moveCells(p,1/120,1+1/120,12000,'ffa');
  assert.ok(p.cells.every((c,i)=>Math.hypot(c.x-before[i].x,c.y-before[i].y)<5),'no instantaneous ring displacement');
});

test('virus at cell cap gives its mass without resetting existing merge timers',()=>{
  const p={cells:Array.from({length:16},(_,i)=>({x:i?5000:2000,y:2000,mass:i?40:1000,mergeAt:7,collideAt:2}))};
  virus.stepViruses({viruses:[virus.makeVirus(2000,2000)],players:[p],food:[],width:12000,maxCells:16,time:3,dt:0,addRespawn:()=>{}});
  assert.equal(p.cells.length,16);assert.equal(p.cells[0].mass,1100);assert.equal(p.cells[0].mergeAt,7);assert.equal(p.cells[0].collideAt,2);
});

test('virus launch interpolates at render rate with stable IDs and clears consumed viruses immediately',async()=>{
  const {VirusAnimator}=await game(),a=new VirusAnimator(),v=virus.makeVirus(2000,2000);
  a.sample([v]);const moved=Object.freeze({...v,x:2040,feedMass:100});
  const frames=Array.from({length:6},()=>a.sample([moved],1/120)[0]);
  assert.ok(frames[0].x>2000&&frames[0].x<2040);
  assert.ok(frames.every((f,i)=>!i||f.x>frames[i-1].x));assert.equal(moved.x,2040);
  assert.ok(frames[0].renderRadius>36&&frames[0].renderRadius<virus.virusRadius(moved));
  assert.deepEqual(a.sample([]),[]);assert.equal(a.viruses.size,0);
  const child={...virus.makeVirus(2200,2000),originX:2000,originY:2000};
  assert.ok(a.sample([child])[0].x<2200);a.reset();assert.equal(a.viruses.size,0);
  const run=hz=>{const a=new VirusAnimator();a.sample([v]);for(let n=0;n<hz/5;n++)a.sample([moved],1/hz);return a.viruses.get('virus:'+v.id).x;};
  assert.ok(Math.abs(run(30)-run(120))<1e-8);
});

test('burst origin metadata survives the network snapshot',()=>{
  const room=core.createRoom('ffa');room.players.clear();const p=core.join(room,'Test','');
  p.cells=[{x:2000,y:2000,mass:6000}];p.target={x:2000,y:2000};room.viruses=[virus.makeVirus(2000,2000)];room.food=[];
  core.step(room,0);const cells=core.snapshot(room).players[0].cells;
  assert.equal(cells.length,16);assert.ok(cells.slice(1).every(c=>c.originX===2000&&c.originY===2000));
});
