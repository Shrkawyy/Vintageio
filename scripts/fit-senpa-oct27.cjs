'use strict';
// Offline fit of visible separation; this does not discover Senpa server constants.
const fs=require('node:fs'),p=require('../server/physics.cjs'),{dualTarKernel}=require('../server/dual-tar-kernel.cjs');
const points=JSON.parse(fs.readFileSync('artifacts/senpa-oct27-audit/split-fit-points.json','utf8'));
async function main(){
 const {CellAnimator}=await require('../tests/helpers/game-module.cjs').game();
 function simulate(config){
  const c={...p.FFA_PHYSICS,autoSize:Math.sqrt(10000000),noCollisionDelay:config.delay,siblingPush:config.push,splitBoost:config.boost};
  const parent={x:5000,y:5000,mass:points.mass,age:1000,boost:0},player={id:'fit',movementStopped:true,target:{x:9000,y:5000},cells:[parent]},anim=new CellAnimator();
  anim.sample([player],100,0,20000);p.splitCells(player,0,20000,16,c);let physicsTime=0;const trace=[];
  for(let n=0;n<=144;n++){
   const t=n/120;while(physicsTime+.04<=t+1e-9){physicsTime+=.04;dualTarKernel.step([player],[],[],.04,physicsTime,20000,16,c);}
   const view=anim.sample([player],100,n?1/120:0,20000)[0].cells;
   const r=(view[0].renderRadius+view[1].renderRadius)/2;trace.push({t,d:Math.hypot(view[0].x-view[1].x,view[0].y-view[1].y)/r});
  }
  let error=0;const samples=points.rows.map(row=>{const t=Math.max(0,row.t+config.shift),index=Math.min(trace.length-2,Math.floor(t*120)),f=(t-trace[index].t)*120,predicted=trace[index].d+(trace[index+1].d-trace[index].d)*f;error+=(predicted-row.separationR)**2;return{t:row.t,observed:row.separationR,predicted};});
  return {rms:Math.sqrt(error/points.rows.length),samples};
 }
 const before=simulate({delay:520,push:.3,boost:920,shift:0});let best={rms:Infinity};
 for(const delay of [560,600,640,680,720])for(const push of [.15,.25,.35,.5])for(const boost of [600,800,920,1100])for(const shift of [-.02,0,.02]){
  const config={delay,push,boost,shift},fit=simulate(config);if(fit.rms<best.rms)best={config,...fit};
 }
 const report={source:'reference-split-109.json',sourceCase:'Unobstructed magenta opponent split around 109.10 s; approximately 74k pre-split mass',limits:'Visible separation only. Opponent cursor, server constants, exact simulation phase and input timestamps are unavailable. This is a calibration, not an exact reconstruction.',before,after:best};
 fs.writeFileSync('artifacts/senpa-oct27-audit/split-fit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({before:before.rms,after:best.rms,config:best.config,samples:best.samples.filter((_,i)=>i%4===0)}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
