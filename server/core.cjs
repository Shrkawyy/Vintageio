'use strict';
const {makeVirus,stepViruses,VIRUS_MAX_COUNT}=require('./virus.cjs');
const {PHYSICS_CONFIG,stepArenaPhysics, stepBotAI,splitCell,splitCells,autoSplitCells,respawnDelayFor,findSplitHunt,moveCells,eatCells,absorbFood,autoSplitMassFor,findSafeSpawn,findPlayerSpawn,randomBotMass,maintainBots,decayMass,ejectMass,setFeedHeld:holdFeed,requestFeedInput,stepHeldFeed,setRunSplitHeld:holdRunSplit,stepHeldRunSplit,startSplitMacro,stepSplitMacro,physicsFor,mergeDelayFor,feedIntervalFor,findFoodRecipient,worldSizeFor,foodTargetFor,virusTargetFor,limitVisibility}=require('./physics.cjs');
/** Authoritative, in-memory arena simulation. Three completely isolated rooms. */
const MODES={ffa:{name:'FREE FOR ALL',initialMass:1000,bots:10},dual:{name:'DUAL',initialMass:500,bots:10},mega:{name:'MEGA',initialMass:5000,bots:10}};
const fs=require('node:fs'),pathMod=require('node:path');
const {randomUUID}=require('node:crypto');
const {PHYSICS_PRESETS}=require('./physics.cjs');
/** Server registry: servers.config.json, validated at load so a typo can never start a broken room. */
function loadRegistry(file=pathMod.join(__dirname,'servers.config.json')){
  const raw=JSON.parse(fs.readFileSync(file,'utf8')),cats=new Set(raw.categories.map(c=>c.id)),ids=new Set(),servers=[];
  for(const entry of raw.servers){
    const cfg={...raw.defaults,...entry};
    if(!cfg.id||ids.has(cfg.id))throw Error('Duplicate or missing server id: '+cfg.id);ids.add(cfg.id);
    if(!cats.has(cfg.category))throw Error(cfg.id+': unknown category '+cfg.category);
    if(!MODES[cfg.engineMode])throw Error(cfg.id+': unknown engineMode '+cfg.engineMode);
    if(!Object.hasOwn(PHYSICS_PRESETS,cfg.physics))throw Error(cfg.id+': unknown physics preset '+cfg.physics);
    if(cfg.competitive&&(cfg.bots>0||cfg.macro))throw Error(cfg.id+': competitive servers must be bot-free and macro-free');
    cfg.physics=cfg.engineMode==='mega'?'mega':cfg.engineMode==='dual'?'dual':'ffa';
    cfg.initialMass=MODES[cfg.engineMode].initialMass;
    servers.push(Object.freeze(cfg));
  }
  return {categories:raw.categories,servers};
}
const WIDTH=worldSizeFor('ffa'),MAX_CELLS=64,AUTO_SPLIT_MASS=autoSplitMassFor('ffa');
const C={clamp:(n,min,max)=>Math.max(min,Math.min(max,n)),rand:(a,b)=>Math.random()*(b-a)+a,radius:m=>PHYSICS_CONFIG.distanceScale*10*Math.sqrt(Math.max(0,m))};
const COLORS=['#ffb388','#b595fc','#86f6cd','#fa9dd7','#7cc3ed'];
const BOTS=['Pulsar','Neon','Rebel','Orbit','Meteor','Drift','Zenith','Astra','Noctis','Nova','Quasar','Vector'];
let nextId=0;
const uid=()=>String(++nextId);
function cell(x,y,mass,color){return{x,y,mass,color,age:0,boost:0,boostX:0,boostY:0,vx:0,vy:0};}
function makePlayer(mode,name,tag,npc=false,slot=0,initialMass=MODES[mode].initialMass){const mass=npc?randomBotMass():initialMass;const color=COLORS[Math.floor(C.rand(0,COLORS.length))];const x=C.rand(300,worldSizeFor(mode)-300),y=C.rand(300,worldSizeFor(mode)-300);return{id:uid(),name,tag,npc,slot,color,target:{x,y},cells:[cell(x,y,mass,color)],heading:C.rand(0,Math.PI*2),lastChat:0};}
/** Accepts a legacy mode id ('ffa'|'dual'|'mega') or a server config object from the registry. */
function createRoom(spec){
  const config=typeof spec==='string'?null:spec,mode=config?config.engineMode:spec;
  if(!MODES[mode])throw Error('Unknown mode');
  const width=worldSizeFor(mode);
  const botCount=config?config.bots:MODES[mode].bots,initialMass=MODES[mode].initialMass;
  const rules=physicsFor(config?config.physics:mode),modeCap=mode==='ffa'?(rules.maxCells??16):MAX_CELLS;
  const room={worldSize:width,id:config?config.id:mode,mode,physics:config?config.physics:mode,config,initialMass,botCount,maxCells:Math.min(modeCap,config?.maxCells??MAX_CELLS,rules.maxCells??MAX_CELLS),players:new Map(),teamIds:new Map(),cellIds:new WeakMap(),nextCellId:0,food:[],viruses:[],virusRespawns:[],time:0};
  for(let i=0;i<virusTargetFor(mode);i++)room.viruses.push(makeVirus(C.rand(120,width-120),C.rand(120,width-120),0,room.physics));
  for(let i=0;i<botCount;i++){
    const bot=makePlayer(mode,BOTS[i%BOTS.length],'',true,0,initialMass),point=findSafeSpawn([...room.players.values(),{cells:room.viruses}],bot.cells[0].mass,width);
    if(point){Object.assign(bot.cells[0],point);bot.target={...point};}else{bot.cells=[];bot.respawnAt=0;}
    room.players.set(bot.id,bot);
  }
  while(room.food.length<foodTargetFor(room.mode)){const point=newFood([...room.players.values()],width);if(!point)break;room.food.push(point);}
  return room;
}
function newFood(players=[],width=WIDTH){const mass=PHYSICS_CONFIG.foodSize**2/100,point=findSafeSpawn(players,mass,width,8*PHYSICS_CONFIG.distanceScale);return point?{...point,mass,radius:C.radius(mass),color:COLORS[Math.floor(Math.random()*COLORS.length)]}:null;}
function join(room,name,tag,slot=0,multiKey=''){
  const p=makePlayer(room.mode,name,tag,false,slot,room.initialMass);
  if(typeof multiKey==='string'&&/^[a-f0-9]{32}$/.test(multiKey)&&[...room.players.values()].filter(other=>other.multiKey===multiKey).length<2)p.multiKey=multiKey;
  const siblings=[...room.players.values()].filter(other=>p.multiKey&&other.multiKey===p.multiKey).flatMap(other=>other.cells);
  const preferred=siblings.length?{x:siblings[0].x+1,y:siblings[0].y}:{x:C.rand(room.worldSize/3,room.worldSize*2/3),y:C.rand(room.worldSize/3,room.worldSize*2/3)};
  const point=findPlayerSpawn([...room.players.values(),{cells:room.viruses}],p,room.initialMass,room.worldSize,PHYSICS_CONFIG.spawnGap,Math.random,preferred);
  if(point){Object.assign(p.cells[0],point);p.target={...point};}else p.cells=[];
  room.players.set(p.id,p);return p;
}
function point(room,p,x,y){if(Number.isFinite(x)&&Number.isFinite(y)){p.target.x=C.clamp(x,0,room.worldSize);p.target.y=C.clamp(y,0,room.worldSize);}}
function stopMove(room,p,stopped){if(!p||typeof stopped!=='boolean')return false;p.movementStopped=stopped;return true;}
function respawn(room,p,x,y){
  if(!p||p.npc||p.cells.length||room.time<(p.lastRespawnAt??-100)+respawnDelayFor(p,[...room.players.values()],room.physics))return false;
  const mass=room.initialMass,r=C.radius(mass);
  const px=C.clamp(Number.isFinite(x)?x:room.worldSize/2,r,room.worldSize-r);
  const py=C.clamp(Number.isFinite(y)?y:room.worldSize/2,r,room.worldSize-r);
  const point=findPlayerSpawn([...room.players.values(),{cells:room.viruses}],p,mass,room.worldSize,PHYSICS_CONFIG.spawnGap,Math.random,{x:px,y:py});
  if(!point)return false;
  p.cells=[cell(point.x,point.y,mass,p.color)];p.target={...point};
  p.lastRespawnAt=room.time;p.spawnShieldUntil=room.time+1.5;p.pendingSplits=[];
  return true;
}

