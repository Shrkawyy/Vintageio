'use strict';
const {dualTarKernel}=require('./dual-tar-kernel.cjs');
/** Portions derived from OgarX by Yuu6883, MIT License. See NOTICE-OGARX.txt.
 * Audited upstream: fba6402d8a9197c6940e6ff1d4224bee1eb2f19e.
 * API dt/time stay in seconds. OgarX simulation uses milliseconds * timeScale.
 * Distance conversion: Vintage = OgarX * 0.245; mass = OgarX radius^2 / 100.
 * The audited base is frozen; derived FFA/Dual/Mega presets apply requested mode tuning. */
const PHYSICS_CONFIG=Object.freeze({
  distanceScale:.245, // integration: keeps Vintage's 2.45*sqrt(mass) rendering
  timeScale:1.2, tickRate:20, // modes/default/ffa.js; engine.js DefaultSettings/start
  playerSpeed:1.5, movementFactor:1.76, movementPower:-.4396754, // core.c update_player_cells
  aimDeadZone:1, boostDecayPerMs:.0025, boostStop:1, // core.c update/update_player_cells
  ejectKickSize:100, ejectKickBoost:.025, ejectKickDirection:.02, // core.c resolve player/ejected
  eatMulti:1.140175425099138, eatOverlap:3, // engine.js DefaultSettings -> core.c resolve
  mergeInitial:20000, mergeIncrease:2, mergeTime:20, mergeVersionNew:false, // ffa.js; engine.js updatePlayerCells
  normalizer:1, normalizeThresholdMass:0, // engine.js DefaultSettings/updatePlayerCells
  noMergeDelay:650, noCollisionDelay:600, // engine.js DefaultSettings -> core.c
  decayMin:1000, staticDecay:1, dynamicDecay:1, decayScoreFactor:.00005, decayTimeFactor:.0001, // core.c update; ffa.js
  autoSize:1500, autoSplitDelay:100, maxCells:16, // engine.js DefaultSettings/updateTree; ffa.js
  splitBoost:800, splitDistance:40, minSplitSize:60, splitAttemptsPerTick:4, // engine.js handleInputs/splitFromCell
  ejectSize:39, ejectLoss:43, ejectBoost:780, ejectInterval:150, ejectDispersion:.3, // ffa.js; engine.js handleInputs
  minEjectSize:60, noEjectDelay:200, noEjectAfterPop:500, ejectMaxAge:30000, // engine.js DefaultSettings; ffa.js
  virusSize:100, virusFeedTimes:8, virusSplitBoost:780, virusPush:false, // ffa.js
  virusBoost:780, virusMaxBoost:1000, virusMonotonePop:false, // engine.js DefaultSettings
  virusCount:50, foodCount:5000, foodSize:20, spawnSize:200, mapHalfSize:12000, // ffa.js
  maxWorldCells:65535, deadDelay:5000, // engine.js CELL_LIMIT-1/PLAYER_DEAD_DELAY
  enableLineLock:false, // optional integration; DEEP_DIVE.md Directional Line Lock
  // Existing game services retained: NPC policy, ownership respawn and safe spawns.
  botMinMass:300, botMaxMass:1500, botRespawnSeconds:300,
  multiRespawnDelay:.25, loneRespawnDelay:1.8, spawnGap:24.5, spawnMargin:3.675,
  spatialBucket:125.44, // broad phase only: 512 OgarX distance units
  // Read-only compatibility names, derived from the same native configuration.
  get feedCost(){return this.ejectLoss**2/100;},get feedMass(){return this.ejectSize**2/100;},
  get feedRadius(){return this.ejectSize*this.distanceScale;},
  get feedSpeed(){return this.ejectBoost*this.distanceScale*this.boostDecayPerMs*1000*this.timeScale;},
  get feedDrag(){return this.boostDecayPerMs*1000*this.timeScale;},
  get feedInterval(){return this.ejectInterval/1000;},get macroFeedInterval(){return this.ejectInterval/1000;},
  get minSplitMass(){return this.minSplitSize**2/100;},get autoSplitMass(){return this.autoSize**2/100;},
  get splitImpulse(){return this.splitBoost*this.distanceScale*this.boostDecayPerMs*1000*this.timeScale;},
});
// Requested mode tuning; the underlying movement/split/merge kernel remains OgarX.
const PREVIOUS_FFA_PHYSICS=Object.freeze({...PHYSICS_CONFIG,spawnSize:Math.sqrt(100000),ejectStyle:'legacy',feedCost:30,feedMass:25,feedRadius:9.5,feedSpeed:450,feedDrag:4,feedSpread:.12,feedPlacement:'cell',feedInterval:.12,macroFeedInterval:.07,feedSourceGrace:.35,ownedFeedProtection:.3});
const MEGA_PHYSICS=Object.freeze({...PREVIOUS_FFA_PHYSICS,
  spawnSize:Math.sqrt(500000),autoSize:Math.sqrt(10000000),maxCells:64,
  // Mega feed tuning from the supplied video; cell movement and splits stay on
  // the existing OgarX profile. Feed never pushes other feed in this mode.
  feedInterval:.05,macroFeedInterval:.05,feedCost:40,feedMass:36,
  feedRadius:60*.245,feedDrawRadius:60*.245*1.65,feedSpeed:900,feedDrag:2.6,feedSpread:0,
  feedSourceGrace:.08,feedCollisions:false,maxFeedPellets:4096,ownedFeedProtection:.3});
// The archive's active FFA.onServerInit overrides its INI. Preserve Vintage's
// x16/spawn/map/auto threshold while selecting the audited movement kernel.
const DUAL_TAR_REFERENCE=Object.freeze({...PREVIOUS_FFA_PHYSICS,kernel:'dual-tar',timeScale:1,tickRate:25,
  movementFactor:2.2,movementPower:-.439,playerSpeed:1,splitBoost:920,splitDistance:0,minSplitSize:121,minimumSourceSize:85,
  splitAttemptsPerTick:1,mergeTime:30,noCollisionDelay:520,eatMulti:1.15,eatOverlap:3,sourceDecayRate:.002,noDecaySize:316.227766,
  boostDecayPerMs:-Math.log(8/9)*25/1000,ejectStyle:'dual-tar',ejectSize:45,ejectLoss:50,minEjectSize:59.16079783,ejectBoost:780,
  ejectInterval:40,feedInterval:.04,macroFeedInterval:.04,feedCost:25,feedMass:20.25,feedRadius:45*.245,
  feedSpeed:780*.245*25/9,feedDrag:25/9,feedSourceGrace:0,ownedFeedProtection:0,virusSize:200,virusCount:16,virusMaxCount:50,
  virusPopSize:60,playerBotGrow:false});
// Visible split separation calibrated against the supplied Oct 27 MegaSplitX
// recording. Feed mass/cost are Vintage tuning choices, not recovered constants.
const FFA_PHYSICS=Object.freeze({...DUAL_TAR_REFERENCE,reference:'senpa-video-2026-10-27',
  splitBoost:800,noCollisionDelay:640,siblingPush:.35,autoSize:Math.sqrt(10000000),
  feedCost:40,feedMass:36,feedRadius:60*.245,ejectSize:60,ejectLoss:Math.sqrt(4000),minEjectSize:100,
  ejectDispersion:.025,symmetricFeed:true,sweptFeed:true,emitterGrace:.08,runSplitInterval:.12});
