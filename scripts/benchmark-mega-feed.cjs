'use strict';
const fs=require('node:fs'),path=require('node:path'),p=require('../server/physics.cjs');
function run(count){
 const rules=p.MEGA_PHYSICS,food=Array.from({length:5000},(_,i)=>({x:20+i%100*58,y:20+Math.floor(i/100)*115,mass:4,radius:4.9}));
 for(let i=0;i<count;i++)food.push({x:3000+i%50*5,y:3000+Math.floor(i/50)*5,mass:rules.feedMass,radius:rules.feedRadius,ejected:true,vx:800,vy:0,drag:2.6,age:0,bornAt:0,sourceCollectAt:0});
 const players=[{id:'bench',movementStopped:true,cells:[{x:600,y:600,mass:5000,age:1000,boost:0}]}],viruses=Array.from({length:50},(_,i)=>p.makeVirus(500+i%10*500,500+Math.floor(i/10)*800,0,'mega'));
 const samples=[];
 for(let i=0;i<35;i++){const start=performance.now();p.stepArenaPhysics(players,food,viruses,.05,(i+1)*.05,5880,64,'mega');samples.push(performance.now()-start);}
 samples.sort((a,b)=>a-b);return {ejected:count,medianMs:samples[17],p95Ms:samples[33],maxMs:samples[34]};
}
const result=[0,500,1000,4096].map(run);
fs.writeFileSync(path.join(__dirname,'../artifacts/mega-feed-oct27/after-performance.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
