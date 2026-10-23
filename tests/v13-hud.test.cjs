'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {RestartCycle,INTERVAL}=require('../server/restart.cjs');
async function game(){
 const base=path.resolve(__dirname,'../public');
 const encode=p=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,p),'utf8'));
 let src=fs.readFileSync(path.join(base,'game.js'),'utf8');
 src=src.replace("'./virus-rules.js?v=5-smooth-launch'",JSON.stringify(encode('virus-rules.js'))) .replace("'./physics.js?v=16-multi-fixes'",JSON.stringify(encode('physics.js')));
 return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(src));
}
test('sector boundaries A1 through E5',async()=>{
 const {sectorAt,WORLD_SIZE}=await game();
 assert.equal(sectorAt(0,0),'A1');assert.equal(sectorAt(WORLD_SIZE*.22,WORLD_SIZE*.42),'B3');
 assert.equal(sectorAt(WORLD_SIZE,WORLD_SIZE),'E5');
 assert.equal(sectorAt(-1,WORLD_SIZE*2),'A5');
});
test('tag peers are mutually visible, no-tag peers do not see tagged players',async()=>{
 const {getVisibleAllies}=await game();
 const players=[{id:'a',name:'Alex',tag:'',cells:[{mass:1000}]},{id:'b',name:'Betty',tag:'',cells:[{mass:2000}]},{id:'c',name:'Chris',tag:'red',cells:[{mass:5000}]},{id:'d',name:'Dora',tag:'RED',cells:[{mass:1000}]}];
 const snap={players};
 assert.deepEqual(getVisibleAllies(snap,'a').map(p=>p.id),['a','b']);
 assert.deepEqual(getVisibleAllies(snap,'b').map(p=>p.id),['a','b']);
 assert.deepEqual(getVisibleAllies(snap,'c').map(p=>p.id),['c','d']);
 assert.deepEqual(getVisibleAllies(snap,'d').map(p=>p.id),['c','d']);
});
test('marker grows with mass and is capped',async()=>{
 const {markerRadius}=await game();
 assert.ok(markerRadius(3000)>markerRadius(1000));
 assert.ok(markerRadius(30000)>markerRadius(3000));
 assert.equal(markerRadius(1e8),17);
});
test('restarts every 3 hours, warnings at 10 and 5 minutes exactly once',()=>{
 const cycle=new RestartCycle(1_000_000);
 const due=1_000_000+INTERVAL;
 assert.deepEqual(cycle.poll(due-11*60000),[]);
 assert.equal(cycle.poll(due-10*60000)[0].minutes,10);
 assert.deepEqual(cycle.poll(due-9*60000),[]);
 assert.equal(cycle.poll(due-5*60000)[0].minutes,5);
 assert.deepEqual(cycle.poll(due-4*60000),[]);
 assert.equal(cycle.poll(due)[0].kind,'restart');
 assert.equal(cycle.schedule().nextRestartAt,due+INTERVAL);
 assert.deepEqual(cycle.poll(due+100),[]);
});