const DUAL_PHYSICS=Object.freeze({...FFA_PHYSICS,spawnSize:Math.sqrt(50000)});
const OTHER_PHYSICS=FFA_PHYSICS;
const PHYSICS_PRESETS=Object.freeze({vintage_ffa:FFA_PHYSICS,senpa_ffa:FFA_PHYSICS,ffa:FFA_PHYSICS,senpa:DUAL_PHYSICS,dual:DUAL_PHYSICS,aster:DUAL_PHYSICS,classic:FFA_PHYSICS,macro:FFA_PHYSICS,senpa_mega:MEGA_PHYSICS,aster_mega:MEGA_PHYSICS,arab:MEGA_PHYSICS,gota:MEGA_PHYSICS,mega:MEGA_PHYSICS});
const physicsFor=key=>key&&typeof key==='object'?key:PHYSICS_PRESETS[key]||FFA_PHYSICS;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const cellRadius=mass=>PHYSICS_CONFIG.distanceScale*10*Math.sqrt(Math.max(0,Number(mass)||0));
const worldSizeFor=()=>PHYSICS_CONFIG.mapHalfSize*2*PHYSICS_CONFIG.distanceScale;
const foodTargetFor=()=>PHYSICS_CONFIG.foodCount;
const virusTargetFor=(key='ffa')=>physicsFor(key).virusCount;
const autoSplitMassFor=key=>{const mass=physicsFor(key).autoSize**2/100,integer=Math.round(mass);return Math.abs(mass-integer)<1e-8?integer:mass;};
const feedIntervalFor=(key='ffa',macro=false)=>{const c=physicsFor(key);return c.ejectStyle==='legacy'?(macro?c.macroFeedInterval:c.feedInterval):c.ejectInterval/1000;};
function mergeDelayFor(mass,key='ffa'){
  const c=physicsFor(key),r=10*Math.sqrt(Math.max(0,mass));
  if(c.kernel==='dual-tar')return dualTarKernel.mergeDelay(mass,c);
  const ms=c.mergeTime>0?c.normalizer*(c.mergeVersionNew?Math.max(25*r*c.mergeIncrease,c.mergeInitial):c.mergeInitial+c.mergeIncrease):c.noMergeDelay;
  return ms/(1000*c.timeScale);
}
function cellSpeed(mass,key='ffa'){
  const c=physicsFor(key),r=Math.max(Number.MIN_VALUE,10*Math.sqrt(Math.max(0,mass)));
  if(c.kernel==='dual-tar')return dualTarKernel.speed(mass,c);
  return c.movementFactor*Math.pow(r,c.movementPower)*c.playerSpeed*c.distanceScale*1000*c.timeScale;
}
function respawnDelayFor(player,players,key='ffa'){
  const linked=player?.multiKey&&!player.npc&&players.some(other=>other!==player&&!other.npc&&other.multiKey===player.multiKey&&other.cells?.length);
  const c=physicsFor(key);return linked?c.multiRespawnDelay:c.loneRespawnDelay;
}
const BOT_MIN_MASS=PHYSICS_CONFIG.botMinMass;
const BOT_MAX_MASS=PHYSICS_CONFIG.botMaxMass;
const BOT_RESPAWN_SECONDS=PHYSICS_CONFIG.botRespawnSeconds;
const randomBotMass=(random=Math.random)=>Math.min(BOT_MAX_MASS,Math.floor(BOT_MIN_MASS+random()*(BOT_MAX_MASS-BOT_MIN_MASS+1)));

/** Sight is independent of camera zoom: a 3x3 sector neighborhood per owned connection. */
function limitVisibility(state,ownedIds){
  if(state.mode!=='ffa'||!ownedIds?.length)return state;
  const width=state.worldSize||worldSizeFor('ffa'),step=width/5,owned=new Set(ownedIds),vision=[];
  const group=p=>p.teamId??String(p.tag||'').trim().toUpperCase();
  const self=state.players.find(p=>owned.has(p.id));
  // HUD peers are aggregate team markers, never distant world fragments.
  const peers=state.players.filter(p=>p.cells?.length&&self&&group(p)===group(self)).map(p=>{
    const mass=p.cells.reduce((s,c)=>s+c.mass,0)||1;
    return{id:p.id,name:p.name,color:p.color,npc:p.npc,...(p.titleId?{titleId:p.titleId}:{}),...(p.teamId!=null?{teamId:p.teamId}:{tag:p.tag}),
      cells:[{mass,x:p.cells.reduce((s,c)=>s+c.x*c.mass,0)/mass,y:p.cells.reduce((s,c)=>s+c.y*c.mass,0)/mass}]};
  });
  for(const p of state.players){
    if(!owned.has(p.id)||!p.cells?.length)continue;
    const total=p.cells.reduce((s,c)=>s+c.mass,0)||1;
    const x=p.cells.reduce((s,c)=>s+c.x*c.mass,0)/total,y=p.cells.reduce((s,c)=>s+c.y*c.mass,0)/total;
    const col=Math.max(0,Math.min(4,Math.floor(x/step))),row=Math.max(0,Math.min(4,Math.floor(y/step)));
    const rect={left:Math.max(0,col-1)*step,top:Math.max(0,row-1)*step,right:Math.min(5,col+2)*step,bottom:Math.min(5,row+2)*step};
    if(!vision.some(v=>v.left===rect.left&&v.top===rect.top&&v.right===rect.right&&v.bottom===rect.bottom))vision.push(rect);
  }
  const visible=(point,r=0)=>vision.some(v=>point.x+r>=v.left&&point.x-r<=v.right&&point.y+r>=v.top&&point.y-r<=v.bottom);
  return {...state,vision,peers,players:state.players.flatMap(p=>{
    if(owned.has(p.id))return[p];
    const cells=(p.cells||[]).filter(c=>visible(c,cellRadius(c.mass)));
    return cells.length?[{...p,cells}]:[];
  }),food:(state.food||[]).filter(f=>visible(f,f.radius??Math.sqrt(f.mass)*1.7)),viruses:(state.viruses||[]).filter(v=>visible(v,55))};
}
/** Find free space against EVERY fragment, including large split players. Never force an overlapping spawn. */
function findSafeSpawn(players,mass,width,gap=PHYSICS_CONFIG.spawnGap,random=Math.random,preferred=null){
  const r=cellRadius(mass),margin=r+PHYSICS_CONFIG.spawnMargin;
  if(margin*2>width)return null;
  const cells=players.flatMap(p=>p.cells||[]);
  const safe=point=>Number.isFinite(point?.x)&&Number.isFinite(point?.y)&&point.x>=margin&&point.x<=width-margin&&point.y>=margin&&point.y<=width-margin&&cells.every(c=>Math.hypot(c.x-point.x,c.y-point.y)>=cellRadius(c.mass)+r+gap);
  if(preferred&&safe(preferred))return{x:preferred.x,y:preferred.y};
  if(preferred&&Number.isFinite(preferred.x)&&Number.isFinite(preferred.y)){
    // A blocked requested respawn stays near that point instead of jumping across the map.
    let nearest=null,best=Infinity;
    const consider=point=>{
      if(!safe(point))return;
      const d=Math.hypot(point.x-preferred.x,point.y-preferred.y);
      if(d<best){nearest=point;best=d;}
    };
    consider({x:clamp(preferred.x,margin,width-margin),y:clamp(preferred.y,margin,width-margin)});
    for(const c of cells){
      const base=Math.atan2(preferred.y-c.y,preferred.x-c.x),clearance=cellRadius(c.mass)+r+gap+.1;
      for(let i=0;i<64;i++){
        const angle=base+i*Math.PI*2/64;
        consider({x:clamp(c.x+Math.cos(angle)*clearance,margin,width-margin),y:clamp(c.y+Math.sin(angle)*clearance,margin,width-margin)});
      }
    }
    if(nearest)return nearest;
  }
  for(let i=0;i<64;i++){const point={x:margin+random()*(width-margin*2),y:margin+random()*(width-margin*2)};if(safe(point))return point;}
  // A deterministic grid also handles an unlucky random generator or crowded arenas.
  let best=null,bestDistance=Infinity;
  for(let x=0;x<11;x++)for(let y=0;y<11;y++){
    const point={x:margin+x*(width-margin*2)/10,y:margin+y*(width-margin*2)/10};
    if(!safe(point))continue;
    const d=preferred?Math.hypot(point.x-preferred.x,point.y-preferred.y):0;
    if(d<bestDistance){best=point;bestDistance=d;}
  }
  return best;
}

/** Owned connections spawn beside a real sibling fragment, never at a remote fallback. */
function findPlayerSpawn(players,player,mass,width,gap=PHYSICS_CONFIG.spawnGap,random=Math.random,preferred=null){
  const siblings=player.multiKey?players.filter(p=>p!==player&&!p.npc&&p.multiKey===player.multiKey).flatMap(p=>p.cells||[]):[];
  if(!siblings.length)return findSafeSpawn(players.filter(p=>p!==player),mass,width,gap,random,preferred);
  const wanted=preferred||siblings[0],r=cellRadius(mass),margin=r+PHYSICS_CONFIG.spawnMargin;
  const anchors=[...siblings].sort((a,b)=>(Math.hypot(a.x-wanted.x,a.y-wanted.y)-cellRadius(a.mass))-(Math.hypot(b.x-wanted.x,b.y-wanted.y)-cellRadius(b.mass)));
  const cells=players.filter(p=>p!==player).flatMap(p=>p.cells||[]);
  for(const anchor of anchors){
    const base=Math.atan2(wanted.y-anchor.y,wanted.x-anchor.x),edge=cellRadius(anchor.mass)+r+Math.max(32*PHYSICS_CONFIG.distanceScale,gap);
    // Search rings in cursor order. Crowding can delay a spawn, but cannot move it across the map.
    for(const extra of [0,40,90,160,240])for(let i=0;i<64;i++){
      const offset=i===0?0:Math.ceil(i/2)*(i%2?1:-1)*Math.PI*2/64,angle=base+offset;
      const point={x:anchor.x+Math.cos(angle)*(edge+extra*PHYSICS_CONFIG.distanceScale),y:anchor.y+Math.sin(angle)*(edge+extra*PHYSICS_CONFIG.distanceScale)};
      if(point.x<margin||point.x>width-margin||point.y<margin||point.y>width-margin)continue;
      if(cells.every(c=>Math.hypot(point.x-c.x,point.y-c.y)>=cellRadius(c.mass)+r+gap))return point;
    }
  }
  return null;
}

