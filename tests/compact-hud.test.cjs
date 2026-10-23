'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),core=require('../server/core.cjs');
async function game(){
  const base=path.resolve(__dirname,'../public'),encode=file=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,file),'utf8'));
  const s=fs.readFileSync(path.join(base,'game.js'),'utf8').replace(/'\.\/virus-rules\.js\?[^']*'/,JSON.stringify(encode('virus-rules.js'))).replace(/'\.\/physics\.js\?[^']*'/,JSON.stringify(encode('physics.js')));
  return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(s));
}
function roomWithGroups(){
  const room=core.createRoom('ffa');room.players.clear();room.food=[];room.viruses=[];
  const a=core.join(room,'Alice','SECRET'),b=core.join(room,'Bob','SECRET'),c=core.join(room,'Other','OTHER');
  a.cells=[{x:1200,y:1200,mass:1000}];b.cells=[{x:10800,y:10800,mass:2000},{x:11000,y:11000,mass:1000}];
  c.cells=[{x:11000,y:11000,mass:8000}];return{room,a,b,c};
}

test('tag peers remain mutually visible in HUD metadata while distant world fragments stay hidden',async()=>{
  const {getVisibleAllies}=await game(),{room,a,b,c}=roomWithGroups();
  for(const [viewer,friend] of [[a,b],[b,a]]){
    const view=core.viewSnapshot(room,viewer);
    assert.ok(!view.players.some(p=>p.id===friend.id),'far fragments are not sent to the playfield');
    assert.deepEqual(getVisibleAllies(view,viewer.id).map(p=>p.id),[a.id,b.id]);
    assert.ok(!view.peers.some(p=>p.id===c.id));
    assert.ok(!JSON.stringify(view).includes('SECRET'));assert.ok(!JSON.stringify(view).includes('OTHER'));
  }
  const bob=core.viewSnapshot(room,a).peers.find(p=>p.id===b.id);
  assert.equal(bob.cells.length,1);assert.equal(bob.cells[0].mass,3000);
  assert.ok(Math.abs(bob.cells[0].x-(10800*2+11000)/3)<1e-8);
});

test('untagged players see only untagged peers globally; a lone tagged player never falls back to other groups',async()=>{
  const {getVisibleAllies}=await game(),{room,a,b,c}=roomWithGroups();a.tag='';b.tag='';
  const view=core.viewSnapshot(room,a);
  assert.deepEqual(getVisibleAllies(view,a.id).map(p=>p.id),[a.id,b.id]);
  assert.ok(!view.players.some(p=>p.id===b.id));
  assert.deepEqual(getVisibleAllies(core.viewSnapshot(room,c),c.id).map(p=>p.id),[c.id]);
});

test('minimal radar uses white dots and peer names without sector text or exposing the private tag',async()=>{
  const {ArenaRenderer,DEFAULT_SETTINGS}=await game(),{room,a}=roomWithGroups(),calls=[];
  const ctx=new Proxy({},{get:(target,key)=>target[key]||((...args)=>calls.push({method:key,args,color:target.fillStyle})),set:(target,key,value)=>(target[key]=value,true)});
  const canvas={getContext:()=>ctx},renderer=new ArenaRenderer(canvas,canvas);
  renderer.drawRadar(core.viewSnapshot(room,a),a.id,DEFAULT_SETTINGS,[a.id]);
  const dots=calls.filter(c=>c.method==='arc');assert.equal(dots.length,2);
  assert.ok(dots.every(c=>c.color==='#ffffff'&&c.args[2]<=3.5));
  const labels=calls.filter(c=>c.method==='fillText').map(c=>c.args[0]);assert.deepEqual(labels,['Bob']);
  assert.ok(!calls.some(c=>c.method==='strokeRect'||c.method==='fillRect'),'map background stays transparent');
});