function split(room,p){return splitCells(p,room.time,room.worldSize,room.maxCells,room.physics);}
/** Network-facing split: six complete commands per burst, refilling eight per second. A command contains 1–6 split rounds. */
function trySplit(room,p,count=1){const t=room.time,last=p.splitRefillAt??t;p.splitTokens=Math.min(6,(p.splitTokens??6)+(t-last)*8);p.splitRefillAt=t;if(p.splitTokens<1)return null;p.splitTokens-=1;return startSplitMacro(p,count,t,room.worldSize,room.maxCells,room.physics);}
function feed(room,p){return ejectMass(p,room.food,room.time,room.worldSize,room.physics,[...room.players.values()]);}
function feedInput(room,p,macro=false){return requestFeedInput(p,room.food,room.time,room.worldSize,room.physics,[...room.players.values()],macro);}
function setFeedHeld(room,p,held,macro=false){
  if(typeof held!=='boolean'||typeof macro!=='boolean'||!p||p.npc)return false;
  const changed=holdFeed(p,held,macro,room.time,room.physics);
  p.inputFeedLeaseUntil=held?room.time+1.5:0;
  if(held&&changed)feedInput(room,p,macro);
  return true;
}
function setRunSplitHeld(room,p,held){
  if(typeof held!=='boolean'||!p||p.npc)return false;
  holdRunSplit(p,held,room.time,room.physics);p.inputRunSplitLeaseUntil=held?room.time+1.5:0;
  if(held)stepHeldRunSplit([p],room.time,room.worldSize,room.maxCells,room.physics);
  return true;
}
function step(room,dt=1/30){
  const rules=physicsFor(room.physics),interval=1/rules.tickRate;
  room.fixedCredit=(room.fixedCredit||0)+Math.min(.25,Math.max(0,Number(dt)||0));
  while(room.fixedCredit+1e-9>=interval){room.fixedCredit-=interval;stepFixed(room,interval);}
}
function stepFixed(room,dt){
  dt=Math.max(0,Number(dt)||0);room.time+=dt;
  const rules=physicsFor(room.physics),threshold=autoSplitMassFor(room.physics);
  for(const p of room.players.values()){
    if(!p.cells.length)continue;
    stepSplitMacro(p,room.time,room.worldSize,room.maxCells,room.physics);
    if(p.npc)stepBotAI(p,[...room.players.values()],room.food,room.viruses,room.time,dt,room.worldSize,room.maxCells,room.physics);
  }
  // Check pending virus respawns
  for (let i = room.virusRespawns.length - 1; i >= 0; i--) {
    const resp = room.virusRespawns[i];
    if (room.time >= resp.time) {
      for (let k = 0; k < resp.count && room.viruses.length < VIRUS_MAX_COUNT; k++) {
        room.viruses.push(makeVirus(C.rand(120, room.worldSize - 120), C.rand(120, room.worldSize - 120),0,room.physics));
      }
      room.virusRespawns.splice(i, 1);
    }
  }
  const all=[...room.players.values()];
  stepHeldRunSplit(all,room.time,room.worldSize,room.maxCells,room.physics);
  stepHeldFeed(all,room.food,room.time,room.worldSize,room.physics);
  stepArenaPhysics(all,room.food,room.viruses,dt,room.time,room.worldSize,room.maxCells,room.physics);
  maintainBots(all,room.time,room.worldSize);
  if(room.time>=(room.nextFoodSpawnAt||0))while(room.food.length<foodTargetFor(room.mode)){const point=newFood(all,room.worldSize);if(!point){room.nextFoodSpawnAt=room.time+1;break;}room.food.push(point);}
}
function cellSnapshot(room,c){
  let id=room.cellIds.get(c);
  if(!id){id=String(++room.nextCellId);room.cellIds.set(c,id);}
  return{id,x:Math.round(c.x*100)/100,y:Math.round(c.y*100)/100,mass:Math.round(c.mass*100)/100,color:c.color,...(Number.isFinite(c.originX)&&Number.isFinite(c.originY)?{originX:c.originX,originY:c.originY}:{})};
}
// Opaque group ids preserve ally matching without distributing the private join tag.
// Rebuild from current players to avoid retaining tags after the last member leaves.
function publicTeamIds(room){
  const previous=room.teamIds||new Map(),current=new Map();
  for(const p of room.players.values())if(p.tag&&!current.has(p.tag))current.set(p.tag,previous.get(p.tag)||randomUUID());
  room.teamIds=current;return current;
}
function publicTeamId(room,tag){return publicTeamIds(room).get(tag)||'';}
function snapshot(room){const teams=publicTeamIds(room);return {type:'state',mode:room.mode,maxCells:room.maxCells,playerCount:[...room.players.values()].filter(p=>!p.npc).length,autoSplitMass:autoSplitMassFor(room.physics),worldSize:room.worldSize,players:[...room.players.values()].map(p=>({id:p.id,name:p.name,...(p.titleId?{titleId:p.titleId}:{}),...(p.nameColor?{nameColor:p.nameColor}:{}),...(p.nameStyle?{nameStyle:p.nameStyle}:{}),...(p.titlePosition?{titlePosition:p.titlePosition}:{}),teamId:teams.get(p.tag)||'',color:p.color,npc:p.npc,movementStopped:!!p.movementStopped,...(p.skinUrl?{skinUrl:p.skinUrl}:{}),...(p.shieldId?{shieldId:p.shieldId}:{}),...(p.flagId?{flagId:p.flagId}:{}),cells:p.cells.map(c=>cellSnapshot(room,c))})),food:room.food,viruses:room.viruses};}
function viewSnapshot(room,viewer,state=snapshot(room)){
  const owned=[...room.players.values()].filter(p=>p===viewer||(viewer.multiKey&&p.multiKey===viewer.multiKey)).map(p=>p.id);
  return limitVisibility(state,owned);
}
function cleanText(t,max=180){return String(t||'').replace(/[<>\u0000-\u001f\u007f]/g,'').trim().slice(0,max);}
function cleanTag(t){return cleanText(String(t||'').normalize('NFKC'),8).toUpperCase();}
function chatRecipients(room,p,channel){return [...room.players.values()].filter(x=>!x.npc&&(channel==='all'||(p.tag&&x.tag===p.tag)));}
module.exports={PHYSICS_CONFIG,loadRegistry,MODES,WIDTH,MAX_CELLS,AUTO_SPLIT_MASS,autoSplitMassFor,feedIntervalFor,createRoom,join,respawn,point,stopMove,split,trySplit,feed,feedInput,setFeedHeld,setRunSplitHeld,step,snapshot,cleanText,cleanTag,chatRecipients,publicTeamId,viewSnapshot};