function maintainBots(players,time,width,random=Math.random){
  for(const p of players){
    if(!p.npc)continue;
    if(p.cells.length){
      const mass=p.cells.reduce((s,c)=>s+c.mass,0);
      if(mass>BOT_MAX_MASS)for(const c of p.cells)c.mass*=BOT_MAX_MASS/mass;
      p.respawnAt=null;continue;
    }
    if(p.respawnAt==null)p.respawnAt=time+BOT_RESPAWN_SECONDS;
    if(time<p.respawnAt||time<(p.nextSpawnAttemptAt||0))continue;
    const mass=randomBotMass(random),point=findSafeSpawn(players,mass,width,PHYSICS_CONFIG.spawnGap,random);
    if(!point){p.nextSpawnAttemptAt=time+1;continue;}
    p.cells=[{...point,mass,color:p.color,age:0,boost:0,boostX:0,boostY:0,vx:0,vy:0}];p.target={...point};
    p.heading=random()*Math.PI*2;p.aiHuntUntil=0;p.respawnAt=null;p.nextSpawnAttemptAt=0;p.pendingSplits=[];p.spawnShieldUntil=time+1.5;
  }
}

let nextPhysicsId=0,nextFeedId=0;
const FEED_COLORS=Object.freeze(['#60cfe7','#d991ff','#f39dc8','#7fdfbc','#efca87']);
const simMs=(dt,c)=>Math.max(0,Number(dt)||0)*1000*c.timeScale;
const radiusFor=(cell,c)=>cell.ejected&&Number.isFinite(cell.radius)?cell.radius:c.distanceScale*10*Math.sqrt(Math.max(0,cell.mass||0));

