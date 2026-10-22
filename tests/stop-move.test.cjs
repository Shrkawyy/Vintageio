'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const physics=require('../server/physics.cjs'),core=require('../server/core.cjs');
async function game(){
 const base=path.resolve(__dirname,'../public'),encode=file=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,file),'utf8'));
 const src=fs.readFileSync(path.join(base,'game.js'),'utf8').replace("'./physics.js?v=11-world-ui'",JSON.stringify(encode('physics.js'))).replace("'./virus-rules.js?v=3-full-burst'",JSON.stringify(encode('virus-rules.js')));
 return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(src));
}
test('Stopmove persists through cursor updates and resumes only when switched off',()=>{
 const p={movementStopped:true,target:{x:4500,y:2400},cells:[{x:1400,y:2400,mass:5000,mergeAt:999},{x:3000,y:2400,mass:5000,mergeAt:999}]};
 for(let i=0;i<120;i++){p.target={x:i%2?0:4500,y:i%2?0:4500};physics.moveCells(p,1/60,i/60,4800,'mega');}
 assert.deepEqual(p.cells.map(c=>[c.x,c.y]),[[1400,2400],[3000,2400]]);
 p.movementStopped=false;p.target={x:4500,y:2400};physics.moveCells(p,.05,2.05,4800,'mega');assert.ok(p.cells[0].x>1400&&p.cells[1].x>3000);
});
test('Stopmove preserves split momentum and merge deadlines instead of cancelling physics',()=>{
 const p={movementStopped:true,target:{x:4500,y:2400},cells:[{x:2400,y:2400,mass:30000}]};
 physics.splitCells(p,0,4800,64,'mega');const child=p.cells[1],deadline=child.mergeAt;
 physics.moveCells(p,.05,.05,4800,'mega');assert.ok(child.x>2400&&child.vx>0);assert.equal(child.mergeAt,deadline);
});
test('Stopmove is per connection and behaves the same in local and authoritative arenas',async()=>{
 const {LocalArena,DEFAULT_SETTINGS}=await game();
 for(const backend of ['local','server']){
  const arena=backend==='local'?new LocalArena():core.createRoom('mega');let a,b;
  if(backend==='local'){arena.reset('mega','Test','',true,DEFAULT_SETTINGS);[a,b]=arena.myIds.map(id=>arena.getById(id));arena.players=[a,b];}
  else{a=core.join(arena,'A','');b=core.join(arena,'B','');arena.players=new Map([[a.id,a],[b.id,b]]);}
  a.cells=[{x:1400,y:1800,mass:5000}];b.cells=[{x:3000,y:3000,mass:5000}];arena.food=[];arena.viruses=[];arena.nextFoodSpawnAt=Infinity;
  if(backend==='local'){arena.setMovementStopped(a.id,true);arena.setTarget(a.id,4500,1800);arena.setTarget(b.id,4500,3000);}
  else{core.stopMove(arena,a,true);core.point(arena,a,4500,1800);core.point(arena,b,4500,3000);}
  for(let i=0;i<30;i++)backend==='local'?arena.tick(1/30,DEFAULT_SETTINGS):core.step(arena,1/30);
  assert.equal(a.cells[0].x,1400);assert.ok(b.cells[0].x>3050);
  if(backend==='local')arena.setMovementStopped(a.id,false);else core.stopMove(arena,a,false);
  backend==='local'?arena.tick(.05,DEFAULT_SETTINGS):core.step(arena,.05);assert.ok(a.cells[0].x>1400);
 }
});
test('Stopmove snapshots expose its state and malformed toggle messages do not change it',()=>{
 const room=core.createRoom('mega'),p=core.join(room,'Test','');
 assert.equal(core.stopMove(room,p,true),true);assert.equal(core.stopMove(room,p,'false'),false);
 assert.equal(core.snapshot(room).players.find(x=>x.id===p.id).movementStopped,true);
 core.stopMove(room,p,false);assert.equal(core.snapshot(room).players.find(x=>x.id===p.id).movementStopped,false);
});
test('large Mega cells run faster than the FFA baseline at 20/30/60 Hz',()=>{
 for(const mass of [5000,30000,90000])for(const hz of [20,30,60]){
  const run=mode=>{const p={target:{x:4500,y:2400},cells:[{x:2400,y:2400,mass}]};for(let i=0;i<hz;i++)physics.moveCells(p,1/hz,i/hz,4800,mode);return p.cells[0].x-2400;};
  assert.ok(run('mega')>run('ffa')*1.15);
 }
});


