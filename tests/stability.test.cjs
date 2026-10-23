'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const rules=require('../server/physics.cjs'),core=require('../server/core.cjs');
async function game(){
  const base=path.resolve(__dirname,'../public'),encode=file=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,file),'utf8'));
  const src=fs.readFileSync(path.join(base,'game.js'),'utf8').replace("'./virus-rules.js?v=3-full-burst'",JSON.stringify(encode('virus-rules.js'))).replace("'./physics.js?v=11-world-ui'",JSON.stringify(encode('physics.js')));
  return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(src));
}
const mass=p=>p.cells.reduce((s,c)=>s+c.mass,0);
const clear=(point,spawnMass,players,gap=0)=>players.every(p=>(p.cells||[]).every(c=>Math.hypot(point.x-c.x,point.y-c.y)>=rules.cellRadius(c.mass)+rules.cellRadius(spawnMass)+gap-1e-6));

test('bot spawn masses vary from 300 to 1500 in every local and server mode; both connections keep the exact nickname',async()=>{
  const {LocalArena,DEFAULT_SETTINGS}=await game();
  for(const mode of ['ffa','dual','mega']){
    const arena=new LocalArena();arena.reset(mode,'Exact Name','TEAM',true,DEFAULT_SETTINGS);
    const room=core.createRoom(mode);
    assert.deepEqual(arena.players.filter(p=>!p.npc).map(p=>p.name),['Exact Name','Exact Name']);
    for(const players of [arena.players,[...room.players.values()]]){
      const bots=players.filter(p=>p.npc);assert.equal(bots.length,10);
      for(const bot of bots){assert.ok(mass(bot)>=300&&mass(bot)<=1500);assert.ok(clear(bot.cells[0],mass(bot),players.filter(p=>p!==bot)));}
    }
  }
  assert.equal(rules.randomBotMass(()=>0),300);assert.equal(rules.randomBotMass(()=>1),1500);
});

test('a dead bot waits five minutes and respawns outside all split fragments, or waits for free space',()=>{
  const human={id:'human',cells:[{x:1400,y:1400,mass:60000},{x:3100,y:3000,mass:90000}]};
  const bot={id:'bot',npc:true,color:'#abcdef',cells:[]},players=[human,bot];
  rules.maintainBots(players,10,4800,()=>.5);assert.equal(bot.respawnAt,310);
  rules.maintainBots(players,309.999,4800,()=>.5);assert.equal(bot.cells.length,0);
  rules.maintainBots(players,310,4800,()=>.5);assert.equal(bot.cells.length,1);assert.ok(clear(bot.cells[0],mass(bot),[human],100));
  bot.cells=[];bot.respawnAt=400;human.cells=[{x:2400,y:2400,mass:10000000}];
  rules.maintainBots(players,400,4800,()=>.5);assert.equal(bot.cells.length,0,'a crowded map does not force a bot inside a player');
  human.cells=[];rules.maintainBots(players,402,4800,()=>.5);assert.equal(bot.cells.length,1);
});

test('local and online eaten bots do not immediately replenish a player repeatedly',async()=>{
  const {LocalArena,DEFAULT_SETTINGS}=await game();
  for(const backend of ['local','server']){
    const arena=backend==='local'?new LocalArena():core.createRoom('mega');
    if(backend==='local')arena.reset('mega','Test','',false,DEFAULT_SETTINGS);
    const p=backend==='local'?arena.getById(arena.myIds[0]):core.join(arena,'Test','');
    const bot=(backend==='local'?arena.players:[...arena.players.values()]).find(p=>p.npc);
    p.cells=[{x:2400,y:2400,mass:50000}];p.target={x:2400,y:2400};bot.cells=[{x:2400,y:2400,mass:1500}];
    if(backend==='local')arena.players=[p,bot];else arena.players=new Map([[p.id,p],[bot.id,bot]]);
    for(let i=0;i<100;i++){arena.food=[];arena.viruses=[];if(backend==='local')arena.tick(.05,DEFAULT_SETTINGS);else core.step(arena,.05);}
    assert.equal(bot.cells.length,0,backend);assert.ok(mass(p)<=51500&&mass(p)>49000,backend+' has one bot transfer and proportional decay');
    const now=backend==='local'?arena.elapsed:arena.time;assert.ok(bot.respawnAt>now+290);
  }
});

