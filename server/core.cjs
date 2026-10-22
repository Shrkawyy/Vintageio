'use strict';
const {makeVirus,stepViruses}=require('./virus.cjs');
const {splitCell,splitCells,findSplitHunt,moveCells,eatCells,absorbFood,autoSplitMassFor,findSafeSpawn,randomBotMass,maintainBots,decayMass,ejectMass,startSplitMacro,stepSplitMacro,physicsFor,mergeDelayFor,feedIntervalFor,findFoodRecipient,worldSizeFor}=require('./physics.cjs');
/** Authoritative, in-memory arena simulation. Three completely isolated rooms. */
const MODES={ffa:{name:'FREE FOR ALL',initialMass:1000,bots:10},dual:{name:'DUAL',initialMass:1000,bots:10},mega:{name:'MEGA',initialMass:5000,bots:10}};
const fs=require('node:fs'),pathMod=require('node:path');
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
    cfg.initialMass=Number(cfg.initialMass||MODES[cfg.engineMode].initialMass);
    servers.push(Object.freeze(cfg));
  }
  return {categories:raw.categories,servers};
}
const WIDTH=worldSizeFor('ffa'),MAX_CELLS=64,AUTO_SPLIT_MASS=autoSplitMassFor('ffa');
const C={clamp:(n,min,max)=>Math.max(min,Math.min(max,n)),rand:(a,b)=>Math.random()*(b-a)+a,radius:m=>Math.max(13,Math.sqrt(Math.max(1,m))*2.45)};
const COLORS=['#ffb388','#b595fc','#86f6cd','#fa9dd7','#7cc3ed'];
const BOTS=['Pulsar','Neon','Rebel','Orbit','Meteor','Drift','Zenith','Astra','Noctis','Nova','Quasar','Vector'];
let nextId=0;
const uid=()=>String(++nextId);
function cell(x,y,mass,color){return{x,y,mass,color,vx:0,vy:0,mergeAt:0};}
function makePlayer(mode,name,tag,npc=false,slot=0,initialMass=MODES[mode].initialMass){const mass=npc?randomBotMass():initialMass;const color=COLORS[Math.floor(C.rand(0,COLORS.length))];const x=C.rand(300,worldSizeFor(mode)-300),y=C.rand(300,worldSizeFor(mode)-300);return{id:uid(),name,tag,npc,slot,color,target:{x,y},cells:[cell(x,y,mass,color)],heading:C.rand(0,Math.PI*2),lastChat:0};}
/** Accepts a legacy mode id ('ffa'|'dual'|'mega') or a server config object from the registry. */
function createRoom(spec){
  const config=typeof spec==='string'?null:spec,mode=config?config.engineMode:spec;
  if(!MODES[mode])throw Error('Unknown mode');
  const width=worldSizeFor(mode);
  const botCount=config?config.bots:MODES[mode].bots,initialMass=config?config.initialMass:MODES[mode].initialMass;
  const room={worldSize:width,id:config?config.id:mode,mode,physics:config?config.physics:mode,config,initialMass,botCount,maxCells:config?.maxCells??MAX_CELLS,players:new Map(),cellIds:new WeakMap(),nextCellId:0,food:[],viruses:[],virusRespawns:[],time:0};
  for(let i=0;i<8;i++)room.viruses.push(makeVirus(C.rand(120,width-120),C.rand(120,width-120)));
  for(let i=0;i<botCount;i++){
    const bot=makePlayer(mode,BOTS[i%BOTS.length],'',true,0,initialMass),point=findSafeSpawn([...room.players.values()],bot.cells[0].mass,width);
    if(point){Object.assign(bot.cells[0],point);bot.target={...point};}else{bot.cells=[];bot.respawnAt=0;}
    room.players.set(bot.id,bot);
  }
  while(room.food.length<280){const point=newFood([...room.players.values()],width);if(!point)break;room.food.push(point);}
  return room;
}
function newFood(players=[],width=WIDTH){const mass=C.rand(8,23),point=findSafeSpawn(players,mass,width,8);return point?{...point,mass,color:COLORS[Math.floor(Math.random()*COLORS.length)]}:null;}
function join(room,name,tag,slot=0){const p=makePlayer(room.mode,name,tag,false,slot,room.initialMass),point=findSafeSpawn([...room.players.values()],room.initialMass,room.worldSize,100,Math.random,{x:C.rand(room.worldSize/3,room.worldSize*2/3),y:C.rand(room.worldSize/3,room.worldSize*2/3)});if(point){Object.assign(p.cells[0],point);p.target={...point};}else p.cells=[];room.players.set(p.id,p);return p;}
function point(room,p,x,y){if(Number.isFinite(x)&&Number.isFinite(y)){p.target.x=C.clamp(x,0,room.worldSize);p.target.y=C.clamp(y,0,room.worldSize);}}
function stopMove(room,p,stopped){if(!p||typeof stopped!=='boolean')return false;p.movementStopped=stopped;return true;}
function respawn(room,p,x,y){
  if(!p||p.npc||p.cells.length||room.time<(p.lastRespawnAt??-100)+1.8)return false;
  const mass=room.initialMass,r=C.radius(mass);
  const px=C.clamp(Number.isFinite(x)?x:room.worldSize/2,r,room.worldSize-r);
  const py=C.clamp(Number.isFinite(y)?y:room.worldSize/2,r,room.worldSize-r);
  const point=findSafeSpawn([...room.players.values()].filter(other=>other!==p),mass,room.worldSize,24,Math.random,{x:px,y:py});
  if(!point)return false;
  p.cells=[cell(point.x,point.y,mass,p.color)];p.target={...point};
  p.lastRespawnAt=room.time;p.spawnShieldUntil=room.time+1.5;p.pendingSplits=[];
  return true;
}

