'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const physics=require('../server/physics.cjs'),core=require('../server/core.cjs');
const reference=require('./fixtures/mega-reference.json');
async function game(){
  const base=path.resolve(__dirname,'../public');
  const encode=file=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,file),'utf8'));
  const source=fs.readFileSync(path.join(base,'game.js'),'utf8')
    .replace("'./virus-rules.js?v=3-full-burst'",JSON.stringify(encode('virus-rules.js')))
    .replace("'./physics.js?v=11-world-ui'",JSON.stringify(encode('physics.js')));
  return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
}

test('Mega split launches farther than FFA at small and large mass and stays consistent at 20/30/60 Hz',()=>{
  for(const mass of [5000,30000,90000]){
    const positions=[];
    for(const hz of [20,30,60]){
      const run=mode=>{
        const p={target:{x:15000,y:8000},cells:[{x:8000,y:8000,mass}]};
        const child=physics.splitCell(p,p.cells[0],0,16000,mode);p.cells=[child];
        for(let i=0;i<hz;i++)physics.moveCells(p,1/hz,i/hz,16000,mode);
        return child.x-8000;
      };
      const mega=run('mega');assert.ok(mega>run('ffa')*1.5);positions.push(mega);
    }
    assert.ok(Math.max(...positions)-Math.min(...positions)<5,'launch should not depend on frame rate');
  }
});

test('Mega has faster running and size-aware launch while retaining FFA feed and merge rules',()=>{
  const mega=physics.MEGA_PHYSICS,ffa=physics.FFA_PHYSICS;
  assert.ok(mega.baseSpeed>ffa.baseSpeed&&mega.minSpeed>ffa.minSpeed&&mega.splitImpulse>ffa.splitImpulse);
  for(const key of ['feedCost','feedMass','feedInterval','macroFeedInterval','mergeBase','minMergeTime','maxMergeTime'])assert.equal(mega[key],ffa[key]);
  assert.equal(mega.autoSplitMass,100000);assert.equal(ffa.splitImpulse,340);
});

test('Mega automatic split is per cell at exactly 100K, preserving mass and respecting the cap locally and online',async()=>{
  const {LocalArena,DEFAULT_SETTINGS,MAX_CELLS}=await game();
  for(const backend of ['local','server']){
    const arena=backend==='local'?new LocalArena():core.createRoom('mega');
    if(backend==='local'){arena.reset('mega','Test','',false,DEFAULT_SETTINGS);arena.players=[arena.getById(arena.myIds[0])];}
    const p=backend==='local'?arena.players[0]:core.join(arena,'Test','');
    if(backend==='server')arena.players=new Map([[p.id,p]]);
    arena.food=[];arena.viruses=[];
    const step=()=>{arena.food=[];arena.viruses=[];return backend==='local'?arena.tick(.01,DEFAULT_SETTINGS):core.step(arena,.01);};
    for(const mass of [25500,50000,99999,100000]){
      p.cells=[{x:2400,y:2400,mass}];p.target={x:4000,y:2400};step();
      assert.equal(p.cells.length,mass<100000?1:2,backend+' at '+mass);
      assert.ok(Math.abs(p.cells.reduce((s,c)=>s+c.mass,0)-mass*Math.exp(-.006*.01))<1e-6,'split preserves mass before proportional decay');
    }
    p.cells=[{x:1700,y:2400,mass:50000},{x:3100,y:2400,mass:50000}];step();
    assert.equal(p.cells.length,2,'100K total across two cells does not trigger auto split');
    p.cells=Array.from({length:MAX_CELLS},()=>({x:2400,y:2400,mass:100000,mergeAt:Infinity}));step();
    assert.equal(p.cells.length,MAX_CELLS);assert.ok(Math.abs(p.cells.reduce((s,c)=>s+c.mass,0)-MAX_CELLS*100000*Math.exp(-.006*.01))<1e-5);
  }
});

test('Senpa Mega and competitive Mega share the calibration while other profiles keep their rules',()=>{
  const registry=core.loadRegistry();
  for(const id of ['senpa-mega','comp-mega']){
    const room=core.createRoom(registry.servers.find(s=>s.id===id));
    assert.equal(physics.physicsFor(room.physics),physics.MEGA_PHYSICS);
    assert.equal(core.snapshot(room).autoSplitMass,100000);
  }
  for(const key of ['ffa','dual','aster_mega','arab','gota'])assert.equal(physics.autoSplitMassFor(key),25500,key);
  assert.equal(physics.physicsFor('dual').splitGap,.8);assert.equal(physics.physicsFor('ffa').splitImpulse,340);
});






