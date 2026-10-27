'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const p=require('../server/physics.cjs'),core=require('../server/core.cjs'),{dualTarKernel}=require('../server/dual-tar-kernel.cjs');
const make=mass=>({id:'p',target:{x:5000,y:2000},cells:[{x:2000,y:2000,mass,age:1000,boost:0}]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('FFA and Dual auto-split from 100000, preserve mass and respect x16',()=>{
 for(const mode of ['ffa','dual']){assert.equal(p.autoSplitMassFor(mode),100000);const a=make(99999);assert.equal(p.autoSplitCells(a,0,5880,16,mode),0);a.cells[0].mass=100000;assert.equal(p.autoSplitCells(a,0,5880,16,mode),1);near(a.cells.reduce((s,c)=>s+c.mass,0),100000);assert.equal(a.cells.length,2);}
});
test('walking speed is unchanged from the archive while split separation is calibrated independently',()=>{
 for(const mass of [100,500,1000,5000,100000])near(p.cellSpeed(mass,'ffa'),p.cellSpeed(mass,p.DUAL_TAR_REFERENCE));
 assert.equal(p.FFA_PHYSICS.noCollisionDelay,640);assert.equal(p.FFA_PHYSICS.siblingPush,.35);
});
test('the visible split trajectory agrees with the measured reference within 0.08 radii RMS',async()=>{
 const points=JSON.parse(fs.readFileSync(path.join(__dirname,'../artifacts/senpa-oct27-audit/split-fit-points.json'),'utf8'));
 const {CellAnimator}=await require('./helpers/game-module.cjs').game(),a=make(points.mass),anim=new CellAnimator();a.movementStopped=true;
 anim.sample([a],100,0,5880);p.splitCells(a,0,5880,16,'ffa');let time=0;const trace=[];
 for(let n=0;n<=132;n++){const t=n/120;while(time+.04<=t+1e-9){time+=.04;dualTarKernel.step([a],[],[],.04,time,5880,16,p.FFA_PHYSICS);}const cells=anim.sample([a],100,n?1/120:0,5880)[0].cells;trace.push(Math.hypot(cells[0].x-cells[1].x,cells[0].y-cells[1].y)/((cells[0].renderRadius+cells[1].renderRadius)/2));}
 const rms=Math.sqrt(points.rows.reduce((sum,row)=>{const index=Math.floor(row.t*120),f=row.t*120-index,value=trace[index]+(trace[index+1]-trace[index])*f;return sum+(value-row.separationR)**2;},0)/points.rows.length);
 assert.ok(rms<.08,`Video separation RMS ${rms}`);
});
test('feed has no sideways bias, costs 40 and transfers 36 mass per pellet',()=>{
 const old=Math.random;try{Math.random=()=>.5;for(const mode of ['ffa','dual']){const a=make(1000),food=[];assert.equal(p.ejectMass(a,food,0,5880,mode),1);near(a.cells[0].mass,960);near(food[0].mass,36);near(food[0].vy,0);assert.equal(p.ejectMass(a,food,.01,5880,mode),0);assert.equal(p.ejectMass(a,food,.04,5880,mode),1);}}finally{Math.random=old;}
});
test('a fast pellet is credited to the first physical receiver along its path',()=>{
 const nearPlayer={id:'near',cells:[{x:250,y:100,mass:500}]},farPlayer={id:'far',cells:[{x:450,y:100,mass:500}]};
 const food=[{x:600,y:100,previousX:100,previousY:100,mass:36,ejected:true,recipientId:'far',boost:0}];
 p.absorbFood([farPlayer,nearPlayer],food,'ffa',1);assert.equal(food.length,0);near(nearPlayer.cells[0].mass,536);near(farPlayer.cells[0].mass,500);
});
test('only the emitting piece has an 80ms refund grace; sibling reception remains immediate',()=>{
 const source={id:'source',cells:[{x:100,y:100,mass:500,dualTarId:123}]},food=[{x:100,y:100,mass:36,ejected:true,sourceId:123,sourceCollectAt:1.08,boost:0}];
 assert.equal(p.absorbFood([source],food,'ffa',1.01),0);const sibling={id:'sibling',cells:[{x:100,y:100,mass:1000}]};assert.equal(p.absorbFood([source,sibling],food,'ffa',1.02),1);near(sibling.cells[0].mass,1036);near(source.cells[0].mass,500);
});
test('held run-split advances at 120ms without OS repeats and stops on release',()=>{
 const a=make(16000);p.setRunSplitHeld(a,true,0,'ffa');p.stepHeldRunSplit([a],0,5880,16,'ffa');assert.equal(a.cells.length,2);
 p.stepHeldRunSplit([a],.04,5880,16,'ffa');assert.equal(a.cells.length,2);p.stepHeldRunSplit([a],.12,5880,16,'ffa');assert.equal(a.cells.length,4);
 p.setRunSplitHeld(a,false,.13,'ffa');p.stepHeldRunSplit([a],.24,5880,16,'ffa');assert.equal(a.cells.length,4);
});
test('repeated run start packets cannot reset its cooldown or create catch-up bursts',()=>{
 const a=make(16000);p.setRunSplitHeld(a,true,0,'ffa');p.stepHeldRunSplit([a],0,5880,16,'ffa');
 for(let i=0;i<30;i++){p.setRunSplitHeld(a,false,.01,'ffa');p.setRunSplitHeld(a,true,.01,'ffa');p.stepHeldRunSplit([a],.01,5880,16,'ffa');}assert.equal(a.cells.length,2);
 p.stepHeldRunSplit([a],10,5880,16,'ffa');assert.equal(a.cells.length,4);p.stepHeldRunSplit([a],10,5880,16,'ffa');assert.equal(a.cells.length,4);
});
test('run-split leases expire and invalid input or death cannot leave it running',()=>{
 const room=core.createRoom('ffa'),a=make(16000);room.players=new Map([[a.id,a]]);room.food=[];room.nextFoodSpawnAt=Infinity;
 assert.equal(core.setRunSplitHeld(room,a,'yes'),false);assert.equal(core.setRunSplitHeld(room,a,true),true);
 for(let n=0;n<40;n++)core.step(room,.04);assert.equal(a.inputRunSplitHeld,false);assert.ok(a.cells.length<=16);
 core.setRunSplitHeld(room,a,true);a.cells=[];core.step(room,.04);assert.equal(a.inputRunSplitHeld,false);
});
test('new controls preserve an existing Shift binding',async()=>{
 const g=await require('./helpers/game-module.cjs').game();assert.equal(g.DEFAULT_SETTINGS.keyRunSplit,'SHIFT');const result=g.normalizeControlSettings({...g.DEFAULT_SETTINGS,keyRunSplit:undefined,keyStopMove:'SHIFT'});assert.equal(result.keyStopMove,'SHIFT');assert.equal(result.keyRunSplit,'NO KEY');
});