function initialize(cell,time,c,newborn=false){

  if(!Number.isFinite(cell.age))cell.age=newborn||!Number.isFinite(time)?0:Math.max(0,time-(cell.bornAt??0))*1000*c.timeScale;

  cell.physicsId??=++nextPhysicsId;

  if(!Number.isFinite(cell.boost)){

    const vx=cell.vx||0,vy=cell.vy||0,length=Math.hypot(vx,vy);

    cell.boost=length/(cell.ejected&&Number.isFinite(cell.drag)?cell.drag:c.boostDecayPerMs*1000*c.timeScale);

    cell.boostX=length?vx/length:0;cell.boostY=length?vy/length:0;

  }

  cell.boostX??=0;cell.boostY??=0;

  return cell;

}
function velocity(cell,c){

  const speed=cell.boost>c.boostStop*c.distanceScale?cell.boost*(cell.ejected&&Number.isFinite(cell.drag)?cell.drag:c.boostDecayPerMs*1000*c.timeScale):0;

  cell.vx=cell.boostX*speed;cell.vy=cell.boostY*speed;

}
function setBoost(cell,x,y,magnitude,c){
  const length=Math.hypot(x,y);cell.boost=magnitude;
  cell.boostX=length?x/length:0;cell.boostY=length?y/length:0;velocity(cell,c);
}
function bound(cell,width,c){
  const r=Math.min(width/2,radiusFor(cell,c)),bounce=cell.boost>c.boostStop*c.distanceScale;
  if(cell.x<r){cell.x=r;if(bounce)cell.boostX=-cell.boostX;cell.updated=true;cell.hitWall=true;}
  else if(cell.x>width-r){cell.x=width-r;if(bounce)cell.boostX=-cell.boostX;cell.updated=true;cell.hitWall=true;}
  if(cell.y<r){cell.y=r;if(bounce)cell.boostY=-cell.boostY;cell.updated=true;cell.hitWall=true;}
  else if(cell.y>width-r){cell.y=width-r;if(bounce)cell.boostY=-cell.boostY;cell.updated=true;cell.hitWall=true;}
  velocity(cell,c);
}
/** Exact integral of core.c's db/dt=.0025*boost, removing its Euler tick-rate error. */
function advanceBoost(cell,dt,width,key='ffa'){

  const c=physicsFor(key);if(c.kernel==='dual-tar')return dualTarKernel.boost(cell,dt,width,c);initialize(cell,0,c);

  const stop=c.boostStop*c.distanceScale,rate=cell.ejected&&Number.isFinite(cell.drag)?cell.drag/(1000*c.timeScale):c.boostDecayPerMs;

  if(cell.boost>stop){

    const db=cell.boost-Math.max(stop,cell.boost*Math.exp(-rate*simMs(dt,c)));

    cell.x+=cell.boostX*db;cell.y+=cell.boostY*db;cell.boost-=db;cell.updated=true;

  }else cell.boost=stop;

  if(Number.isFinite(width))bound(cell,width,c);else velocity(cell,c);

}
function aim(player,cell,c){
  const dx=(player.target?.x??cell.x)-cell.x,dy=(player.target?.y??cell.y)-cell.y,d=Math.hypot(dx,dy);
  return d<c.aimDeadZone*c.distanceScale?{x:1,y:0}:{x:dx/d,y:dy/d};
}
function fragment(player,parent,mass,ux,uy,boost,time,width,c){
  if(!(mass>0&&mass<parent.mass))return null;
  const x=parent.x,y=parent.y;parent.mass-=mass;parent.updated=true;
  const child={x:x+ux*c.splitDistance*c.distanceScale,y:y+uy*c.splitDistance*c.distanceScale,
    originX:x,originY:y,mass,color:parent.color,age:0,bornAt:time,mergeAt:time+mergeDelayFor(mass,c)};
  initialize(child,time,c,true);setBoost(child,ux,uy,boost*c.distanceScale,c);bound(child,width,c);
  return child;
}
function splitCell(player,cell,time,width,key='ffa'){

  if(!player?.cells?.includes(cell))return null;

  const c=physicsFor(key);if(c.kernel==='dual-tar')return dualTarKernel.splitCell(player,cell,time,width,c);initialize(cell,time,c);

  if(radiusFor(cell,c)<c.minSplitSize*c.distanceScale)return null;

  const u=aim(player,cell,c);

  return fragment(player,cell,cell.mass/2,u.x,u.y,c.splitBoost,time,width,c);

}
function splitCells(player,time,width,maxCells,key='ffa',minimumMass=null){
  if(!player?.cells?.length)return 0;
  const c=physicsFor(key),cap=Math.min(maxCells,c.maxCells);let count=0;
  if(minimumMass!==null)return autoSplitCells(player,time,width,cap,c);
  for(const cell of [...player.cells]){
    if(player.cells.length>=cap)break;
    const child=splitCell(player,cell,time,width,c);if(child){player.cells.push(child);count++;}
  }
  return count;
}
function startSplitMacro(player,count,time,width,maxCells,key='ffa'){
  if(!player?.cells?.length)return 0;
  const c=physicsFor(key),rounds=Math.max(1,Math.min(6,Math.floor(Number(count)||1)));
  // OgarX handles up to four requested split rounds in one physics update.
  let spawned=0;
  for(let i=0;i<Math.min(rounds,c.splitAttemptsPerTick);i++)spawned+=splitCells(player,time,width,maxCells,c);
  player.pendingSplits=Array.from({length:Math.max(0,rounds-c.splitAttemptsPerTick)},()=>time);
  return spawned;
}
function stepSplitMacro(player,time,width,maxCells,key='ffa'){
  if(!player?.cells?.length){if(player)player.pendingSplits=[];return;}
  const c=physicsFor(key);let attempts=c.splitAttemptsPerTick;
  while(attempts--&&player.pendingSplits?.length){player.pendingSplits.shift();splitCells(player,time,width,maxCells,c);}
}
/** Held run-split is independent of OS key-repeat and never steals a split macro. */
function setRunSplitHeld(player,held,time,key='ffa'){
  if(!player||typeof held!=='boolean')return false;
  const changed=player.inputRunSplitHeld!==held;player.inputRunSplitHeld=held;
  if(held&&changed)player.inputRunSplitNextAt=Math.max(time,(player.lastRunSplitAt??-Infinity)+(physicsFor(key).runSplitInterval??.12));
  return changed;
}
function stepHeldRunSplit(players,time,width,maxCells,key='ffa'){
  const interval=physicsFor(key).runSplitInterval??.12;let count=0;
  for(const player of players){
    if(!player.inputRunSplitHeld)continue;
    if(!player.cells?.length||time>=(player.inputRunSplitLeaseUntil??Infinity)){setRunSplitHeld(player,false,time,key);continue;}
    if(time+1e-9<(player.inputRunSplitNextAt??time)||player.pendingSplits?.length)continue;
    count+=splitCells(player,time,width,maxCells,key);player.lastRunSplitAt=time;player.inputRunSplitNextAt=time+interval;
  }return count;
}
function autoSplitCells(player,time,width,maxCells,key='ffa'){
  if(!player?.cells?.length)return 0;
  const c=physicsFor(key);if(c.kernel==='dual-tar')return dualTarKernel.autoSplit(player,time,width,maxCells,c);if(!c.autoSize)return 0;
  let count=0;
  for(const cell of [...player.cells]){
    initialize(cell,time,c);
    if(cell.mass<=c.autoSize*c.autoSize/100){cell.autoSplitPending=false;continue;}
    if(!cell.autoSplitPending){cell.autoSplitPending=true;cell.age=0;continue;}
    if(cell.age<=c.autoSplitDelay)continue;
    const pieces=Math.min(Math.ceil(cell.mass/(c.autoSize*c.autoSize/100)),Math.min(maxCells,c.maxCells)-player.cells.length+1);
    if(pieces<=1)continue;
    const each=cell.mass/pieces;
    for(let i=1;i<pieces;i++){
      const a=Math.random()*Math.PI*2,child=fragment(player,cell,each,Math.sin(a),Math.cos(a),c.splitBoost,time,width,c);
      if(child){player.cells.push(child);count++;}
    }
    cell.autoSplitPending=false;
  }
  return count;
}
function decayMass(players,dt,key='ffa'){
  const c=physicsFor(key),elapsed=simMs(dt,c),minimum=c.decayMin*c.decayMin/100;
  if(c.kernel==='dual-tar')return dualTarKernel.decayMass(players,dt,c);
  for(const player of players){
    const score=(player.cells||[]).reduce((sum,cell)=>sum+cell.mass,0);
    const multi=Math.max(1,(score-minimum)*c.decayScoreFactor*c.dynamicDecay);
    for(const cell of player.cells||[]){
      if(cell.dead||cell.mass<=minimum)continue;
      const factor=Math.max(0,1-multi*(c.staticDecay*.01)*elapsed*c.decayTimeFactor);
      cell.mass*=factor*factor;
    }
  }
}
function setLineLock(player,enabled,key='ffa'){
  const c=physicsFor(key);
  if(!enabled){delete player.lockedLine;return true;}
  if(!c.enableLineLock||player.cells?.length!==1)return false;
  const cell=player.cells[0],dx=(player.target?.x??cell.x)-cell.x,dy=(player.target?.y??cell.y)-cell.y,d=Math.hypot(dx,dy);
  if(!d)return false;
  player.lockedLine={x:cell.x,y:cell.y,ux:dx/d,uy:dy/d,target:{...player.target}};return true;
}
function projectLine(player,c){
  const line=c.enableLineLock&&player.lockedLine;if(!line)return;
  if(player.cells.some(cell=>cell.hitWall)){delete player.lockedLine;return;}
  for(const cell of player.cells){const along=(cell.x-line.x)*line.ux+(cell.y-line.y)*line.uy;cell.x=line.x+along*line.ux;cell.y=line.y+along*line.uy;}
}
function moveCells(player,dt,time,width,key='ffa',sensitivity=1){
  if(!player?.cells?.length||!(dt>0))return;
  const c=physicsFor(key),elapsed=simMs(dt,c);
  if(c.kernel==='dual-tar')return dualTarKernel.moveCells(player,dt,time,width,c,sensitivity);
  for(const cell of player.cells){
    initialize(cell,time-dt,c);cell.age+=elapsed;cell.inside=false;cell.updated=false;cell.hitWall=false;
    advanceBoost(cell,dt,undefined,c);
    if(cell.dead){if(cell.age>c.deadDelay)cell.removed=true;bound(cell,width,c);continue;}
    const target=c.enableLineLock&&player.lockedLine?player.lockedLine.target:player.target;
    const dx=(target?.x??cell.x)-cell.x,dy=(target?.y??cell.y)-cell.y,d=Math.hypot(dx,dy)/c.distanceScale;
    if(!player.movementStopped&&d>=c.aimDeadZone){
      const r=radiusFor(cell,c)/c.distanceScale,speed=c.movementFactor*Math.pow(r,c.movementPower)*c.playerSpeed*sensitivity;
      const step=Math.min(speed,d)*elapsed*c.distanceScale,length=Math.hypot(dx,dy);
      cell.x+=dx/length*step;cell.y+=dy/length*step;
    }
    bound(cell,width,c);
  }
  if(!player.deferCellResolution)resolveOwn(player,time,width,c);
}
function ready(cell,time,c){
  initialize(cell,time,c);
  const r=radiusFor(cell,c)/c.distanceScale;
  const threshold=c.mergeTime>0?c.normalizer*(c.mergeVersionNew?Math.max(25*r*c.mergeIncrease,c.mergeInitial):c.mergeInitial+c.mergeIncrease):c.noMergeDelay;
  return cell.age>threshold;
}
function push(a,b,c){
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),r1=radiusFor(a,c),r2=radiusFor(b,c),overlap=r1+r2-d;
  if(!(d>0&&overlap>0))return false;
  const area1=r1*r1,area2=r2*r2,total=area1+area2;
  if(d+r2<r1)b.inside=true;
  const first=Math.min(overlap,r1)*area2/total,second=Math.min(overlap,r2)*area1/total;
  a.x-=dx/d*first;a.y-=dy/d*first;b.x+=dx/d*second;b.y+=dy/d*second;
  a.updated=b.updated=true;return true;
}
function canEat(a,b,same,c){
  const r1=radiusFor(a,c),r2=radiusFor(b,c);
  return r1>=r2&&(same||r1>r2*c.eatMulti)&&Math.hypot(a.x-b.x,a.y-b.y)<r1-r2/c.eatOverlap;
}
function consume(a,b,kind,c,kick=true){
  a.mass+=b.mass;a.updated=true;b.removed=true;b.eatenBy=a.physicsId;
  if(kick&&kind==='ejected'){
    const ratio=radiusFor(b,c)/(radiusFor(a,c)+c.ejectKickSize*c.distanceScale);
    const boost=(a.boost||0)+ratio*c.ejectKickBoost*(b.boost||0);
    setBoost(a,(a.boostX||0)+ratio*c.ejectKickDirection*(b.boostX||0),(a.boostY||0)+ratio*c.ejectKickDirection*(b.boostY||0),boost,c);
  }
}
function ordered(entries,c){return entries.sort((a,b)=>(a.cell.boost||0)-(b.cell.boost||0)||radiusFor(a.cell,c)-radiusFor(b.cell,c)||a.cell.physicsId-b.cell.physicsId);}
function resolveOwn(player,time,width,c,mergeOnly=false){
  let eaten=0;
  const cells=ordered(player.cells.map(cell=>({cell:initialize(cell,time,c)})),c).map(e=>e.cell),pairs=new Set();
  for(const a of cells){
    if(a.removed||a.inside)continue;
    for(const b of cells){
      if(a===b||b.removed||b.inside||a.mass<b.mass)continue;
      const pair=a.physicsId<b.physicsId?a.physicsId+':'+b.physicsId:b.physicsId+':'+a.physicsId;
      if(pairs.has(pair))continue;pairs.add(pair);
      if(ready(a,time,c)&&ready(b,time,c)){
        if(canEat(a,b,true,c)){consume(a,b,'player',c);eaten++;}
      }else if(!mergeOnly&&a.age>c.noCollisionDelay&&b.age>c.noCollisionDelay)push(a,b,c);
    }
  }
  player.cells=player.cells.filter(cell=>!cell.removed);projectLine(player,c);return eaten;
}
function mergeCells(player,time,width,key='ffa'){const c=physicsFor(key);return player?.cells?.length?(c.kernel==='dual-tar'?dualTarKernel.mergeCells(player,time,width,c):resolveOwn(player,time,width,c,true)):0;}
/** Faithful port of engine.js distributeCellMass, called with post-virus mass. */
function distributeCellMass(mass,currentCount,key='ffa',maxCells=physicsFor(key).maxCells){
  const c=physicsFor(key);let cellsLeft=Math.min(maxCells,c.maxCells)-currentCount;
  if(c.kernel==='dual-tar')return dualTarKernel.popParts(mass,currentCount,c,maxCells);
  if(cellsLeft<=0)return [];
  const splitMin=c.minSplitSize*c.minSplitSize/100;
  if(c.virusMonotonePop){const amount=Math.min(Math.floor(mass/splitMin),cellsLeft);return new Array(amount).fill(mass/(amount+1));}
  if(mass/cellsLeft<splitMin){
    let amount=2,perPiece;
    while((perPiece=mass/(amount+1))>=splitMin&&amount*2<=cellsLeft)amount*=2;
    // Guard upstream's two-piece minimum when only one slot is left.
    if(amount>cellsLeft){amount=cellsLeft;perPiece=mass/(amount+1);}
    return new Array(amount).fill(perPiece);
  }
  const splits=[];let nextMass=mass/2,massLeft=mass/2;
  while(cellsLeft>0){
    if(nextMass/cellsLeft<splitMin)break;
    while(nextMass>=massLeft&&cellsLeft>1)nextMass/=2;
    splits.push(nextMass);massLeft-=nextMass;cellsLeft--;
  }
  nextMass=massLeft/cellsLeft;return splits.concat(new Array(cellsLeft).fill(nextMass));
}
function popPlayer(player,cell,time,width,maxCells,key='ffa'){
  if(physicsFor(key).kernel==='dual-tar')return dualTarKernel.pop(player,cell,time,width,maxCells,physicsFor(key));
  const c=physicsFor(key),parts=distributeCellMass(cell.mass,player.cells.length,c,maxCells);
  player.lastPopAt=time;delete player.lockedLine;cell.popped=true;
  for(const mass of parts){const a=Math.random()*Math.PI*2,child=fragment(player,cell,mass,Math.sin(a),Math.cos(a),c.splitBoost,time,width,c);if(child)player.cells.push(child);}
  return parts.length;
}
/** Input scheduling follows the supplied clients' start/stop macro protocol.
 * Cadence remains a Vintage mode rule: the add-ons do not contain Senpa's solver. */
