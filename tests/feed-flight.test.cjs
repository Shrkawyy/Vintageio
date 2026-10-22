'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const physics=require('../server/physics.cjs'),virus=require('../server/virus.cjs'),core=require('../server/core.cjs');
const shot=()=>({x:1000,y:1000,mass:24,ejected:true,ownerId:'sender',sourceId:1,vx:780,vy:0,drag:2.6});
test('medium Mega feed cannot jump across a small receiver between simulation ticks',()=>{
 const pellet=shot(),food=[pellet],p={id:'receiver',cells:[{x:1018.29,y:1000,mass:25}]};
 virus.stepViruses({players:[p],food,viruses:[],time:1,dt:.05,width:4800,maxCells:64});
 assert.ok(Math.hypot(pellet.x-p.cells[0].x,pellet.y-p.cells[0].y)>physics.cellRadius(25),'endpoint alone would miss this receiver');
 assert.equal(physics.absorbFood([p],food,'mega',1),1);assert.equal(p.cells[0].mass,49);assert.equal(food.length,0);
});
test('the first receiver along the feed path wins regardless of player array order',()=>{
 for(const reverse of [false,true]){
  const near={id:'near',cells:[{x:1100,y:1000,mass:25}]},far={id:'far',cells:[{x:1200,y:1000,mass:100}]};
  const food=[{...shot(),previousX:1000,previousY:1000,x:1300}];
  physics.absorbFood(reverse?[near,far]:[far,near],food,'mega',1);
  assert.equal(near.cells[0].mass,49);assert.equal(far.cells[0].mass,100);
 }
});
test('flight collision preserves source grace while letting a sibling receive immediately',()=>{
 const source={x:1000,y:1000,mass:1000,feedSourceId:1},sibling={x:1160,y:1000,mass:25};
 const p={id:'sender',cells:[source,sibling]},food=[{...shot(),previousX:1000,previousY:1000,x:1300,sourceCollectAt:2}];
 physics.absorbFood([p],food,'mega',1);assert.equal(source.mass,1000);assert.equal(sibling.mass,49);
});
test('first obstacle receives feed consistently for cells and viruses in the live simulation',()=>{
 for(const first of ['cell','virus']){
  const room=core.createRoom('mega'),p=core.join(room,'Receiver','');room.players=new Map([[p.id,p]]);
  const cellX=first==='cell'?1100:1200,virusX=first==='cell'?1200:1100;
  p.cells=[{x:cellX,y:1000,mass:25}];p.target={x:cellX,y:1000};room.viruses=[virus.makeVirus(virusX,1000)];
  room.food=[{...shot(),vx:10000}];core.step(room,.05);
  assert.equal(room.viruses[0].feedCount,first==='virus'?1:0);
  assert.ok(Math.abs(p.cells[0].mass-(first==='cell'?49*Math.exp(-.006*.05):25))<1e-6);
 }
});
test('feeding across one second gives the same recipient at 20, 30 and 60 Hz',()=>{
 for(const hz of [20,30,60]){
  const p={id:'receiver',cells:[{x:1080,y:1000,mass:25}]},food=[shot()];
  for(let i=1;i<=hz;i++){
   virus.stepViruses({players:[p],food,viruses:[],time:i/hz,dt:1/hz,width:4800,maxCells:64});
   physics.absorbFood([p],food,'mega',i/hz);
  }
  assert.equal(p.cells[0].mass,49);assert.equal(food.length,0);
 }
});
test('splitting cannot shorten an existing merge deadline in any mode',()=>{
 for(const mode of ['ffa','dual','mega']){
  const p={target:{x:4000,y:2400},cells:[{x:2400,y:2400,mass:10000,mergeAt:100}]};
  physics.splitCells(p,1,4800,64,mode);assert.equal(p.cells.length,2);assert.ok(p.cells.every(c=>c.mergeAt===100));
 }
});




