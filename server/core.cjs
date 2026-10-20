'use strict';
const {makeVirus,stepViruses}=require('./virus.cjs');
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
function createRoom(mode){if(!MODES[mode])throw Error('Unknown mode');const room={mode,players:new Map(),food:[],viruses:[],time:0};
  for(let i=0;i<280;i++)room.food.push(newFood());
  for(let i=0;i<28;i++)room.viruses.push(makeVirus(C.rand(120,WIDTH-120),C.rand(120,WIDTH-120)));
  for(let i=0;i<MODES[mode].bots;i++){const bot=makePlayer(mode,BOTS[i],'',true);bot.cells[0].mass=C.rand(600,MODES[mode].initialMass*1.7);room.players.set(bot.id,bot);}
  return room;
}
function newFood(){return{x:C.rand(30,WIDTH-30),y:C.rand(30,WIDTH-30),mass:C.rand(8,23),color:COLORS[Math.floor(Math.random()*COLORS.length)]};}
function join(room,name,tag,slot=0){const p=makePlayer(room.mode,name,tag,false,slot);p.cells[0].x=C.rand(1600,3200);p.cells[0].y=C.rand(1600,3200);p.target={x:p.cells[0].x,y:p.cells[0].y};room.players.set(p.id,p);return p;}
function point(room,p,x,y){if(Number.isFinite(x)&&Number.isFinite(y)){p.target.x=C.clamp(x,0,WIDTH);p.target.y=C.clamp(y,0,WIDTH);}}
function split(room,p){let free=MAX_CELLS-p.cells.length;if(!free)return;for(const c of [...p.cells]){if(!free||c.mass<80)continue;
  const dx=p.target.x-c.x,dy=p.target.y-c.y,len=Math.hypot(dx,dy)||1;const nextMass=c.mass/2;c.mass=nextMass;
  const child=cell(C.clamp(c.x+dx/len*C.radius(nextMass)*1.1,0,WIDTH),C.clamp(c.y+dy/len*C.radius(nextMass)*1.1,0,WIDTH),nextMass,c.color);
  child.vx=dx/len*620;child.vy=dy/len*620;child.mergeAt=room.time+13;c.mergeAt=room.time+13;p.cells.push(child);free--;
}}
function feed(room,p){for(const c of p.cells){if(c.mass<100)continue;const dx=p.target.x-c.x,dy=p.target.y-c.y,len=Math.hypot(dx,dy)||1;c.mass-=22;room.food.push({x:C.clamp(c.x+dx/len*(C.radius(c.mass)+27),0,WIDTH),y:C.clamp(c.y+dy/len*(C.radius(c.mass)+27),0,WIDTH),mass:22,color:'#bdfdff',ejected:true,vx:dx/len*650,vy:dy/len*650});}}
function step(room,dt=1/30){dt=Math.min(.08,Math.max(0,dt));room.time+=dt;
  for(const p of room.players.values()){
    if(!p.cells.length)continue;
    if(p.npc){if(Math.random()<.015)p.heading=C.rand(0,Math.PI*2);const head=p.cells[0];p.target={x:C.clamp(head.x+Math.cos(p.heading)*500,0,WIDTH),y:C.clamp(head.y+Math.sin(p.heading)*500,0,WIDTH)};}
    for(const c of [...p.cells]){const dx=p.target.x-c.x,dy=p.target.y-c.y,length=Math.hypot(dx,dy),speed=C.clamp(520/Math.pow(Math.max(c.mass,25),0.18),78,420)*(p.npc?.74:1);
      if(length>3){const movement=Math.min(length,speed*dt);c.x+=dx/length*movement;c.y+=dy/length*movement;}
      c.x=C.clamp(c.x+c.vx*dt,10,WIDTH-10);c.y=C.clamp(c.y+c.vy*dt,10,WIDTH-10);c.vx*=Math.pow(.83,dt*30);c.vy*=Math.pow(.83,dt*30);
      if(c.mass>=AUTO_SPLIT_MASS&&p.cells.length<MAX_CELLS)split(room,p);
    }
    if(p.cells.length>1){for(let i=0;i<p.cells.length;i++)for(let j=i+1;j<p.cells.length;j++){const a=p.cells[i],b=p.cells[j];const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||.001;const minGap=C.radius(a.mass)+C.radius(b.mass)+8;if(dist<minGap){const push=(minGap-dist)*.5;const ux=dx/dist,uy=dy/dist;a.x=C.clamp(a.x-ux*push,10,WIDTH-10);a.y=C.clamp(a.y-uy*push,10,WIDTH-10);b.x=C.clamp(b.x+ux*push,10,WIDTH-10);b.y=C.clamp(b.y+uy*push,10,WIDTH-10);}}}
    if(p.cells.length>1)for(let i=0;i<p.cells.length;i++)for(let j=i+1;j<p.cells.length;j++){const a=p.cells[i],b=p.cells[j];if(room.time>a.mergeAt&&room.time>b.mergeAt&&Math.hypot(a.x-b.x,a.y-b.y)<C.radius(a)*.55){a.mass+=b.mass;p.cells.splice(j,1);j--;}}
    if(Math.random()<.004)for(const c of p.cells)c.mass*=.9985;
  }
  stepViruses({viruses:room.viruses,food:room.food,players:[...room.players.values()],width:WIDTH,maxCells:MAX_CELLS,time:room.time,dt,spawnVirus:()=>makeVirus(C.rand(120,WIDTH-120),C.rand(120,WIDTH-120))});
  for(const p of room.players.values())for(const c of p.cells){const r=C.radius(c.mass);for(let k=room.food.length-1;k>=0;k--){const f=room.food[k];if(Math.abs(c.x-f.x)<r&&Math.abs(c.y-f.y)<r&&Math.hypot(c.x-f.x,c.y-f.y)<r){c.mass+=f.mass;room.food.splice(k,1);}}}
  const all=[...room.players.values()];for(const a of all)for(const b of all){if(a===b)continue;for(const ac of a.cells)for(let i=b.cells.length-1;i>=0;i--){const bc=b.cells[i];if(ac.mass>bc.mass*1.25&&Math.hypot(ac.x-bc.x,ac.y-bc.y)<C.radius(ac)-C.radius(bc)*.34){ac.mass+=bc.mass;b.cells.splice(i,1);}}}
  for(const p of all){if(p.npc&&!p.cells.length){const spawned=makePlayer(room.mode,p.name,p.tag,true);p.cells=spawned.cells;p.heading=C.rand(0,Math.PI*2);}}
  while(room.food.length<280)room.food.push(newFood());if(room.food.length>650)room.food.splice(0,room.food.length-650);
}
function snapshot(room){return {type:'state',mode:room.mode,worldSize:WIDTH,players:[...room.players.values()].map(p=>({id:p.id,name:p.name,tag:p.tag,color:p.color,npc:p.npc,cells:p.cells.map(c=>({x:Math.round(c.x),y:Math.round(c.y),mass:Math.round(c.mass),color:c.color}))})),food:room.food,viruses:room.viruses};}
function cleanText(t,max=180){return String(t||'').replace(/[<>\u0000-\u001f\u007f]/g,'').trim().slice(0,max);}
function cleanTag(t){return cleanText(t,8).toUpperCase();}
function chatRecipients(room,p,channel){return [...room.players.values()].filter(x=>!x.npc&&(channel==='all'||(p.tag&&x.tag===p.tag)));}
module.exports={MODES,WIDTH,MAX_CELLS,AUTO_SPLIT_MASS,createRoom,join,point,split,feed,step,snapshot,cleanText,cleanTag,chatRecipients};