function setFeedHeld(player,held,macro,time,key='ffa'){
  if(!player||typeof held!=='boolean'||typeof macro!=='boolean')return false;
  const changed=player.inputFeedHeld!==held||player.inputFeedMacro!==macro;
  player.inputFeedHeld=held;player.inputFeedMacro=macro;
  if(held&&changed)player.inputFeedNextAt=Math.max(time,(player.lastInputFeedAt??-Infinity)+feedIntervalFor(key,macro));
  return changed;
}
function requestFeedInput(player,food,time,width,key='ffa',players=[],macro=false,continuous=false){
  if(!player?.cells?.length||time+1e-9<(player.inputFeedNextAt??-Infinity)||time<=(player.lastInputFeedAt??-Infinity)+1e-9)return 0;
  const interval=feedIntervalFor(key,macro),due=player.inputFeedNextAt??time;
  player.lastInputFeedAt=time;
  // Retain fractional deadlines so a 70 ms cadence is not rounded to 100 ms
  // every tick. Missed volleys during a stall are discarded, never replayed.
  player.inputFeedNextAt=continuous&&due+interval>time+1e-9?due+interval:time+interval;
  return ejectMass(player,food,time,width,key,players);
}
function stepHeldFeed(players,food,time,width,key='ffa'){
  let count=0;
  for(const player of players){
    if(!player.inputFeedHeld)continue;
    if(!player.cells?.length||time>=(player.inputFeedLeaseUntil??Infinity)){setFeedHeld(player,false,false,time,key);continue;}
    count+=requestFeedInput(player,food,time,width,key,players,player.inputFeedMacro,true);
  }
  return count;
}
function ejectMass(player,food,time,width,key='ffa',players=[]){
  if(!player?.cells?.length)return 0;
  const c=physicsFor(key);if(c.kernel==='dual-tar')return dualTarKernel.eject(player,food,time,width,c);if(c.ejectStyle==='legacy')return legacyEjectMass(player,food,time,width,c,players);
  if(time<(player.lastPopAt??-Infinity)+c.noEjectAfterPop/1000)return 0;
  let count=0;
  for(const cell of player.cells){
    initialize(cell,time,c);
    if(cell.age<c.noEjectDelay||radiusFor(cell,c)<c.minEjectSize*c.distanceScale)continue;
    const u=aim(player,cell,c),r=radiusFor(cell,c),angle=Math.atan2(u.x,u.y)-c.ejectDispersion+Math.random()*2*c.ejectDispersion;
    const pellet={x:cell.x+u.x*r,y:cell.y+u.y*r,mass:c.ejectSize*c.ejectSize/100,radius:c.ejectSize*c.distanceScale,
      feedId:++nextFeedId,color:FEED_COLORS[nextFeedId%FEED_COLORS.length],ejected:true,ownerId:player.id,age:0,bornAt:time,
      expiresAt:time+c.ejectMaxAge/(1000*c.timeScale),drag:c.boostDecayPerMs*1000*c.timeScale};
    initialize(pellet,time,c,true);setBoost(pellet,Math.sin(angle),Math.cos(angle),c.ejectBoost*c.distanceScale,c);
    cell.mass-=c.ejectLoss*c.ejectLoss/100;cell.updated=true;
    bound(pellet,width,c);food.push(pellet);count++;
  }
  return count;
}
class SpatialIndex{
  constructor(entries,size,c){this.size=size;this.c=c;this.buckets=new Map();this.keys=new Map();this.ranges=new Map();for(const e of entries)this.update(e);}
  range(e){const r=radiusFor(e.cell,this.c),s=this.size;return[Math.floor((e.cell.x-r)/s),Math.floor((e.cell.x+r)/s),Math.floor((e.cell.y-r)/s),Math.floor((e.cell.y+r)/s)];}
  update(e){
    const range=this.range(e),signature=range.join(',');if(this.ranges.get(e)===signature)return;this.ranges.set(e,signature);
    for(const key of this.keys.get(e)||[]){const set=this.buckets.get(key);set.delete(e);if(!set.size)this.buckets.delete(key);}
    const keys=[],[x0,x1,y0,y1]=range;
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=x+','+y;let set=this.buckets.get(key);if(!set)this.buckets.set(key,set=new Set());set.add(e);keys.push(key);}
    this.keys.set(e,keys);
  }
  query(e){const found=new Set(),[x0,x1,y0,y1]=this.range(e);for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(const other of this.buckets.get(x+','+y)||[])found.add(other);return [...found];}
}
const VIRUS_BASE_MASS=PHYSICS_CONFIG.virusSize**2/100;
const VIRUS_CHARGE_MASS=PHYSICS_CONFIG.ejectSize**2/100*PHYSICS_CONFIG.virusFeedTimes;
const VIRUS_MIN_COUNT=PHYSICS_CONFIG.virusCount;
const VIRUS_MAX_COUNT=PHYSICS_CONFIG.maxWorldCells;
const virusCharge=virus=>Math.max(0,(virus.mass??VIRUS_BASE_MASS)-(virus.baseMass??VIRUS_BASE_MASS));
const virusRadius=virus=>cellRadius(virus.mass??VIRUS_BASE_MASS);
function makeVirus(x,y,angle=0,key='ffa'){const c=physicsFor(key);if(c.kernel==='dual-tar'){const v=dualTarKernel.makeVirus(x,y,c);v.id=v.physicsId;return v;}return {id:++nextPhysicsId,physicsId:nextPhysicsId,x,y,mass:VIRUS_BASE_MASS,feedMass:0,feedCount:0,angle,age:0,boost:0,boostX:0,boostY:0,vx:0,vy:0};}
function resolveAll(players,food,viruses,time,width,maxCells,c,{own=true,cross=true,virus=true,foodOnly=false}={}){
  const entries=[];let eaten=0;
  for(const p of players)for(const cell of p.cells||[]){initialize(cell,time,c);cell.inside=false;cell.popped=false;entries.push({cell,player:p,kind:cell.dead?'dead':'player'});}
  for(const cell of food){initialize(cell,time,c);cell.inside=false;entries.push({cell,kind:cell.ejected?'ejected':'pellet'});}
  for(const cell of viruses){initialize(cell,time,c);cell.inside=false;cell.popped=false;entries.push({cell,kind:'virus'});}
  ordered(entries,c);const index=new SpatialIndex(entries,c.spatialBucket,c),ejectedIndex=new SpatialIndex(entries.filter(e=>e.kind==='ejected'),c.spatialBucket,c),deadIndex=new SpatialIndex(entries.filter(e=>e.kind==='dead'),c.spatialBucket,c),pairs=new Set(),pops=[];
  const update=e=>{index.update(e);if(e.kind==='ejected')ejectedIndex.update(e);if(e.kind==='dead')deadIndex.update(e);};
  for(const entry of entries){
    const a=entry.cell;if(a.removed||a.popped||a.inside||entry.kind==='pellet'||entry.kind==='ejected'&&(!a.updated||c.feedCollisions===false))continue;
    const candidates=ordered((entry.kind==='virus'||entry.kind==='ejected'?ejectedIndex:entry.kind==='dead'?deadIndex:index).query(entry),c);
    for(const other of candidates){
      const b=other.cell;if(a===b||b.removed||b.popped||b.inside||a.mass<b.mass)continue;
      const same=entry.player&&entry.player===other.player;
      let collide=false,eat=false;
      if(entry.kind==='player'){
        if(same&&own){if(ready(a,time,c)&&ready(b,time,c))eat=true;else collide=a.age>c.noCollisionDelay&&b.age>c.noCollisionDelay;}
        else if(!same&&cross&&(!foodOnly||other.kind==='ejected'||other.kind==='pellet'))eat=true;
      }else if(virus&&entry.kind==='virus'&&other.kind==='ejected')eat=true;
      else if(entry.kind==='ejected'&&other.kind==='ejected'||entry.kind==='dead'&&other.kind==='dead')collide=true;
      if(collide){
        const pair=a.physicsId<b.physicsId?a.physicsId+':'+b.physicsId:b.physicsId+':'+a.physicsId;
        if(pairs.has(pair))continue;pairs.add(pair);
        if(push(a,b,c)){update(entry);update(other);}continue;
      }
      if(entry.kind==='player'&&other.kind==='ejected'&&c.ejectStyle==='legacy')continue;
      if(entry.kind==='player'&&other.kind==='player'&&entry.player!==other.player&&entry.player.multiKey&&entry.player.multiKey===other.player.multiKey&&time<(entry.player.feedTransferUntil||0)&&entry.player.feedTransferRecipientId===other.player.id)eat=false;
      if(!eat||!canEat(a,b,same,c))continue;
      consume(a,b,other.kind,c,entry.kind==='player');eaten++;
      if(other.kind==='virus'){
        if(entry.kind==='player'){a.popped=true;pops.push(entry);break;}
      }else if(entry.kind==='virus'){
        const maxSize=Math.sqrt(c.virusSize**2+c.ejectSize**2*c.virusFeedTimes);
        if(a.mass+1e-9>=maxSize*maxSize/100){a.popped=true;a.boostX=b.boostX;a.boostY=b.boostY;}
        if(c.virusPush){
          const boost=Math.min(a.boost+c.virusBoost*c.distanceScale,c.virusMaxBoost*c.distanceScale);
          setBoost(a,a.boostX*a.boost+b.boostX*c.virusBoost*c.distanceScale,a.boostY*a.boost+b.boostY*c.virusBoost*c.distanceScale,boost,c);
        }
        a.feedMass=a.mass-c.virusSize**2/100;
        if(a.popped){pops.push(entry);break;}
      }
      update(entry);
    }
  }
  for(const p of players){
    for(const cell of p.cells)if(cell.removed&&p.npc&&p.cells.filter(c=>!c.removed).length===0)p.respawnAt=time+BOT_RESPAWN_SECONDS;
    p.cells=p.cells.filter(cell=>!cell.removed);
  }
  for(let i=food.length-1;i>=0;i--)if(food[i].removed)food.splice(i,1);
  for(let i=viruses.length-1;i>=0;i--)if(viruses[i].removed)viruses.splice(i,1);
  for(const entry of pops){
    const cell=entry.cell;
    if(entry.kind==='player')popPlayer(entry.player,cell,time,width,maxCells,c);
    else{
      cell.mass=c.virusSize**2/100;cell.feedMass=0;cell.feedCount=0;
      if(food.length+viruses.length+players.reduce((sum,p)=>sum+p.cells.length,0)<c.maxWorldCells){
        const child=makeVirus(cell.x,cell.y,0,c);child.originX=cell.x;child.originY=cell.y;
        setBoost(child,cell.boostX,cell.boostY,c.virusSplitBoost*c.distanceScale,c);viruses.push(child);
      }
    }
  }
  for(const p of players)projectLine(p,c);return eaten;
}
function eatCells(players,key='ffa',time=Infinity){const c=physicsFor(key);return c.kernel==='dual-tar'?dualTarKernel.resolveOnly(players,[],[],time,worldSizeFor(),c.maxCells,c):resolveAll(players,[],[],time,worldSizeFor(),c.maxCells,c,{own:false,virus:false});}
function findFoodRecipient(pellet,players,time=Infinity,key='ffa'){
  const profile=physicsFor(key);if(profile.kernel==='dual-tar')return dualTarKernel.foodRecipient(pellet,players,profile);
  if(pellet.ejected&&pellet.sourceId)return legacyFindFoodRecipient(pellet,players,time);
  const c=PHYSICS_CONFIG,candidates=[];initialize(pellet,Number.isFinite(time)?time:0,c);
  for(const player of players)for(const cell of player.cells||[]){initialize(cell,Number.isFinite(time)?time:0,c);candidates.push({cell,player});}
  for(const e of ordered(candidates,c))if(canEat(e.cell,pellet,false,c))return{...e,at:0};
  return null;
}
function absorbFood(players,food,key='ffa',time=Infinity){
  if(physicsFor(key).kernel==='dual-tar')return dualTarKernel.resolveOnly(players,food,[],time,worldSizeFor(),physicsFor(key).maxCells,physicsFor(key),{foodOnly:true});
  const before=food.length;if(physicsFor(key).ejectStyle==='legacy')legacyAbsorb(players,food,[],time,physicsFor(key));resolveAll(players,food,[],time,worldSizeFor(),physicsFor(key).maxCells,physicsFor(key),{own:false,cross:true,virus:false,foodOnly:true});return before-food.length;
}
function moveNonPlayers(food,viruses,time,dt,width,c){
  for(const cell of [...food,...viruses]){
    cell.previousX=cell.x;cell.previousY=cell.y;initialize(cell,time-dt,c);cell.age+=simMs(dt,c);cell.inside=false;cell.popped=false;cell.updated=false;advanceBoost(cell,dt,width,c);
    if(cell.ejected&&((c.ejectMaxAge&&cell.age>c.ejectMaxAge)||(Number.isFinite(cell.expiresAt)&&time>cell.expiresAt)))cell.removed=true;
  }
}
function stepViruses({viruses,food,players,width,maxCells,time,dt,physics='ffa'}){
  if(physicsFor(physics).kernel==='dual-tar'){const c=physicsFor(physics);for(const cell of [...food,...viruses])dualTarKernel.boost(cell,dt,width,c);return dualTarKernel.resolveOnly(players,food,viruses,time,width,maxCells,c,{own:true});}
  const c=physicsFor(physics);moveNonPlayers(food,viruses,time,dt,width,c);if(c.ejectStyle==='legacy')legacyAbsorb(players,food,viruses,time,c);return resolveAll(players,food,viruses,time,width,maxCells,c);
}
function stepArenaPhysics(players,food,viruses,dt,time,width,maxCells,key='ffa'){
  if(physicsFor(key).kernel==='dual-tar'){
    const c=physicsFor(key),eaten=dualTarKernel.step(players,food,viruses,dt,time,width,maxCells,c);
    while(viruses.length<c.virusCount){const point=findSafeSpawn([...players,{cells:viruses}],c.virusSize**2/100,width,0);if(!point)break;viruses.push(makeVirus(point.x,point.y,0,c));}
    return eaten;
  }
  const c=physicsFor(key);decayMass(players,dt,c);
  for(const player of players){player.deferCellResolution=true;moveCells(player,dt,time,width,c,1);delete player.deferCellResolution;autoSplitCells(player,time,width,maxCells,c);}
  moveNonPlayers(food,viruses,time,dt,width,c);
  const fed=c.ejectStyle==='legacy'?legacyAbsorb(players,food,viruses,time,c):0;
  const eaten=fed+resolveAll(players,food,viruses,time,width,maxCells,c)+resolveOwnedFeed(players,time,c);
  // engine.js spawnCells replenishes the mode's virus target each update.
  while(viruses.length<c.virusCount&&food.length+viruses.length+players.reduce((n,p)=>n+p.cells.length,0)<c.maxWorldCells){
    const point=findSafeSpawn([...players,{cells:viruses}],c.virusSize**2/100,width,0);
    if(!point)break;viruses.push(makeVirus(point.x,point.y,0,c));
  }
  return eaten;
}
function findSplitHunt(bot,players,time,width,maxCells,key='ffa'){

  if(!bot?.npc||bot.cells?.length!==1||bot.cells.length>=Math.min(maxCells,physicsFor(key).maxCells))return null;

  const c=physicsFor(key),source=bot.cells[0],half=source.mass/2;

  if(radiusFor(source,c)<c.minSplitSize*c.distanceScale)return null;

  let selected=null;

  for(const prey of players){if(prey===bot||time<(prey.spawnShieldUntil||0))continue;for(const target of prey.cells||[]){

    if(Math.sqrt(half)<=Math.sqrt(target.mass)*c.eatMulti)continue;

    const distance=Math.hypot(target.x-source.x,target.y-source.y),reach=(c.splitBoost+c.splitDistance)*c.distanceScale+cellRadius(half)-cellRadius(target.mass)/c.eatOverlap;

    if(distance>reach)continue;

    const threatened=players.some(enemy=>enemy!==bot&&enemy.cells?.some(cell=>cell!==target&&cell.mass>half*c.eatMulti**2&&Math.hypot(cell.x-source.x,cell.y-source.y)<420));

    if(!threatened&&(!selected||distance<selected.distance))selected={prey,target,source,distance};

  }}return selected;

}