test('bot total mass stays capped after eating and split-body respawns cannot occur inside other pieces',async()=>{
  const bot={npc:true,cells:[{mass:2000},{mass:1000}]};rules.maintainBots([bot],1,4800);assert.ok(Math.abs(mass(bot)-1500)<1e-6);
  const {LocalArena,DEFAULT_SETTINGS}=await game();
  for(const backend of ['local','server']){
    const arena=backend==='local'?new LocalArena():core.createRoom('mega');
    if(backend==='local')arena.reset('mega','Test','',true,DEFAULT_SETTINGS);
    const all=backend==='local'?arena.players:[...arena.players.values()];
    const main=backend==='local'?arena.getById(arena.myIds[0]):core.join(arena,'Test','');
    const second=backend==='local'?arena.getById(arena.myIds[1]):core.join(arena,'Test','');
    main.cells=[{x:2200,y:2200,mass:3000},{x:2800,y:2400,mass:80000}];second.cells=[];
    if(backend==='local')arena.players=[main,second];else arena.players=new Map([[main.id,main],[second.id,second]]);
    const ok=backend==='local'?arena.respawn(second.id,2800,2400):core.respawn(arena,second,2800,2400);
    assert.equal(ok,true);assert.ok(clear(second.cells[0],5000,[main],24),backend);
  }
});

test('six minutes of repeatedly eating bots cannot manufacture unbounded mass',()=>{
  const room=core.createRoom('mega'),p=core.join(room,'Budget','');
  const bots=[...room.players.values()].filter(p=>p.npc),initialBots=bots.reduce((s,b)=>s+mass(b),0);
  p.cells=[{x:2400,y:2400,mass:20000}];p.target={x:2400,y:2400};room.food=[];room.viruses=[];room.nextFoodSpawnAt=Infinity;
  let peak=mass(p);
  for(let i=0;i<7200;i++){
    for(const bot of bots)for(const c of bot.cells){c.x=p.cells[0].x;c.y=p.cells[0].y;}
    core.step(room,.05);peak=Math.max(peak,mass(p));
    for(const c of p.cells)assert.ok(Number.isFinite(c.mass)&&Number.isFinite(c.x)&&Number.isFinite(c.y));
  }
  assert.ok(peak<=20000+initialBots+10*1500,'only the initial bot population and one five-minute replacement can add mass');
  assert.ok(peak<50000);assert.equal(bots.filter(b=>b.cells.length).length,0);
});

test('proportional decay matches the reference scale and is independent of tick rate',()=>{
  const totals=[];
  for(const hz of [20,30,60]){
    const p={cells:[{mass:76100},{mass:1000},{mass:25}]};
    for(let i=0;i<hz*4;i++)rules.decayMass([p],1/hz,'mega');
    assert.ok(Math.abs(p.cells[0].mass-74400)<150,'approximately 76.1K to 74.4K in the Senpa reference');
    assert.ok(Math.abs((76100-p.cells[0].mass)/(1000-p.cells[1].mass)-76.1)<1e-7);
    assert.equal(p.cells[2].mass,25);totals.push(mass(p));
  }
  assert.ok(Math.max(...totals)-Math.min(...totals)<1e-6);
});

test('bots cannot exceed their mass cap temporarily by chain-eating in one update',()=>{
  const large={id:'large',cells:[{x:2400,y:2400,mass:5000}]};
  const bots=Array.from({length:10},(_,i)=>({id:'b'+i,npc:true,cells:[{x:2400,y:2400,mass:1500-i*100}]}));
  rules.eatCells([...bots,large],'mega',1);
  assert.equal(large.cells.length,1,'a bot must not chain-grow and eat the larger player before the end-of-frame cap');
  assert.ok(bots.every(b=>mass(b)<=1500));
});

