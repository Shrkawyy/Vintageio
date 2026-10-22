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
 const src=fs.readFileSync(path.join(root,'game.js'),'utf8').replace("'./physics.js?v=11-world-ui'",JSON.stringify(physicsURL)).replace("'./virus-rules.js?v=3-full-burst'",JSON.stringify(virusURL));
 game=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(src));return game;
}
test('server: eaten second player respawns at mouse with initial mass and cooldown',()=>{
 const r=core.createRoom('ffa');const main=core.join(r,'Main','');const second=core.join(r,'Secondary','');
 r.players=new Map([[main.id,main],[second.id,second]]);
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
 big.cells[0].x=small.cells[0].x;big.cells[0].y=small.cells[0].y;
 assert.equal(physics.eatCells([big,small],'ffa',r.time+1),0);
 assert.equal(physics.eatCells([big,small],'ffa',r.time+2),1);
});
test('local: eaten second multi cell respawns at cursor in FFA, Dual and Mega',async()=>{
 const {LocalArena,DEFAULT_SETTINGS,MODES}=await localGame();
 for(const mode of Object.keys(MODES)){
  const local=new LocalArena();local.reset(mode,'My player','',true,DEFAULT_SETTINGS);
  local.players=local.players.filter(p=>!p.npc);
  const second=local.getById(local.myIds[1]);second.cells=[];
  assert.equal(local.respawn(second.id,1900,1300),true,mode);
  assert.equal(second.cells[0].x,1900);assert.equal(second.cells[0].y,1300);
  assert.equal(second.cells[0].mass,MODES[mode].start);
  second.cells=[];assert.equal(local.respawn(second.id,2200,1300),false,'cooldown '+mode);
  local.elapsed+=2;
  assert.equal(local.respawn(second.id,2200,1300),true,'second spawn '+mode);
 }
});
test('multi respawn follows cursor from the other cell with a safe gap',async()=>{
 const {radius,respawnPosition}=await localGame();
 const anchor={x:2000,y:2000,mass:1000};
 const cursor={x:3000,y:2000};
 const spawn=respawnPosition(anchor,cursor,1000);
 const distance=Math.hypot(spawn.x-anchor.x,spawn.y-anchor.y);
 assert.ok(spawn.x>anchor.x,'respawn is toward the cursor');
 assert.ok(Math.abs(spawn.y-anchor.y)<1,'respawn stays on the cursor direction');
 assert.ok(distance>=radius(anchor.mass)+radius(1000)+31,'respawn has a small fixed gap');
 assert.ok(distance<400,'respawn stays close to the other cell');
});
test('multi respawn avoids the wall while keeping the largest safe cursor-aligned gap',async()=>{
 const {radius,respawnPosition}=await localGame();
 const anchor={x:100,y:2000,mass:1000};
 const cursor={x:0,y:2000};
 const spawn=respawnPosition(anchor,cursor,1000);
 const distance=Math.hypot(spawn.x-anchor.x,spawn.y-anchor.y);
 assert.ok(spawn.x>=radius(1000)&&spawn.x<=4800-radius(1000));
 assert.ok(spawn.y>=radius(1000)&&spawn.y<=4800-radius(1000));
 assert.ok(distance>=radius(anchor.mass)+radius(1000)+31);
 assert.ok(spawn.y!==anchor.y,'uses an available direction when the cursor points through the wall');
});
test('blocked multibox respawn finds nearby free space before trying a random map location locally and online',async()=>{
 const {LocalArena,DEFAULT_SETTINGS}=await localGame();
 for(const backend of ['local','server'])for(const mode of ['ffa','dual','mega']){
  const arena=backend==='local'?new LocalArena():core.createRoom(mode);
  let main,second;
  if(backend==='local'){arena.reset(mode,'Test','',true,DEFAULT_SETTINGS);[main,second]=arena.myIds.map(id=>arena.getById(id));arena.players=[main,second];}
  else{main=core.join(arena,'Main','');second=core.join(arena,'Second','');arena.players=new Map([[main.id,main],[second.id,second]]);}
  main.cells=[{x:2400,y:2400,mass:10000},{x:2650,y:2650,mass:2000}];second.cells=[];
  const success=backend==='local'?arena.respawn(second.id,2600,2400):core.respawn(arena,second,2600,2400);
  assert.equal(success,true);const c=second.cells[0];
  assert.ok(Math.hypot(c.x-2600,c.y-2400)<500,backend+' '+mode+' remains near the requested spawn');
  assert.ok(main.cells.every(other=>Math.hypot(c.x-other.x,c.y-other.y)>=physics.cellRadius(c.mass)+physics.cellRadius(other.mass)+24));
 }
});
test('local feed ejects 100 mass and never removes a cell at exactly the feed cost',async()=>{
 const {LocalArena,DEFAULT_SETTINGS}=await localGame();
 const local=new LocalArena();local.reset('dual','Tester','',false,DEFAULT_SETTINGS);
 const player=local.getById(local.myIds[0]);
 const cell=player.cells[0];cell.mass=1000;
 local.setTarget(player.id,cell.x+100,cell.y);
 local.feed(player.id);
 const pellets=local.food.filter(food=>food.ejected);
 assert.equal(pellets.length,1);
 assert.equal(pellets[0].mass,100);
 assert.equal(cell.mass,900);
 cell.mass=100;
 local.feed(player.id);
 assert.equal(cell.mass,100);
 assert.equal(local.food.filter(food=>food.ejected).length,1);
});
test('server feed ejects 100 mass and never removes a cell at exactly the feed cost',()=>{
 const room=core.createRoom('dual'),player=core.join(room,'Tester','');
 const cell=player.cells[0];cell.mass=1000;
 player.target={x:cell.x+100,y:cell.y};
 core.feed(room,player);
 const pellets=room.food.filter(food=>food.ejected);
 assert.equal(pellets.length,1);
 assert.equal(pellets[0].mass,100);
 assert.equal(cell.mass,900);
 cell.mass=100;
 core.feed(room,player);
 assert.equal(cell.mass,100);
 assert.equal(room.food.filter(food=>food.ejected).length,1);
});
test('macro-feed key uses held state rather than only four instant feeds',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../public/client.js'),'utf8');
 assert.ok(source.includes('feedHeld||macroFeedHeld||mouseFeedButtons.size||mouseMacroButtons.size'),'keyboard and mouse feed sources share the held-input loop');
 assert.ok(source.includes("addEventListener('keyup'"));
 assert.ok(source.includes("settings.keyFeed.split('+').at(-1))feedHeld=false"),'release survives changes in modifier state');
 assert.ok(source.includes("settings.keyMacroFeed.split('+').at(-1))macroFeedHeld=false"));
 assert.ok(source.includes('feedHeld=false;macroFeedHeld=false;rightDown=false'));
 assert.ok(source.includes("if(!feedHeld){feedHeld=true;doAction('feed')"));
});
test('new FFA base velocity is less aggressive than v8',()=>{
 assert.ok(physics.FFA_PHYSICS.baseSpeed<750);
 assert.ok(physics.FFA_PHYSICS.splitImpulse<700);
 assert.equal(core.MODES.ffa.bots,10);
});