// Vintage NPC decisions. Both local and authoritative arenas use this routine.
const BOT_AI_CONFIG=Object.freeze({sight:1400,dangerRange:620,foodSight:950,waypointDistance:650,splitCooldown:.8,prediction:.28,virusClearance:18});
function stepBotAI(bot,players,food,viruses,time,dt,width,maxCells,key='ffa',random=Math.random){
 if(!bot?.npc||!bot.cells?.length)return;
 const c=physicsFor(key),ai=BOT_AI_CONFIG,lead=bot.cells.reduce((a,b)=>b.mass>a.mass?b:a),r=cellRadius(lead.mass),margin=r+4;
 const dist=point=>Math.hypot(point.x-lead.x,point.y-lead.y);
 const target=(x,y)=>({x:clamp(x,margin,width-margin),y:clamp(y,margin,width-margin)});
 const threats=[];let prey=null,best=Infinity;
 for(const other of players){if(other===bot)continue;for(const cell of other.cells||[]){
  const d=dist(cell),edge=d-cellRadius(cell.mass)-r;
  if(cell.mass>lead.mass*c.eatMulti**2&&edge<ai.dangerRange)threats.push(cell);
  if(lead.mass>cell.mass*c.eatMulti**2&&d<ai.sight&&(!other.npc||d<500)){
   const score=Math.max(1,d-cellRadius(cell.mass))*(other.npc?1.5:.8);
   if(score<best){best=score;prey={player:other,cell};}
  }
 }}
 if(threats.length){
  let ax=0,ay=0;for(const threat of threats){const d=Math.max(1,dist(threat));ax+=(lead.x-threat.x)/(d*d);ay+=(lead.y-threat.y)/(d*d);}
  const base=Math.atan2(ay,ax);let choice=null,value=-Infinity;
  // Include tangents so a fleeing bot turns along a wall instead of pinning itself to it.
  for(const offset of [0,.55,-.55,1.1,-1.1,Math.PI/2,-Math.PI/2]){
   const point=target(lead.x+Math.cos(base+offset)*ai.waypointDistance,lead.y+Math.sin(base+offset)*ai.waypointDistance);
   const clearance=Math.min(...threats.map(t=>Math.hypot(point.x-t.x,point.y-t.y)-cellRadius(t.mass)));
   const travel=dist(point);const score=clearance+travel*.12-Math.abs(offset)*5;
   if(score>value){value=score;choice=point;}
  }
  bot.target=choice;bot.aiState='flee';bot.aiHuntUntil=0;bot.aiPreySample=null;
 }else if(prey){
  const sample=bot.aiPreySample,elapsed=sample?.id===prey.player.id?time-sample.time:0,speed=cellSpeed(prey.cell.mass,c);
  const vx=elapsed>0?clamp((prey.cell.x-sample.x)/elapsed,-speed,speed):0,vy=elapsed>0?clamp((prey.cell.y-sample.y)/elapsed,-speed,speed):0;
  bot.target=target(prey.cell.x+vx*ai.prediction,prey.cell.y+vy*ai.prediction);
  bot.aiPreySample={id:prey.player.id,x:prey.cell.x,y:prey.cell.y,time};bot.aiState='chase';
  if(time>=(bot.aiNextSplitAt||0)){
   const attack=findSplitHunt(bot,players,time,width,maxCells,c);
   if(attack){bot.target=target(attack.target.x,attack.target.y);const child=splitCell(bot,lead,time,width,c);if(child){bot.cells.push(child);bot.aiNextSplitAt=time+ai.splitCooldown;bot.aiHuntTargetId=attack.prey.id;bot.aiHuntUntil=time+2.5;bot.aiState='attack';}}
  }
 }else{
  let nearest=null,nearestDistance=ai.foodSight;
  for(const pellet of food){if(pellet.removed)continue;const d=dist(pellet);if(d<nearestDistance){nearestDistance=d;nearest=pellet;}}
  if(nearest){bot.target=target(nearest.x,nearest.y);bot.aiState='forage';}
  else{if(!bot.aiWaypoint||time>=bot.aiWaypointUntil||dist(bot.aiWaypoint)<80){const angle=random()*Math.PI*2;bot.aiWaypoint=target(lead.x+Math.cos(angle)*ai.waypointDistance,lead.y+Math.sin(angle)*ai.waypointDistance);bot.aiWaypointUntil=time+3;}bot.target={...bot.aiWaypoint};bot.aiState='roam';}
  bot.aiPreySample=null;
 }
 // Steer around a virus on the chosen path. No hidden immunity or mass advantage.
 const tx=bot.target.x-lead.x,ty=bot.target.y-lead.y,length=Math.hypot(tx,ty);
 if(length&&bot.aiState!=='flee')for(const virus of viruses){
  const vx=virus.x-lead.x,vy=virus.y-lead.y,along=(vx*tx+vy*ty)/length,side=Math.abs(vx*ty-vy*tx)/length,clearance=r+virusRadius(virus)+ai.virusClearance;
  if(along>0&&along<Math.min(length,450)&&side<clearance){const sign=(vx*ty-vy*tx)>=0?1:-1;bot.target=target(virus.x-ty/length*clearance*sign,virus.y+tx/length*clearance*sign);break;}
 }
 bot.heading=Math.atan2(bot.target.y-lead.y,bot.target.x-lead.x);
}

