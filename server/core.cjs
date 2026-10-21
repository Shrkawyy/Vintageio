'use strict';
const {makeVirus,stepViruses}=require('./virus.cjs');
const {splitCells,moveCells,eatCells,absorbFood}=require('./physics.cjs');
/** Authoritative, in-memory arena simulation. Three completely isolated rooms. */
const MODES={ffa:{name:'FREE FOR ALL',initialMass:1000,bots:10},dual:{name:'DUAL',initialMass:1000,bots:10},mega:{name:'MEGA',initialMass:5000,bots:10}};
const WIDTH=4800,MAX_CELLS=64,AUTO_SPLIT_MASS=25500;
const C={clamp:(n,min,max)=>Math.max(min,Math.min(max,n)),rand:(a,b)=>Math.random()*(b-a)+a,radius:m=>Math.max(13,Math.sqrt(Math.max(1,m))*2.45)};
const COLORS=['#ffb388','#b595fc','#86f6cd','#fa9dd7','#7cc3ed'];
const BOTS=['Pulsar','Neon','Rebel','Orbit','Meteor','Drift','Zenith','Astra','Noctis','Nova','Quasar','Vector'];
let nextId=0;
const uid=()=>String(++nextId);
function cell(x,y,mass,color){return{x,y,mass,color,vx:0,vy:0,mergeAt:0};}
function makePlayer(mode,name,tag,npc=false,slot=0){const config=MODES[mode];const color=npc?COLORS[Math.floor(C.rand(0,COLORS.length))]:(slot===0?'#70e0ff':'#ff88b0');const x=C.rand(300,WIDTH-300),y=C.rand(300,WIDTH-300);return{id:uid(),name,tag,npc,slot,color,target:{x,y},cells:[cell(x,y,config.initialMass,color)],heading:C.rand(0,Math.PI*2),lastChat:0};}
function createRoom(mode){if(!MODES[mode])throw Error('Unknown mode');const room={mode,players:new Map(),food:[],viruses:[],virusRespawns:[],time:0};
  for(let i=0;i<280;i++)room.food.push(newFood());
  for(let i=0;i<8;i++)room.viruses.push(makeVirus(C.rand(120,WIDTH-120),C.rand(120,WIDTH-120)));
  for(let i=0;i<MODES[mode].bots;i++){const bot=makePlayer(mode,BOTS[i],'',true);bot.cells[0].mass=C.rand(600,MODES[mode].initialMass*1.7);room.players.set(bot.id,bot);}
  return room;
}
function newFood(){return{x:C.rand(30,WIDTH-30),y:C.rand(30,WIDTH-30),mass:C.rand(8,23),color:COLORS[Math.floor(Math.random()*COLORS.length)]};}
function join(room,name,tag,slot=0){const p=makePlayer(room.mode,name,tag,false,slot);p.cells[0].x=C.rand(1600,3200);p.cells[0].y=C.rand(1600,3200);p.target={x:p.cells[0].x,y:p.cells[0].y};room.players.set(p.id,p);return p;}
function point(room,p,x,y){if(Number.isFinite(x)&&Number.isFinite(y)){p.target.x=C.clamp(x,0,WIDTH);p.target.y=C.clamp(y,0,WIDTH);}}
function respawn(room,p,x,y){
  if(!p||p.npc||p.cells.length||room.time<(p.lastRespawnAt??-100)+1.8)return false;
  const mass=MODES[room.mode].initialMass,r=C.radius(mass);
  const px=C.clamp(Number.isFinite(x)?x:WIDTH/2,r,WIDTH-r);
  const py=C.clamp(Number.isFinite(y)?y:WIDTH/2,r,WIDTH-r);
  p.cells=[cell(px,py,mass,p.color)];p.target={x:px,y:py};
  p.lastRespawnAt=room.time;p.spawnShieldUntil=room.time+1.5;
  return true;
}