function split(room,p){return splitCells(p,room.time,room.worldSize,room.maxCells,room.physics);}
/** Network-facing split: six complete commands per burst, refilling eight per second. A command contains 1–6 split rounds. */
function trySplit(room,p,count=1){const t=room.time,last=p.splitRefillAt??t;p.splitTokens=Math.min(6,(p.splitTokens??6)+(t-last)*8);p.splitRefillAt=t;if(p.splitTokens<1)return null;p.splitTokens-=1;return startSplitMacro(p,count,t,room.worldSize,room.maxCells,room.physics);}
function feed(room,p){return ejectMass(p,room.food,room.time,room.worldSize,room.physics);}
function step(room,dt=1/30){
  dt=Math.min(.08,Math.max(0,dt));room.time+=dt;
  for(const p of room.players.values()){
    if(!p.cells.length)continue;
    stepSplitMacro(p,room.time,room.worldSize,room.maxCells,room.physics);
    if(p.npc){
      const lead=p.cells[0];
      const dangers=[...room.players.values()].filter(x=>x!==p&&x.cells.length&&x.cells[0].mass>lead.mass*1.3&&Math.hypot(x.cells[0].x-lead.x,x.cells[0].y-lead.y)<460)
        .sort((a,b)=>Math.hypot(a.cells[0].x-lead.x,a.cells[0].y-lead.y)-Math.hypot(b.cells[0].x-lead.x,b.cells[0].y-lead.y));
      if(dangers.length){
        p.aiHuntUntil=0;
        p.heading=Math.atan2(lead.y-dangers[0].cells[0].y,lead.x-dangers[0].cells[0].x);
        p.target={x:C.clamp(lead.x+Math.cos(p.heading)*520,0,room.worldSize),y:C.clamp(lead.y+Math.sin(p.heading)*520,0,room.worldSize)};
      }else{
        let hunt=p.aiHuntUntil>room.time
          ? [...room.players.values()].find(enemy=>enemy.id===p.aiHuntTargetId&&enemy.cells.length)
          : null;
        if(p.aiHuntUntil<=room.time)p.aiHuntUntil=0;
        const attack=hunt
          ? {prey:hunt,target:hunt.cells.reduce((nearest,c)=>Math.hypot(c.x-lead.x,c.y-lead.y)<Math.hypot(nearest.x-lead.x,nearest.y-lead.y)?c:nearest,hunt.cells[0])}
          : findSplitHunt(p,[...room.players.values()],room.time,room.worldSize,room.maxCells,room.physics);
        if(attack){
          p.target={x:attack.target.x,y:attack.target.y};
          p.heading=Math.atan2(attack.target.y-lead.y,attack.target.x-lead.x);
          if(!hunt){
            p.aiHuntTargetId=attack.prey.id;
            p.aiHuntUntil=room.time+2.5;
            const child=splitCell(p,lead,room.time,room.worldSize,room.physics);
            if(child)p.cells.push(child);
          }
        }else{
          if(Math.random()<dt*.6)p.heading=C.rand(0,Math.PI*2);
          p.target={x:C.clamp(lead.x+Math.cos(p.heading)*520,0,room.worldSize),y:C.clamp(lead.y+Math.sin(p.heading)*520,0,room.worldSize)};
        }
      }
    }
    moveCells(p,dt,room.time,room.worldSize,room.physics,p.npc?.73:1);
    const autoSplitMass=autoSplitMassFor(room.physics);
    if(p.cells.some(c=>c.mass>=autoSplitMass)&&p.cells.length<room.maxCells)splitCells(p,room.time,room.worldSize,room.maxCells,room.physics,autoSplitMass);
  }
  // Check pending virus respawns
  for (let i = room.virusRespawns.length - 1; i >= 0; i--) {
    const resp = room.virusRespawns[i];
    if (room.time >= resp.time) {
      for (let k = 0; k < resp.count && room.viruses.length < 32; k++) {
        room.viruses.push(makeVirus(C.rand(120, room.worldSize - 120), C.rand(120, room.worldSize - 120)));
      }
      room.virusRespawns.splice(i, 1);
    }
  }
  stepViruses({viruses:room.viruses,food:room.food,players:[...room.players.values()],width:room.worldSize,maxCells:room.maxCells,time:room.time,dt,
    physics:physicsFor(room.physics),mergeDelay:mass=>mergeDelayFor(mass,room.physics),
    findFoodReceiver:pellet=>findFoodRecipient(pellet,[...room.players.values()],room.time),
    spawnVirus:()=>makeVirus(C.rand(120,room.worldSize-120),C.rand(120,room.worldSize-120)),
    addRespawn:(time,count)=>room.virusRespawns.push({time,count})});
  const all=[...room.players.values()];
  absorbFood(all,room.food,room.physics,room.time);
  eatCells(all,room.physics,room.time);
  decayMass(all,dt,room.physics);maintainBots(all,room.time,room.worldSize);
  if(room.time>=(room.nextFoodSpawnAt||0))while(room.food.length<280){const point=newFood(all,room.worldSize);if(!point){room.nextFoodSpawnAt=room.time+1;break;}room.food.push(point);}
}
function cellSnapshot(room,c){
  let id=room.cellIds.get(c);
  if(!id){id=String(++room.nextCellId);room.cellIds.set(c,id);}
  return{id,x:Math.round(c.x),y:Math.round(c.y),mass:Math.round(c.mass),color:c.color};
}
function snapshot(room){return {type:'state',mode:room.mode,autoSplitMass:autoSplitMassFor(room.physics),worldSize:room.worldSize,players:[...room.players.values()].map(p=>({id:p.id,name:p.name,tag:p.tag,color:p.color,npc:p.npc,movementStopped:!!p.movementStopped,cells:p.cells.map(c=>cellSnapshot(room,c))})),food:room.food,viruses:room.viruses};}
function cleanText(t,max=180){return String(t||'').replace(/[<>\u0000-\u001f\u007f]/g,'').trim().slice(0,max);}
function cleanTag(t){return cleanText(String(t||'').normalize('NFKC'),8).toUpperCase();}
function chatRecipients(room,p,channel){return [...room.players.values()].filter(x=>!x.npc&&(channel==='all'||(p.tag&&x.tag===p.tag)));}
module.exports={loadRegistry,MODES,WIDTH,MAX_CELLS,AUTO_SPLIT_MASS,autoSplitMassFor,feedIntervalFor,createRoom,join,respawn,point,stopMove,split,trySplit,feed,step,snapshot,cleanText,cleanTag,chatRecipients};

