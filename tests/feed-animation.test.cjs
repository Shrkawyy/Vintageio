'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const physics=require('../server/physics.cjs'),core=require('../server/core.cjs');
async function game(){
  const base=path.resolve(__dirname,'../public'),encode=file=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,file),'utf8'));
  const source=fs.readFileSync(path.join(base,'game.js'),'utf8').replace(/'\.\/virus-rules\.js\?[^']*'/,JSON.stringify(encode('virus-rules.js'))).replace(/'\.\/physics\.js\?[^']*'/,JSON.stringify(encode('physics.js')));
  return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
}
const shot=(x=1000,feedId=1)=>({feedId,x,y:1000,mass:25,radius:9.5,ejected:true,vx:400,vy:0,drag:4});

test('FFA feed moves between network updates without modifying authoritative flight or mass',async()=>{
  const {FeedAnimator}=await game(),anim=new FeedAnimator();
  anim.sample([shot()]);
  const target=Object.freeze(shot(1020)),food=Object.freeze([target]),positions=[];
  for(let i=0;i<3;i++)positions.push(anim.sample(food,1/60)[0].x);
  assert.ok(positions[0]>1000&&positions[0]<positions[1]&&positions[1]<positions[2]&&positions[2]<1020);
  assert.equal(target.x,1020);assert.equal(target.vx,400);assert.equal(target.mass,25);assert.equal(target.radius,9.5);
  assert.equal(target.renderAlpha,undefined);
});

test('feed smoothing and gentle appearance are independent of render rate',async()=>{
  const {FeedAnimator}=await game(),positions=[];
  for(const hz of [30,60,120]){
    const anim=new FeedAnimator();anim.sample([shot()],0);
    let visual;
    for(let i=0;i<hz/5;i++)visual=anim.sample([shot(1020)],1/hz)[0];
    positions.push(visual.x);assert.equal(visual.renderAlpha,1);assert.equal(visual.radius,9.5);
  }
  assert.ok(Math.max(...positions)-Math.min(...positions)<1e-8);
  const anim=new FeedAnimator(),first=anim.sample([shot()],1/120)[0];
  assert.ok(first.renderAlpha>0&&first.renderAlpha<1,'new pellets fade in briefly instead of popping into view');
});

test('feed identity survives new snapshots and removal of earlier pellets; collection leaves no ghosts',async()=>{
  const {FeedAnimator}=await game(),anim=new FeedAnimator();
  anim.sample([shot(1000,1),shot(1200,2)]);
  const second=anim.sample([shot(1220,2)])[0];assert.ok(second.x>1200&&second.x<1220);
  assert.equal(anim.pellets.size,1);assert.deepEqual(anim.sample([]),[]);assert.equal(anim.pellets.size,0);
  anim.sample([shot()]);anim.reset();assert.equal(anim.pellets.size,0);
  assert.equal(anim.sample([shot(4000)])[0].x,4000);
});

test('ordinary food and modes with smoothing disabled keep their existing appearance',async()=>{
  const {FeedAnimator}=await game(),anim=new FeedAnimator(),normal={x:2000,y:2000,mass:12};
  assert.equal(anim.sample([normal])[0],normal);
  const food=[shot()];anim.sample(food);
  assert.equal(anim.sample(food,1/60,false),food);assert.equal(anim.pellets.size,0);
});

test('FFA network feed IDs remain stable and unique without changing the other mode profiles',()=>{
  const room=core.createRoom('ffa'),p=core.join(room,'Feed','');
  p.cells=[{x:2000,y:2000,mass:5000}];p.target={x:4500,y:2000};room.food=[];
  core.feed(room,p);core.feed(room,p);
  const pellets=core.snapshot(room).food;
  assert.equal(new Set(pellets.map(f=>f.feedId)).size,2);assert.ok(pellets.every(f=>Number.isInteger(f.feedId)));
  assert.deepEqual(core.snapshot(room).food.map(f=>f.feedId),pellets.map(f=>f.feedId));
  const old=require('./fixtures/unchanged-mode-physics.json');assert.deepEqual(physics.MEGA_PHYSICS,old.mega);assert.deepEqual(physics.DUAL_PHYSICS,old.dual);
});