// Feed placement and swept reception restored from the saved pre-OgarX release.
function legacyEjectMass(player,food,time,width,mode='ffa',players=[]){
  if(!player?.cells?.length)return 0;
  const rules=physicsFor(mode),cost=rules.feedCost??100,pelletMass=rules.feedMass??cost,pelletRadius=rules.feedRadius??Math.sqrt(pelletMass)*.85;
  let count=0,available=rules.maxFeedPellets
    ?rules.maxFeedPellets-food.reduce((sum,pellet)=>sum+(!pellet.removed&&pellet.ejected?1:0),0)
    :6000-food.length;
  const linked=rules.ownedFeedProtection>0&&player.multiKey&&!player.npc
    ?players.filter(other=>other!==player&&!other.npc&&other.multiKey===player.multiKey&&other.cells?.length):[];
  for(const c of player.cells){
    if(available<=0)break;
    if(c.mass<=cost+25)continue;
    const dx=(player.target?.x??c.x)-c.x,dy=(player.target?.y??c.y)-c.y,length=Math.hypot(dx,dy);
    let ux=length>.001?dx/length:1,uy=length>.001?dy/length:0;
    if(rules.feedSpread){
      c.feedSequence=(c.feedSequence||0)+1;
      const angle=((c.feedSequence*.61803398875)%1*2-1)*rules.feedSpread,cos=Math.cos(angle),sin=Math.sin(angle);
      [ux,uy]=[ux*cos-uy*sin,ux*sin+uy*cos];
    }
    let travel=cellRadius(c.mass-cost)+pelletRadius+12;
    for(const other of rules.feedPlacement==='cluster'?player.cells:[]){
      const ox=other.x-c.x,oy=other.y-c.y,along=ox*ux+oy*uy,side2=ox*ox+oy*oy-along*along;
      const clearance=cellRadius(other.mass)+pelletRadius+12;
      if(side2<clearance*clearance)travel=Math.max(travel,along+Math.sqrt(clearance*clearance-Math.max(0,side2)));
    }
    // A linked receiver can overlap the sender's edge. Start at the first
    // receiver surface on the firing ray, rather than beyond the small cell.
    let recipient=null,first=Infinity;
    const reach=travel+(rules.feedSpeed??1100)/(rules.feedDrag??2.2);
    for(const other of linked)for(const receiver of other.cells){
      const ox=receiver.x-c.x,oy=receiver.y-c.y,along=ox*ux+oy*uy,side2=Math.max(0,ox*ox+oy*oy-along*along),r=cellRadius(receiver.mass);
      if(side2>=r*r)continue;
      const half=Math.sqrt(r*r-side2),near=Math.max(0,along-half);
      if(along+half<0||near>reach||near>=first)continue;
      first=near;recipient=other;
    }
    if(recipient)travel=Math.min(travel,first+.01);
    const point={x:c.x+ux*travel,y:c.y+uy*travel};
    // Firing into a wall must not clamp the pellet back inside its sender.
    if(point.x<pelletRadius||point.x>width-pelletRadius||point.y<pelletRadius||point.y>width-pelletRadius)continue;
    c.mass-=cost;count++;available--;
    if(recipient){
      const until=time+rules.ownedFeedProtection;
      player.feedTransferUntil=Math.max(player.feedTransferUntil||0,until);
      player.feedTransferRecipientId=recipient.id;
    }
    c.feedSourceId??=++nextPhysicsId;
    const feedId=++nextFeedId;
    food.push({...point,mass:pelletMass,feedId,...(rules.feedRadius?{radius:pelletRadius}:{}),...(recipient?{recipientId:recipient.id}:{}),color:rules.feedCollisions===false?(c.color||player.color||FEED_COLORS[0]):FEED_COLORS[(feedId-1)%FEED_COLORS.length],ejected:true,ownerId:player.id,sourceId:c.feedSourceId,bornAt:time,
      ownerCollectAt:rules.feedPlacement==='cluster'?time+.6:time,sourceCollectAt:time+rules.feedSourceGrace,
      expiresAt:time+12,drag:rules.feedDrag??2.2,vx:ux*(rules.feedSpeed??1100),vy:uy*(rules.feedSpeed??1100)});
  }
  return count;
}

