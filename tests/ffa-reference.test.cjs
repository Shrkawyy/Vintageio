'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const physics=require('../server/physics.cjs');
const core=require('../server/core.cjs');
const reference=require('./fixtures/ffa-reference.json');

function replay(step){
  const {rows,onset,mass,start}=reference;
  const p={target:{...rows[0].target},cells:[{...start,mass}]};
  physics.splitCells(p,0,8000,64,'ffa');
  const radius=physics.cellRadius(mass/2),errors=[];
  let time=onset;
  for(const sample of rows){
    if(sample.t<time)continue;
    while(time<sample.t-1e-8){
      const dt=Math.min(step,sample.t-time);
      const before=rows.filter(row=>row.t<=time).at(-1)||rows[0];
      const after=rows.find(row=>row.t>time)||rows.at(-1);
      const f=after.t===before.t?0:(time-before.t)/(after.t-before.t);
      p.target={x:before.target.x+(after.target.x-before.target.x)*f,y:before.target.y+(after.target.y-before.target.y)*f};
      physics.moveCells(p,dt,time-onset,8000,'ffa');
      time+=dt;
    }
    if(sample.observed!==null){
      const [a,b]=p.cells;
      const separation=Math.hypot(a.x-b.x,a.y-b.y)/radius;
      errors.push((separation-sample.observed)**2);
    }
  }
  return Math.sqrt(errors.reduce((sum,error)=>sum+error,0)/errors.length);
}

test('FFA split separation follows the recorded pointer path at 20, 30 and 60 Hz',()=>{
  for(const hz of [20,30,60]){
    const rms=replay(1/hz);
    assert.ok(rms<.3,`${hz} Hz: ${rms.toFixed(3)} radii RMS error against ffa.mp4`);
  }
});

test('FFA movement at 1K mass matches the radius-normalized reference speed',()=>{
  const p={target:{x:7000,y:2000},cells:[{x:2000,y:2000,mass:1000}]};
  for(let i=0;i<60;i++)physics.moveCells(p,1/60,i/60,8000,'ffa');
  const radiiPerSecond=(p.cells[0].x-2000)/physics.cellRadius(1000);
  assert.ok(radiiPerSecond>.65&&radiiPerSecond<.95,`${radiiPerSecond} radii/s`);
});

test('FFA fragments start together and travel before sibling collision pushes them apart',()=>{
  const p={target:{x:7000,y:2000},cells:[{x:2000,y:2000,mass:1000}]};
  physics.splitCells(p,0,8000,64,'ffa');
  assert.equal(p.cells[0].x,p.cells[1].x);
  assert.equal(p.cells[0].y,p.cells[1].y);
  for(let i=1;i<=6;i++)physics.moveCells(p,1/60,i/60,8000,'ffa');
  const [a,b]=p.cells;
  assert.ok(b.x>a.x);
  assert.ok(Math.hypot(b.x-a.x,b.y-a.y)<physics.cellRadius(500));
  assert.equal(a.mass+b.mass,1000);
});

test('FFA and Mega reference calibrations resolve separately and leave Dual unchanged',()=>{
  const registry=core.loadRegistry();
  for(const id of ['vintage-ffa','senpa-ffa']){
    const room=core.createRoom(registry.servers.find(cfg=>cfg.id===id));
    assert.equal(physics.physicsFor(room.physics),physics.FFA_PHYSICS);
  }
  assert.equal(physics.physicsFor('dual').baseSpeed,660);
  assert.equal(physics.physicsFor('dual').splitImpulse,620);
  assert.equal(physics.physicsFor('mega'),physics.MEGA_PHYSICS);
  assert.notEqual(physics.physicsFor('mega'),physics.FFA_PHYSICS);
});