test('feed leaves the entire split cluster, loses only its configured cost and cannot refund the sender immediately',()=>{
  const p={id:'sender',color:'#abcdef',target:{x:4500,y:2000},cells:[{x:2000,y:2000,mass:1000},{x:2150,y:2000,mass:50000}]},food=[];
  const initial=mass(p);assert.equal(rules.ejectMass(p,food,1,4800,'dual'),2);
  assert.equal(mass(p),initial-200);assert.equal(food.reduce((s,f)=>s+f.mass,0),200);
  for(const pellet of food){assert.ok(p.cells.every(c=>Math.hypot(c.x-pellet.x,c.y-pellet.y)>=rules.cellRadius(c.mass)+Math.sqrt(pellet.mass)*.85));assert.equal(pellet.ownerId,p.id);assert.ok(pellet.vx>1000);}
  p.cells[0].x=food[0].x;p.cells[0].y=food[0].y;
  assert.equal(rules.absorbFood([p],food,'dual',1.1),0);
  const target={id:'other',cells:[{...food[0],mass:5000}]},before=mass(target);
  assert.ok(rules.absorbFood([target],food,'dual',1.1)>0);assert.ok(mass(target)>before,'other connections can receive fresh feed');
});

test('Mega feed emits two pellets from split cells and firing against a wall never recycles food inside the source',()=>{
  const p={id:'one',target:{x:4500,y:2400},cells:[{x:2400,y:2400,mass:16000}]};
  for(let i=0;i<6;i++)rules.splitCells(p,0,4800,64,'mega');assert.equal(p.cells.length,64);
  const initial=mass(p),food=[];assert.equal(rules.ejectMass(p,food,1,4800,'mega'),128);assert.equal(food.length,128);
  assert.ok(food.every(f=>f.mass===100));
  assert.ok(Math.abs(mass(p)+food.reduce((s,f)=>s+f.mass,0)-initial)<1e-7);
  const wall={id:'wall',target:{x:0,y:2400},cells:[{x:rules.cellRadius(1000),y:2400,mass:1000}]};
  assert.equal(rules.ejectMass(wall,food,1,4800,'mega'),0);assert.equal(mass(wall),1000);
});

test('all multi-split actions reach their requested counts over simulation ticks and preserve their mass',()=>{
  for(const mode of ['ffa','dual','mega'])for(let rounds=1;rounds<=6;rounds++){
    const p={target:{x:6000,y:4000},cells:[{x:4000,y:4000,mass:10000}]};
    rules.startSplitMacro(p,rounds,0,8000,64,mode);
    for(let i=1;i<=20;i++){rules.stepSplitMacro(p,i/60,8000,64,mode);rules.moveCells(p,1/60,i/60,8000,mode);}
    assert.equal(p.cells.length,2**rounds,mode+' '+rounds);assert.equal(mass(p),10000);
  }
});

test('control migration removes old D/chat collisions and physical keys stay English on Arabic layouts',async()=>{
  const {DEFAULT_SETTINGS,physicalKey,normalizeControlSettings,CONTROL_KEYS,INPUT_ACTIONS}=await game();
  const settings=normalizeControlSettings({...DEFAULT_SETTINGS,controlsVersion:0,keySplit64:'ي',keyToggleChat:'D',mouseRight:'invalid',showChat:false},true);
  assert.equal(settings.keySplit64,'D');assert.equal(settings.keyToggleChat,'V');assert.equal(settings.showChat,true);
  assert.equal(physicalKey({code:'KeyD',key:'ي'}),'D');assert.equal(physicalKey({code:'KeyQ',key:'ض'}),'Q');
  assert.equal(physicalKey({code:'Digit1',key:'١',altKey:true}),'ALT+1');
  const bindings=CONTROL_KEYS.map(k=>settings[k]).filter(k=>k!=='NO KEY');assert.equal(new Set(bindings).size,bindings.length);
  for(const [action] of INPUT_ACTIONS){const saved=normalizeControlSettings({...settings,mouseLeft:action},true);assert.equal(saved.mouseLeft,action);}
});

test('untagged labels are white and matching tags get the same bright color across players',async()=>{
  const {tagColor}=await game();assert.equal(tagColor(''),'#ffffff');assert.equal(tagColor(' Team '),tagColor('TEAM'));
  assert.notEqual(tagColor('TEAM'),'#ffffff');assert.notEqual(tagColor('TEAM'),'#000000');
  const colors=new Set();for(let i=0;i<100;i++){const color=tagColor('TAG'+i);assert.match(color,/^#[0-9a-f]{6}$/);assert.ok(!['#ffffff','#000000'].includes(color));colors.add(color);}
  assert.ok(colors.size>8);
});






