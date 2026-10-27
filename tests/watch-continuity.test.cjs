'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
test('entering local spectate drops owned connections while preserving the running world and its clock',async()=>{
 const {LocalArena,DEFAULT_SETTINGS}=await require('./helpers/game-module.cjs').game(),arena=new LocalArena();
 arena.reset('ffa','Watch test','',true,DEFAULT_SETTINGS);arena.tick(.12);const food=arena.food,viruses=arena.viruses,npc=arena.players.find(p=>p.npc),elapsed=arena.elapsed,owned=[...arena.myIds];
 arena.watch();assert.equal(arena.food,food);assert.equal(arena.viruses,viruses);assert.ok(arena.players.includes(npc));assert.equal(arena.elapsed,elapsed);assert.deepEqual(arena.myIds,[]);assert.ok(!arena.snapshot.vision);assert.ok(arena.players.every(p=>!owned.includes(p.id)));
 arena.tick(.12);assert.ok(arena.elapsed>elapsed);const players=arena.players.map(p=>p.id);arena.watch();assert.deepEqual(arena.players.map(p=>p.id),players);assert.equal(arena.food,food);
});
