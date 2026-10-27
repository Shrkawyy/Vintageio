'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const p=require('../server/physics.cjs');
const previous=JSON.parse(fs.readFileSync(path.join(__dirname,'../artifacts/mega-before.json'),'utf8'));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const make=(mass=5000)=>({id:'source',color:'#09759d',target:{x:5000,y:2000},cells:[{x:2000,y:2000,mass,age:1000,boost:0}]});
test('Mega keeps its existing cell motion, split boost, merging, x64 and auto threshold',()=>{
 const feedFields=new Set(['feedInterval','macroFeedInterval','feedCost','feedMass','feedRadius','feedSourceGrace']);
 for(const [key,value] of Object.entries(previous))if(!feedFields.has(key))assert.deepEqual(p.MEGA_PHYSICS[key],value,key);
 const before=make(64000),after=make(64000);
 p.startSplitMacro(before,6,0,5880,64,previous);p.startSplitMacro(after,6,0,5880,64,'mega');
 for(let i=1;i<=8;i++){
  const t=i*.05;p.stepSplitMacro(before,t,5880,64,previous);p.stepSplitMacro(after,t,5880,64,'mega');
  p.moveCells(before,.05,t,5880,previous);p.moveCells(after,.05,t,5880,'mega');
  assert.equal(after.cells.length,before.cells.length);
  after.cells.forEach((cell,j)=>{for(const k of ['x','y','mass','boost','boostX','boostY'])near(cell[k],before.cells[j][k]);});
 }
 assert.equal(after.cells.length,64);assert.equal(p.autoSplitMassFor('mega'),100000);
});
test('Mega feed has the new base radius and a stable 20 volleys per second on its existing tick',()=>{
 const a=make(5000),food=[];p.setFeedHeld(a,true,true,0,'mega');
 for(let n=0;n<20;n++)p.stepHeldFeed([a],food,n*.05,5880,'mega');
 assert.equal(food.length,20);near(a.cells[0].mass,5000-20*40);
 assert.ok(food.every(f=>f.mass===36&&f.radius===14.7&&f.color===a.color));
 near(a.cells[0].mass+food.reduce((n,f)=>n+f.mass,0),5000-20*4);
 assert.equal(p.requestFeedInput(a,food,.96,5880,'mega'),0);
});
test('map food cannot consume Mega feed capacity, and the separate pellet cap remains bounded',()=>{
 const a=make(),mapFood=Array.from({length:6000},()=>({x:100,y:100,mass:4}));
 assert.equal(p.ejectMass(a,mapFood,0,5880,'mega'),1);
 const full=Array.from({length:p.MEGA_PHYSICS.maxFeedPellets},()=>({ejected:true,mass:36,x:100,y:100})),mass=a.cells[0].mass;
 assert.equal(p.ejectMass(a,full,.1,5880,'mega'),0);assert.equal(a.cells[0].mass,mass);
});
test('Mega feed streams cross without pushing each other while receivers still collect along the path',()=>{
 const food=[{x:2000,y:2000,mass:36,radius:14.7,ejected:true,vx:800,vy:0,drag:2.6},
  {x:2001,y:2000,mass:36,radius:14.7,ejected:true,vx:800,vy:0,drag:2.6}];
 const expected=structuredClone(food);
 for(const f of expected)p.advanceBoost(f,.05,5880,'mega');
 p.stepViruses({players:[],food,viruses:[],time:.05,dt:.05,width:5880,maxCells:64,physics:'mega'});
 food.forEach((f,i)=>{near(f.x,expected[i].x);near(f.y,expected[i].y);near(f.boost,expected[i].boost)});
 const first={id:'first',cells:[{x:250,y:100,mass:500}]},last={id:'last',cells:[{x:450,y:100,mass:500}]};
 const passing=[{x:600,y:100,previousX:100,previousY:100,mass:36,radius:14.7,ejected:true,sourceId:123}];
 assert.equal(p.absorbFood([last,first],passing,'mega',1),1);near(first.cells[0].mass,536);near(last.cells[0].mass,500);
 const viruses=[p.makeVirus(1000,1000,0,'mega')],virusFeed=[{x:1000,y:1000,mass:36,radius:14.7,ejected:true,boost:0}];
 p.stepViruses({players:[],food:virusFeed,viruses,time:1,dt:0,width:5880,maxCells:64,physics:'mega'});
 assert.equal(virusFeed.length,0);near(viruses[0].mass,136);near(p.virusCharge(viruses[0]),36);
});
test('Mega feed size comes from its profile, independent of both size sliders',async()=>{
 const {game}=require('./helpers/game-module.cjs'),{drawFoodLayer,DEFAULT_SETTINGS,FeedAnimator,radius}=await game();
 const pellet=Object.freeze({x:100,y:100,mass:36,radius:14.7,ejected:true}),bounds={left:0,top:0,right:1000,bottom:1000},radii=[];
 const ctx={beginPath(){},arc(x,y,r){radii.push(r)},fill(){},stroke(){assert.fail('Mega feed has no white outline')}};
 for(const size of [.5,1,2])drawFoodLayer(ctx,[pellet],bounds,{...DEFAULT_SETTINGS,foodSize:size,feedSize:size},'mega');
 assert.ok(radii.every(r=>r===radii[0]&&r>15));
 const screenRadius=radii[0]*95/radius(21900);assert.ok(screenRadius>=6&&screenRadius<=7);
 const anim=new FeedAnimator(),first=anim.sample([pellet],1/60,true,5880,false)[0];assert.equal(first.renderAlpha,1);
 const next=Object.freeze({...pellet,x:140,feedId:7}),stable=new FeedAnimator();stable.sample([{...pellet,feedId:7}],1/60,true,5880,false);
 const visual=stable.sample([next],1/60,true,5880,false)[0];assert.ok(visual.x>100&&visual.x<140);assert.equal(next.x,140);
});