function legacyFindFoodRecipient(pellet,players,time=Infinity){
  const startX=pellet.ejected?(pellet.previousX??pellet.x):pellet.x;
  const startY=pellet.ejected?(pellet.previousY??pellet.y):pellet.y;
  const dx=pellet.x-startX,dy=pellet.y-startY,length2=dx*dx+dy*dy;
  let receiver=null,first=Infinity;
  for(const p of players){
    if(pellet.ejected&&pellet.ownerId===p.id&&time<(pellet.ownerCollectAt||0))continue;
    for(const c of p.cells||[]){
      if(pellet.ejected&&pellet.ownerId===p.id&&pellet.sourceId===c.feedSourceId&&time<(pellet.sourceCollectAt||0))continue;
      const radius=cellRadius(c.mass);
      if(c.x<Math.min(startX,pellet.x)-radius||c.x>Math.max(startX,pellet.x)+radius||c.y<Math.min(startY,pellet.y)-radius||c.y>Math.max(startY,pellet.y)+radius)continue;
      const ox=startX-c.x,oy=startY-c.y,outside=ox*ox+oy*oy-radius*radius;
      let at=0;
      if(outside>0){
        if(!length2)continue;
        const b=ox*dx+oy*dy,disc=b*b-length2*outside;
        if(disc<0)continue;
        at=(-b-Math.sqrt(disc))/length2;
        if(at<0||at>1)continue;
      }
      if(!pellet.ejected)return{player:p,cell:c,at};
      const tied=at===first,preferred=p.id===pellet.recipientId,wasPreferred=receiver?.player.id===pellet.recipientId;
      const preferReceiver=tied&&preferred&&receiver?.player.id===pellet.ownerId;
      const keepReceiver=tied&&wasPreferred&&p.id===pellet.ownerId;
      if(at<first||preferReceiver||(tied&&!keepReceiver&&c.mass>(receiver?.cell.mass??0))){first=at;receiver={player:p,cell:c,at};}
    }
  }
  return receiver;
}

function legacyAbsorb(players,food,viruses,time,c){
 let count=0;
 for(let i=food.length-1;i>=0;i--){
  const pellet=food[i];if(!pellet.ejected||pellet.removed)continue;
  const hit=legacyFindFoodRecipient(pellet,players,time);if(!hit)continue;
  // A virus earlier on the trajectory must get the pellet first.
  const obstacle=legacyFindFoodRecipient(pellet,viruses.map(v=>({cells:[v]})),time);
  if(obstacle&&obstacle.at<hit.at)continue;
  initialize(hit.cell,time,c);initialize(pellet,time,c);consume(hit.cell,pellet,'pellet',c);food.splice(i,1);count++;
 }
 return count;
}

// Feeding deliberately links the two owned connections. Revisit transfer victims
// after receiver gains, including fragments marked inside by sibling collision.
function resolveOwnedFeed(players,time,key='ffa'){
 const c=physicsFor(key);if(!c.ownedFeedProtection)return 0;let eaten=0;
 for(const sender of players){
  if(!sender.multiKey||sender.npc||time>=(sender.feedTransferUntil||0))continue;
  const receiver=players.find(p=>p!==sender&&!p.npc&&p.multiKey===sender.multiKey&&p.id===sender.feedTransferRecipientId);
  if(!receiver?.cells?.length)continue;
  for(let pass=0;pass<sender.cells.length+1;pass++){
   let changed=false;
   for(const a of receiver.cells)for(const b of sender.cells){
    initialize(a,time,c);initialize(b,time,c);
    if(a.removed||b.removed||a.popped||b.popped||!canEat(a,b,false,c))continue;
    consume(a,b,'player',c);eaten++;changed=true;
   }
   if(!changed)break;
  }
  sender.cells=sender.cells.filter(cell=>!cell.removed);
 }
 return eaten;
}

module.exports={PHYSICS_CONFIG,MEGA_PHYSICS,DUAL_TAR_REFERENCE,FFA_PHYSICS,DUAL_PHYSICS,OTHER_PHYSICS,PHYSICS_PRESETS,physicsFor,clamp,cellRadius,worldSizeFor,foodTargetFor,virusTargetFor,autoSplitMassFor,feedIntervalFor,mergeDelayFor,cellSpeed,respawnDelayFor,BOT_MIN_MASS,BOT_MAX_MASS,BOT_RESPAWN_SECONDS,randomBotMass,limitVisibility,findSafeSpawn,findPlayerSpawn,maintainBots,FEED_COLORS,advanceBoost,splitCell,splitCells,startSplitMacro,stepSplitMacro,setRunSplitHeld,stepHeldRunSplit,autoSplitCells,decayMass,setLineLock,moveCells,mergeCells,distributeCellMass,popPlayer,setFeedHeld,requestFeedInput,stepHeldFeed,ejectMass,VIRUS_BASE_MASS,VIRUS_CHARGE_MASS,VIRUS_MIN_COUNT,VIRUS_MAX_COUNT,virusCharge,virusRadius,makeVirus,eatCells,findFoodRecipient,absorbFood,stepViruses,stepArenaPhysics,findSplitHunt,BOT_AI_CONFIG,stepBotAI,resolveOwnedFeed};
