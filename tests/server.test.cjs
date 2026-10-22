'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../server/core.cjs');
test('three rooms are isolated and use correct initial mass',()=>{
 const rooms=Object.fromEntries(Object.keys(core.MODES).map(m=>[m,core.createRoom(m)]));
 for(const [mode,expected] of [['ffa',1000],['dual',1000],['mega',5000]]){
  const a=core.join(rooms[mode],'Tester','A');assert.equal(a.cells[0].mass,expected);assert.equal(rooms[mode].players.has(a.id),true);
  for(const other of Object.keys(rooms).filter(m=>m!==mode))assert.equal(rooms[other].players.has(a.id),false);
 }
});
test('split follows cursor and retains mass',()=>{
 const r=core.createRoom('ffa'),p=core.join(r,'Alpha','A');const initial=p.cells[0].mass;
 core.point(r,p,p.cells[0].x+400,p.cells[0].y);core.split(r,p);assert.equal(p.cells.length,2);
 assert.equal(p.cells.reduce((n,c)=>n+c.mass,0),initial);
  assert.ok(p.cells[1].vx>0,'daughter launches toward the cursor from its overlapping spawn');
});
test('FFA automatic split begins at 25,500 mass and respects cell cap',()=>{
 const r=core.createRoom('ffa'),p=core.join(r,'Alpha','A');p.cells[0].mass=25500;
 r.players=new Map([[p.id,p]]);r.food=[];r.viruses=[];
 core.step(r,0.01);assert.ok(p.cells.length>=2);assert.ok(p.cells.length<=core.MAX_CELLS);
});
test('Tag chat recipients are private within a room',()=>{
 const r=core.createRoom('ffa');const a=core.join(r,'A','TEAM');const b=core.join(r,'B','TEAM');const c=core.join(r,'C','OTHER');
 assert.deepEqual(new Set(core.chatRecipients(r,a,'tag').map(p=>p.id)),new Set([a.id,b.id]));
 assert.ok(core.chatRecipients(r,a,'all').find(p=>p.id===c.id));
});
test('sanitizer limits tags and chat data',()=>{assert.equal(core.cleanTag('<hello> test'), 'HELLO TE');assert.ok(!core.cleanText('<script>x</script>',180).includes('<'));});