function split(room,p){return splitCells(p,room.time,WIDTH,MAX_CELLS,room.mode);}
/** Network-facing split: allows a burst of 6 (macro splits), then refills 8 per second. Returns null when throttled. */
function trySplit(room,p){const t=room.time,last=p.splitRefillAt??t;p.splitTokens=Math.min(6,(p.splitTokens??6)+(t-last)*8);p.splitRefillAt=t;if(p.splitTokens<1)return null;p.splitTokens-=1;return split(room,p);}
function feed(room,p){for(const c of p.cells){if(c.mass<100)continue;const dx=p.target.x-c.x,dy=p.target.y-c.y,len=Math.hypot(dx,dy)||1;c.mass-=22;room.food.push({x:C.clamp(c.x+dx/len*(C.radius(c.mass)+27),0,WIDTH),y:C.clamp(c.y+dy/len*(C.radius(c.mass)+27),0,WIDTH),mass:22,color:'#bdfdff',ejected:true,vx:dx/len*650,vy:dy/len*650});}}
function step(room,dt=1/30){
  dt=Math.min(.08,Math.max(0,dt));room.time+=dt;
  for(const p of room.players.values()){
    if(!p.cells.length)continue;
    if(p.npc){
      if(Math.random()<dt*.6)p.heading=C.rand(0,Math.PI*2);
      const lead=p.cells[0];
      const dangers=[...room.players.values()].filter(x=>x!==p&&x.cells.length&&x.cells[0].mass>lead.mass*1.3&&Math.hypot(x.cells[0].x-lead.x,x.cells[0].y-lead.y)<460)
        .sort((a,b)=>Math.hypot(a.cells[0].x-lead.x,a.cells[0].y-lead.y)-Math.hypot(b.cells[0].x-lead.x,b.cells[0].y-lead.y));
      if(dangers.length)p.heading=Math.atan2(lead.y-dangers[0].cells[0].y,lead.x-dangers[0].cells[0].x);
      p.target={x:C.clamp(lead.x+Math.cos(p.heading)*520,0,WIDTH),y:C.clamp(lead.y+Math.sin(p.heading)*520,0,WIDTH)};
    }
    moveCells(p,dt,room.time,WIDTH,room.mode,p.npc?.73:1);
    if(p.cells.some(c=>c.mass>=AUTO_SPLIT_MASS)&&p.cells.length<MAX_CELLS)splitCells(p,room.time,WIDTH,MAX_CELLS,room.mode,AUTO_SPLIT_MASS);
    if(room.time%12<dt)for(const c of p.cells)c.mass*=.999;
  }
  // Check pending virus respawns
  for (let i = room.virusRespawns.length - 1; i >= 0; i--) {
    const resp = room.virusRespawns[i];
    if (room.time >= resp.time) {
      for (let k = 0; k < resp.count && room.viruses.length < 32; k++) {
        room.viruses.push(makeVirus(C.rand(120, WIDTH - 120), C.rand(120, WIDTH - 120)));
      }
      room.virusRespawns.splice(i, 1);
    }
  }
  stepViruses({viruses:room.viruses,food:room.food,players:[...room.players.values()],width:WIDTH,maxCells:MAX_CELLS,time:room.time,dt,
    spawnVirus:()=>makeVirus(C.rand(120,WIDTH-120),C.rand(120,WIDTH-120)),
    addRespawn:(time,count)=>room.virusRespawns.push({time,count})});
  const all=[...room.players.values()];
  absorbFood(all,room.food,room.mode);
  eatCells(all,room.mode,room.time);
  for(const p of all)if(p.npc&&!p.cells.length){const spawned=makePlayer(room.mode,p.name,p.tag,true);p.cells=spawned.cells;p.heading=C.rand(0,Math.PI*2);p.target=spawned.target;}
  while(room.food.length<280)room.food.push(newFood());if(room.food.length>650)room.food.splice(0,room.food.length-650);
}
function snapshot(room){return {type:'state',mode:room.mode,worldSize:WIDTH,players:[...room.players.values()].map(p=>({id:p.id,name:p.name,tag:p.tag,color:p.color,npc:p.npc,cells:p.cells.map(c=>({x:Math.round(c.x),y:Math.round(c.y),mass:Math.round(c.mass),color:c.color}))})),food:room.food,viruses:room.viruses};}
function cleanText(t,max=180){return String(t||'').replace(/[<>\u0000-\u001f\u007f]/g,'').trim().slice(0,max);}
function cleanTag(t){return cleanText(t,8).toUpperCase();}
function chatRecipients(room,p,channel){return [...room.players.values()].filter(x=>!x.npc&&(channel==='all'||(p.tag&&x.tag===p.tag)));}
module.exports={MODES,WIDTH,MAX_CELLS,AUTO_SPLIT_MASS,createRoom,join,respawn,point,split,trySplit,feed,step,snapshot,cleanText,cleanTag,chatRecipients};
