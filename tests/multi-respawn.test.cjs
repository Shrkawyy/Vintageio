'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../server/core.cjs');
const physics=require('../server/physics.cjs');
let game;
async function localGame(){
 if(game)return game;
 const root=path.join(__dirname,'../public');
 const physicsURL='data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(root,'physics.js'),'utf8'));
 const virusURL='data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(root,'virus-rules.js'),'utf8'));
 const src=fs.readFileSync(path.join(root,'game.js'),'utf8').replace("'./physics.js'",JSON.stringify(physicsURL)).replace("'./virus-rules.js'",JSON.stringify(virusURL));
 game=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(src));return game;
}
test('server: eaten second player respawns at mouse with initial mass and cooldown',()=>{
 const r=core.createRoom('ffa');const main=core.join(r,'Main','');const second=core.join(r,'Secondary','');
 main.cells[0].mass=4000;main.cells[0].x=2000;main.cells[0].y=2000;
 second.cells[0].x=2000;second.cells[0].y=2000;
 assert.equal(physics.eatCells([main,second],'ffa',r.time),1);
 assert.equal(second.cells.length,0);
 assert.equal(core.respawn(r,second,1700,1600),true);
 assert.equal(second.cells[0].mass,1000);
 assert.equal(second.cells[0].x,1700);
 assert.equal(second.cells[0].y,1600);
 second.cells=[];assert.equal(core.respawn(r,second,1800,1900),false);
 r.time+=2;assert.equal(core.respawn(r,second,1800,1900),true);
});
test('server: new multi cell gets brief protection, not indefinite invulnerability',()=>{
 const r=core.createRoom('ffa');const big=core.join(r,'Big','');const small=core.join(r,'Small','');
 big.cells[0].mass=5000;
 small.cells=[];core.respawn(r,small,2000,2000);
 big.cells[0].x=2000;big.cells[0].y=2000;
 assert.equal(physics.eatCells([big,small],'ffa',r.time+1),0);
 assert.equal(physics.eatCells([big,small],'ffa',r.time+2),1);
});
test('local: eaten second multi cell respawns at cursor in FFA, Dual and Mega',async()=>{
 const {LocalArena,DEFAULT_SETTINGS,MODES}=await localGame();
 for(const mode of Object.keys(MODES)){
  const local=new LocalArena();local.reset(mode,'My player','',true,DEFAULT_SETTINGS);
  const second=local.getById(local.myIds[1]);second.cells=[];
  assert.equal(local.respawn(second.id,1900,1300),true,mode);
  assert.equal(second.cells[0].x,1900);assert.equal(second.cells[0].y,1300);
  assert.equal(second.cells[0].mass,MODES[mode].start);
  second.cells=[];assert.equal(local.respawn(second.id,2200,1300),false,'cooldown '+mode);
  local.elapsed+=2;
  assert.equal(local.respawn(second.id,2200,1300),true,'second spawn '+mode);
 }
});
test('macro-feed key uses held state rather than only four instant feeds',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/client.js'),'utf8');
 assert.match(source,/if\(playing && macroFeedHeld && !isSettingsOpen && now>=nextMacroFeedAt\)/);
 assert.match(source,/addEventListener\('keyup'/);
 assert.match(source,/macroFeedHeld=false/);
 assert.doesNotMatch(source,/keyMacroFeed\)\{ repeatAction\('feed',4\)/);
});
test('new FFA base velocity is less aggressive than v8',()=>{
 assert.ok(physics.FFA_PHYSICS.baseSpeed<750);
 assert.ok(physics.FFA_PHYSICS.splitImpulse<700);
 assert.equal(core.MODES.ffa.bots,10);
});
