'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let game;
async function getGame(){if(!game){const virusSource=fs.readFileSync(path.join(__dirname,'../public/virus-rules.js'),'utf8');const virusUrl='data:text/javascript;charset=utf-8,'+encodeURIComponent(virusSource);const physicsSource=fs.readFileSync(path.join(__dirname,'../public/physics.js'),'utf8');const physicsUrl='data:text/javascript;charset=utf-8,'+encodeURIComponent(physicsSource);const source=fs.readFileSync(path.join(__dirname,'../public/game.js'),'utf8').replace("'./virus-rules.js?v=5-smooth-launch'",JSON.stringify(virusUrl)).replace("'./physics.js?v=16-multi-fixes'",JSON.stringify(physicsUrl));game=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));}return game;}
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
test('local bot splits toward a nearby prey cell it can eat',async()=>{
 const {LocalArena,DEFAULT_SETTINGS}=await getGame();
 const arena=new LocalArena();arena.reset('ffa','Tester','',false,DEFAULT_SETTINGS);
 arena.viruses=[];arena.food=[];
 const bot=arena.players.find(p=>p.npc),prey=arena.getById(arena.myIds[0]);
 bot.cells[0].x=2000;bot.cells[0].y=2000;bot.cells[0].mass=2000;
 for(const other of arena.players){
  if(other.npc&&other!==bot){other.cells[0].x=4300;other.cells[0].y=4300;other.cells[0].mass=500;}
 }
 prey.cells[0].x=2300;prey.cells[0].y=2000;prey.cells[0].mass=500;
 prey.target={x:2300,y:2000};
 arena.tick(.01,DEFAULT_SETTINGS);
 assert.equal(bot.cells.length,2);
 assert.ok(bot.target.x>bot.cells[0].x,'bot aims toward its prey while attacking');
});






