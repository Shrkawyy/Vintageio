'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const p=require('../server/physics.cjs'),core=require('../server/core.cjs'),{oracle}=require('./helpers/dual-tar-oracle.cjs');
const archive=p.DUAL_TAR_REFERENCE;
const k=.245,near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const make=(mass=1000)=>({id:'p',target:{x:16000*k,y:8000*k},cells:[{x:8000*k,y:8000*k,mass,age:0,boost:0}]});

test('the archived movement method matches the FFA/Dual port across six sizes',()=>{
 for(const mode of ['ffa','dual'])for(const mass of [35,100,500,1000,5000,22500]){
  const o=oracle(),a=o.player(mass),b=make(mass);o.server.movePlayer(a.cells[0],a);p.moveCells(b,.04,.04,5880,mode);
  near(b.cells[0].x,a.cells[0].position.x*k);near(b.cells[0].y,a.cells[0].position.y*k);
  near(p.cellSpeed(mass,mode),2.2*Math.pow(Math.sqrt(mass*100),-.439)*40*25*k);
 }
});
test('near-cursor integer-vector quantization matches source and remains finite',()=>{
 for(const [dx,dy] of [[0,0],[.5,.5],[1.2,2.2],[.4,10.3]]){
  const o=oracle(),a=o.player(1000),b=make();a.mouse.x=a.cells[0].position.x+dx;a.mouse.y=a.cells[0].position.y+dy;b.target={x:(8000+dx)*k,y:(8000+dy)*k};
  o.server.movePlayer(a.cells[0],a);p.moveCells(b,.04,.04,5880,'ffa');near(b.cells[0].x,a.cells[0].position.x*k);near(b.cells[0].y,a.cells[0].position.y*k);
 }
});
test('split mass, shared starting centre and radius-dependent launch match the archive',()=>{
 for(const mass of [150,500,1000,5000,20000]){
  const o=oracle(),a=o.player(mass),b=make(mass);o.server.splitCells(a);p.splitCells(b,0,5880,16,archive);assert.equal(b.cells.length,a.cells.length);
  const child=b.cells[1],source=a.cells[1];near(child.mass,source._mass);near(child.x,source.position.x*k);near(child.y,source.position.y*k);near(child.boost,source.boostDistance*k);
  for(let tick=0;tick<25;tick++){o.server.boostCell(source);p.advanceBoost(child,.04,5880,archive);near(child.x,source.position.x*k);near(child.boost,source.boostDistance*k);}
 }
});
test('a stationary split travels equally at 25, 30, 60 and 120 render rates',()=>{
 const ends=[];for(const hz of [25,30,60,120]){const a=make(5000);p.splitCells(a,0,5880,16,'ffa');const child=a.cells[1];for(let i=0;i<hz;i++)p.advanceBoost(child,1/hz,5880,'ffa');ends.push(child.x);}near(Math.max(...ends),Math.min(...ends),1e-6);
});
test('soft unequal-mass sibling separation uses the source 0.3 weighting',()=>{
 const o=oracle(),a=o.player(1000),big=a.cells[0],small=new o.PlayerCell(o.server,a,new o.Vec2(8220,8000),Math.sqrt(40000));a.cells.push(small);o.server.tickCounter=20;
 const m=o.server.checkCellCollision(big,small);assert.equal(o.server.checkRigidCollision(m),true);o.server.resolveRigidCollision(m);
 // The public move helper visits each pair twice, matching two source searches.
 o.server.resolveRigidCollision(o.server.checkCellCollision(small,big));
 const b={...make(),movementStopped:true,cells:[{x:8000*k,y:8000*k,mass:1000,age:800,boost:0},{x:8220*k,y:8000*k,mass:400,age:800,boost:0}]};
 p.moveCells(b,.04,.84,5880,archive);near(b.cells[0].x,big.position.x*k);near(b.cells[1].x,small.position.x*k);
});
test('sibling collision ignores the first thirteen source ticks',()=>{
 const a={...make(),movementStopped:true,cells:[{x:2000,y:2000,mass:1000,age:480,boost:0},{x:2010,y:2000,mass:1000,age:480,boost:0}]};
 p.moveCells(a,.04,.52,5880,archive);near(a.cells[0].x,2000);p.moveCells(a,.04,.56,5880,archive);assert.ok(a.cells[0].x<2000);
});
test('source merge threshold max(30, radius*0.2) governs both pieces',()=>{
 for(const mass of [100,500,1000,10000]){
  const delay=Math.max(30,Math.sqrt(mass*100)*.2);near(p.mergeDelayFor(mass,'dual'),delay);
  const a={cells:[{x:2000,y:2000,mass,age:delay*1000-1},{x:2001,y:2000,mass,age:delay*1000}]};assert.equal(p.mergeCells(a,100,5880,'dual'),0);
  a.cells[0].age++;assert.equal(p.mergeCells(a,100,5880,'dual'),1);near(a.cells[0].mass,mass*2);
 }
});
test('ejection matches source loss, pellet size, edge placement, bias and boost',()=>{
 const old=Math.random;try{Math.random=()=>.5;const o=oracle(.5),a=o.player(1000),b=make(),food=[];
  o.server.ejectMass(a);assert.equal(p.ejectMass(b,food,0,5880,archive),1);const pellet=food[0],source=o.server.food[0];
  near(b.cells[0].mass,a.cells[0]._mass);near(pellet.mass,20.25);near(pellet.x,source.position.x*k);near(pellet.y,source.position.y*k);
  near(pellet.boost,source.boostDistance*k);near(pellet.boostX,source.boostDirection.x);near(pellet.boostY,source.boostDirection.y);
  near(1000-b.cells[0].mass,25);assert.equal(p.feedIntervalFor(archive,true),.04);
 }finally{Math.random=old;}
});
test('source decay removes 0.2 percent per second only above radius 316.227766',()=>{
 const o=oracle();for(const mass of [500,1000,1001,5000]){const a=o.player(mass),b=make(mass);o.server.updateSizeDecay(a.cells[0]);p.decayMass([b],1,'dual');near(b.cells[0].mass,a.cells[0]._mass);}
});
test('virus feed pushes by 220 source units without adding mass or spawning a child',()=>{
 const viruses=[p.makeVirus(2000,2000,0,'ffa')],food=[{x:2000,y:2000,mass:20.25,ejected:true,boost:0,boostX:1,boostY:0}];
 p.stepViruses({viruses,food,players:[],width:5880,maxCells:16,time:0,dt:0,physics:'ffa'});assert.equal(food.length,0);assert.equal(viruses.length,1);assert.equal(viruses[0].mass,400);near(viruses[0].boost,220*k);near(p.virusCharge(viruses[0]),0);
});
test('post-virus pieces agree with the archived Virus.onEaten arithmetic',()=>{
 for(const mass of [1000,5000,20000]){const o=oracle(),a=o.player(mass),virus=new o.Virus(o.server,null,new o.Vec2(8000,8000),200);virus.onEaten(a.cells[0]);
  const b=make(mass);p.popPlayer(b,b.cells[0],0,5880,16,'ffa');assert.equal(b.cells.length,a.cells.length);for(let n=0;n<a.cells.length;n++)near(b.cells[n].mass,a.cells[n]._mass,1e-6);near(b.cells.reduce((s,c)=>s+c.mass,0),mass,1e-6);
 }
});
test('mode identity remains FFA 1000 / Dual 500, x16, autosplit 100000',()=>{
 for(const mode of ['ffa','dual']){const room=core.createRoom(mode),a=core.join(room,'Test','');assert.equal(a.cells[0].mass,mode==='ffa'?1000:500);assert.equal(room.maxCells,16);assert.equal(p.autoSplitMassFor(mode),100000);assert.equal(room.viruses.length,16);}
});
test('split macros advance one round per source tick and never exceed x16',()=>{
 const a=make(16000);p.startSplitMacro(a,6,0,5880,16,'ffa');assert.equal(a.cells.length,2);
 for(let i=1;i<=5;i++){p.stepSplitMacro(a,i*.04,5880,16,'ffa');assert.equal(a.cells.length,Math.min(2**(i+1),16));}near(a.cells.reduce((s,c)=>s+c.mass,0),16000);
});
test('local and authoritative simulations produce matching motion and mass at 30/60 render Hz',async()=>{
 const {LocalArena}=await require('./helpers/game-module.cjs').game();
 for(const mode of ['ffa','dual'])for(const hz of [30,60]){const local=new LocalArena();local.reset(mode,'Player','',false);const a=local.getById(local.myIds[0]);Object.assign(a,make(8000),{id:a.id});local.players=[a];local.food=[];local.nextFoodSpawnAt=Infinity;local.viruses=Array.from({length:16},()=>p.makeVirus(5000,5000,0,mode));
  const room=core.createRoom(mode),b=make(8000);room.players=new Map([[b.id,b]]);room.food=[];room.nextFoodSpawnAt=Infinity;room.viruses=Array.from({length:16},()=>p.makeVirus(5000,5000,0,mode));
  local.split(a.id,2);core.trySplit(room,b,2);local.setFeedHeld(a.id,true,true);core.setFeedHeld(room,b,true,true);
  const old=Math.random;try{Math.random=()=>.5;for(let n=0;n<hz/2;n++){local.tick(1/hz);core.step(room,1/hz);}}finally{Math.random=old;}
  assert.equal(a.cells.length,b.cells.length);for(let n=0;n<a.cells.length;n++){near(a.cells[n].mass,b.cells[n].mass);near(a.cells[n].x,b.cells[n].x);near(a.cells[n].y,b.cells[n].y);}assert.equal(local.food.length,room.food.length);
 }
});
test('render frame rate does not change the source fixed-step simulation',async()=>{
 const {LocalArena}=await require('./helpers/game-module.cjs').game(),ends=[];
 for(const hz of [25,30,60,120]){const arena=new LocalArena();arena.reset('ffa','Frame test','',false);const a=arena.getById(arena.myIds[0]);Object.assign(a,make(5000),{id:a.id});arena.players=[a];arena.food=[];arena.nextFoodSpawnAt=Infinity;arena.viruses=Array.from({length:16},()=>p.makeVirus(5000,5000));arena.split(a.id);for(let i=0;i<hz;i++)arena.tick(1/hz);ends.push(a.cells.map(c=>({x:c.x,y:c.y,mass:c.mass})));}
 assert.deepEqual(ends[0],ends[1]);assert.deepEqual(ends[0],ends[2]);assert.deepEqual(ends[0],ends[3]);
});
test('source eating ratio and overlap agree without tag or multibox immunity',()=>{
 for(const victim of [740,750,800]){const o=oracle(),big=o.player(1000),small=o.player(victim);small.cells[0].position=new o.Vec2(8000,8000);const m=o.server.checkCellCollision(big.cells[0],small.cells[0]);o.server.resolveCollision(m);
  const a={...make(1000),tag:'TEAM',multiKey:'same'},b={...make(victim),id:'other',tag:'TEAM',multiKey:'same'};p.eatCells([a,b],'ffa',0);assert.equal(b.cells.length,small.cells.length);near(a.cells[0].mass,big.cells[0]._mass);
 }
});
test('linked second player receives feed through actual source collision without teleport credit',()=>{
 const source={...make(1000),multiKey:'linked'},receiver={id:'receiver',multiKey:'linked',cells:[{x:source.cells[0].x+130,y:source.cells[0].y,mass:500}]},food=[];
 const old=Math.random;try{Math.random=()=>.75;p.ejectMass(source,food,0,5880,'dual');}finally{Math.random=old;}
 assert.equal(receiver.cells[0].mass,500);assert.equal(p.absorbFood([source,receiver],food,'dual',0),0);
 for(let n=0;n<20&&food.length;n++){p.advanceBoost(food[0],.04,5880,'dual');p.absorbFood([source,receiver],food,'dual',(n+1)*.04);}
 assert.equal(food.length,0);near(receiver.cells[0].mass,536);near(source.cells[0].mass,960);
});
test('twenty seconds of split, feed, virus and wall interactions remain finite and capped',()=>{
 const a=make(20000),food=[],viruses=[];p.startSplitMacro(a,4,0,5880,16,'ffa');
 for(let n=1;n<=500;n++){
  const time=n*.04;a.target={x:n%70<35?0:5880,y:n%100<50?0:5880};p.stepSplitMacro(a,time,5880,16,'ffa');if(n%3===0)p.ejectMass(a,food,time,5880,'ffa');
  p.stepArenaPhysics([a],food,viruses,.04,time,5880,16,'ffa');assert.ok(a.cells.length<=16);
  for(const cell of [...a.cells,...food,...viruses])assert.ok(Number.isFinite(cell.x)&&Number.isFinite(cell.y)&&Number.isFinite(cell.mass)&&cell.mass>0);
 }
});
