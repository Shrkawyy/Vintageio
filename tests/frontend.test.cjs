'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let game;
async function getGame(){if(!game){const virusSource=fs.readFileSync(path.join(__dirname,'../public/virus-rules.js'),'utf8');const virusUrl='data:text/javascript;charset=utf-8,'+encodeURIComponent(virusSource);const source=fs.readFileSync(path.join(__dirname,'../public/game.js'),'utf8').replace("'./virus-rules.js'",JSON.stringify(virusUrl));game=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));}return game;}
test('exactly 10 local bots in every mode',async()=>{
 const {LocalArena,MODES,DEFAULT_SETTINGS}=await getGame();
 for(const mode of Object.keys(MODES)){
  const arena=new LocalArena();arena.reset(mode,'Tester','',false,DEFAULT_SETTINGS);
  assert.equal(arena.players.filter(p=>p.npc).length,10,mode);
 }
});
test('Mega multi creates two playable cells, both starting at 5K',async()=>{
 const {LocalArena,DEFAULT_SETTINGS}=await getGame();
 const arena=new LocalArena();arena.reset('mega','Tester','',true,DEFAULT_SETTINGS);
 assert.equal(arena.myIds.length,2);
 assert.deepEqual(arena.players.filter(p=>!p.npc).map(p=>p.cells[0].mass),[5000,5000]);
});
test('free local spectator has bots but no spectator player',async()=>{
 const {LocalArena,DEFAULT_SETTINGS}=await getGame();
 const arena=new LocalArena();arena.reset('ffa','Spectator','',false,DEFAULT_SETTINGS,true);
 assert.equal(arena.myIds.length,0);
 assert.equal(arena.players.filter(p=>!p.npc).length,0);
 assert.equal(arena.players.filter(p=>p.npc).length,10);
});
