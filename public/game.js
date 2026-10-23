import {makeVirus, stepViruses, virusRadius, virusCharge, VIRUS_CHARGE_MASS, VIRUS_MAX_COUNT} from './virus-rules.js?v=5-smooth-launch';
import {splitCell, splitCells, findSplitHunt, moveCells, eatCells, absorbFood, autoSplitMassFor as physicsAutoSplitMassFor, findSafeSpawn, findPlayerSpawn, randomBotMass, maintainBots, decayMass, ejectMass, startSplitMacro, stepSplitMacro, physicsFor, mergeDelayFor, feedIntervalFor, findFoodRecipient, worldSizeFor, foodTargetFor, virusTargetFor, limitVisibility} from './physics.js?v=16-multi-fixes';
export {feedIntervalFor};
export const MODES = Object.freeze({
  ffa: {title:'FREE FOR ALL',start:1000,color:'#73e5f1',botCount:10,multi:true},
  dual:{title:'DUAL',start:1000,color:'#ae95ff',botCount:10,multi:true},
  mega:{title:'MEGA',start:5000,color:'#ffd28a',botCount:10,multi:true},
});
export const supportsMultibox=(mode,server={})=>server?.multi!==false&&MODES[mode]?.multi!==false;
export const WORLD_SIZE=worldSizeFor('ffa');
export {worldSizeFor};
export const ZOOM_MIN=.04,ZOOM_MAX=12;
export const autoSplitMassFor=key=>physicsAutoSplitMassFor(key);
export const AUTO_SPLIT_MASS=autoSplitMassFor('ffa');
export const MAX_CELLS=64;
/** Sector coordinates and tag visibility are shared by HUD and minimap. */
export const sectorAt = (x,y,worldSize=WORLD_SIZE) => {
  const c=n=>Math.max(0,Math.min(4,Math.floor(Number(n)/worldSize*5)));
  return 'ABCDE'[c(x)]+String(c(y)+1);
};
export const totalMass = p => (p.cells||[]).reduce((sum,c)=>sum+Math.max(0,Number(c.mass)||0),0);
export const markerRadius = (mass,isMe=false) => Math.min(17,Math.max(isMe?5:3,Math.sqrt(Math.max(0,Number(mass)||0))/12.2+(isMe?1.5:0)));
export function getVisibleAllies(snapshot,selectedId){
  const players=(snapshot?.peers??snapshot?.players??[]).filter(p=>p.cells?.length);
  const self=players.find(p=>p.id===selectedId);
  // Spectators without a player see everybody; players see only their own tag group.
  if(!self) return players;
  const group=p=>p.teamId??String(p.tag||'').trim().toUpperCase();
  const key=group(self);
  return players.filter(p=>group(p)===key);
}

export const DEFAULT_SETTINGS={
  showGrid:false,showMass:true,showNames:true,showLeaderboard:true,showMinimap:true,showChat:true,showSectors:true,showSkins:true,
  autoSplit:true,autoRespawn:false,mouseSensitivity:1,zoom:1,wheelZoom:true,wheelZoomSensitivity:1,cameraSmoothing:0.10,
  showFood:true,showViruses:true,showBorders:true,showHelp:true,cellOpacity:100,nickSize:1.1,massSize:1.1,animation:120,
  bgColor:'#000000',gridColor:'#244051',accentColor:'#70e0ff',
  ownCellColoring:'multibox',shortMass:true,
  activeCellIndicatorColor:'#ffffff',activeCellIndicatorSize:100,activeCellBorderColor:'#09759d',activeCellBorderWidth:10,
  canvasCellEffects:false,sectorColor:'#7cabb9',sectorGridColor:'#286171',sectorGridWidth:1.5,sectorLabelSize:12,sectorLabelPosition:'corner',sectorScale:100,sectorRainbow:false,prismSpeed:1,visualStyleVersion:5,
  borderColor:'#70e0ff',borderWidth:3,borderStyle:'solid',borderGlow:false,borderGlowColor:'#70e0ff',borderGlowDistance:24,borderGlowStrength:60,
  foodSize:1,rainbowFood:true,backgroundImage:true,backgroundUrl:'',worldLogoUrl:'',themePreset:'vintage',
  useDrawnBackground:false,backgroundDesign:null,
  showThemeArtwork:true,themeArtwork:null,
  panelColor:'#121c27',textColor:'#f5f9ff',foodColor:'#60cfe7',virusColor:'#f065b5',customTheme:null,
  keySplit:'SPACE',keyDoubleSplit:'Q',keyTripleSplit:'R',keySplit16:'T',keySplit32:'F',keySplit64:'D',
  keyFeed:'W',keyMacroFeed:'E',keySwitch:'TAB',keyStopMove:'P',keyChat:'ENTER',keyMenu:'ESCAPE',keySettings:'NO KEY',
  keyChatToggle:'C',keyHUD:'H',keySaveReplay:'NO KEY',keySpectateMode:'X',keyToggleNames:'N',keyToggleMass:'M',
  keyToggleSkin:'S',keyToggleChat:'V',keyToggleSectors:'B',keyCommand1:'1',keyCommand2:'2',keyCommand3:'3',
  keyCommand4:'4',keyCommand5:'5',keyCommand6:'6',keyCommand7:'7',keyCommand8:'8',keyCommand9:'9',keyCommand10:'0',
  keyZoom1:'ALT+1',keyZoom2:'ALT+2',keyZoom3:'ALT+3',keyZoom4:'ALT+4',keyZoom5:'ALT+5',
  controlsVersion:2,mouseLeft:'none',mouseMiddle:'none',mouseRight:'none',rightClickMove:false,invertWheel:false,
  chatCommands:['Need backup!','Need a teammate!','Push now!','Split into me!','Feed me!','Hold position!','Defend me!','Go left!','Go right!','GG!']
};
export const INPUT_ACTIONS=Object.freeze([
  ['none','None'],['feed','Feed'],['macroFeed','Macro Feed'],['split','Split'],['doubleSplit','Double Split'],
  ['tripleSplit','Triple Split'],['split16','Split 16'],['split32','Split 32'],['split64','Split 64'],['switch','Dual Toggle']
]);
export const CONTROL_KEYS=Object.keys(DEFAULT_SETTINGS).filter(key=>key.startsWith('key'));
const MODIFIER_KEYS=new Set(['CTRL','ALT','SHIFT','META','ALTGRAPH']);
const CONTROL_KEY_PATTERN=/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|NUMPAD(?:[0-9]|ENTER|ADD|SUBTRACT|MULTIPLY|DIVIDE|DECIMAL|COMMA|EQUAL|PARENLEFT|PARENRIGHT|BACKSPACE|CLEAR|CLEARENTRY)|SPACE|ESCAPE|ENTER|TAB|BACKSPACE|DELETE|UP|DOWN|LEFT|RIGHT|MINUS|EQUAL|BRACKETLEFT|BRACKETRIGHT|BACKSLASH|SEMICOLON|QUOTE|COMMA|PERIOD|SLASH|BACKQUOTE|SHIFT|CTRL|ALT|META|ALTGRAPH|CAPSLOCK|NUMLOCK|SCROLLLOCK|INSERT|HOME|END|PAGEUP|PAGEDOWN|PAUSE|PRINTSCREEN|CONTEXTMENU|INTL[A-Z]+|LANG[1-5]|CONVERT|NONCONVERT|KANAMODE|HELP|POWER|SLEEP|WAKEUP|EJECT|AUDIO[A-Z]+|MEDIA[A-Z]+|BROWSER[A-Z]+|LAUNCH[A-Z0-9]+|AGAIN|COPY|CUT|FIND|OPEN|PASTE|PROPS|SELECT|UNDO)$/;
export function validControlBinding(binding){
  const parts=String(binding).split('+'),base=parts.pop();
  return CONTROL_KEY_PATTERN.test(base)&&parts.every((p,i)=>MODIFIER_KEYS.has(p)&&p!==base&&parts.indexOf(p)===i);
}
export function physicalKey(event){
  const code=event.code||'',map={Space:'SPACE',Escape:'ESCAPE',Enter:'ENTER',NumpadEnter:'ENTER',Tab:'TAB',Backspace:'BACKSPACE',Delete:'DELETE',ArrowUp:'UP',ArrowDown:'DOWN',ArrowLeft:'LEFT',ArrowRight:'RIGHT',Minus:'MINUS',Equal:'EQUAL',BracketLeft:'BRACKETLEFT',BracketRight:'BRACKETRIGHT',Backslash:'BACKSLASH',Semicolon:'SEMICOLON',Quote:'QUOTE',Comma:'COMMA',Period:'PERIOD',Slash:'SLASH',Backquote:'BACKQUOTE'};
  let key=/^Key[A-Z]$/.test(code)?code.slice(3):/^Digit[0-9]$/.test(code)?code.slice(5):/^Shift/.test(code)?'SHIFT':/^Control/.test(code)?'CTRL':/^Alt/.test(code)?(event.key==='AltGraph'?'ALTGRAPH':'ALT'):/^(Meta|OS)/.test(code)?'META':map[code]||code.toUpperCase();
  if(code==='NumpadEnter')key='NUMPADENTER';
  if(!key){const fallback={' ':'SPACE',Escape:'ESCAPE',Enter:'ENTER',Tab:'TAB'};key=fallback[event.key]||String(event.key||'').toUpperCase();}
  if(key==='CONTROL')key='CTRL';
  if(!CONTROL_KEY_PATTERN.test(key))return 'NO KEY';
  if(MODIFIER_KEYS.has(key))return key;
  return [event.ctrlKey?'CTRL':'',event.altKey?'ALT':'',event.shiftKey?'SHIFT':'',event.metaKey?'META':'',key].filter(Boolean).join('+');
}
export function normalizeControlSettings(saved={},migrate=false){
  const next={...saved};
  if(migrate&&!(saved.controlsVersion>=1)){
    for(const key of [...CONTROL_KEYS,'mouseLeft','mouseMiddle','mouseRight','rightClickMove','mouseSensitivity','invertWheel'])next[key]=DEFAULT_SETTINGS[key];
    next.showChat=true;
  }
  if(migrate&&saved.controlsVersion===1){
    for(const key of CONTROL_KEYS)if(next[key]==='S'||(next[key]==='H'&&key!=='keyHUD'))next[key]='NO KEY';
    next.keyToggleSkin='S';next.keyHUD='H';
  }
  const used=new Set();
  for(const key of CONTROL_KEYS){
    let binding=typeof next[key]==='string'?next[key].toUpperCase():DEFAULT_SETTINGS[key];
    if(!validControlBinding(binding)||used.has(binding))binding='NO KEY';
    next[key]=binding;if(binding!=='NO KEY')used.add(binding);
  }
  for(const key of ['mouseLeft','mouseMiddle','mouseRight'])if(!INPUT_ACTIONS.some(([value])=>value===next[key]))next[key]='none';
  next.controlsVersion=DEFAULT_SETTINGS.controlsVersion;
  return next;
}
const TAG_COLORS=['#ff7399','#73e5ff','#a78bfa','#ffd166','#57e39f','#ff9f6e','#e879f9','#7dc4ff','#ffcf70','#a2e76b','#fd91bd','#8ee8d2','#c7a1ff','#ffad77','#66d9ef','#e5dd68'];
export function tagColor(tag){
  const key=String(tag||'').normalize('NFKC').trim().toUpperCase();if(!key)return '#ffffff';
  let hash=2166136261;for(const ch of key)hash=Math.imul(hash^ch.codePointAt(0),16777619);
  return TAG_COLORS[(hash>>>0)%TAG_COLORS.length];
}
export const DEFAULT_NAMES=['Nova','Orbit','Mercury','Sable','Helix','Cosmo','Vector','Astra','Vortex','Pulse','Quasar','Zenith','Echo','Drift','Neon'];
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const radius=m=>Math.max(13,Math.sqrt(Math.max(1,m))*2.45);
export function normalizeVisualSettings(saved={},migrate=false){
  const next={...saved};
  if(migrate&&!(saved.visualStyleVersion>=4)){next.showGrid=false;if(next.bgColor==='#07131f')next.bgColor='#000000';}
  if(migrate&&!(saved.visualStyleVersion>=5))next.showSectors=true;
  if(migrate&&!saved.visualStyleVersion){
    const oldDefaults={cellOpacity:100,nickSize:1,massSize:1};
    for(const [key,oldValue] of Object.entries(oldDefaults))if(saved[key]===oldValue)next[key]=DEFAULT_SETTINGS[key];
  }
  if(migrate&&saved.visualStyleVersion===2){
    // Version 2 incorrectly used indicator size as white body-fill coverage.
    next.activeCellIndicatorSize=100;
    if(saved.activeCellBorderWidth===0)next.activeCellBorderWidth=10;
    if(saved.cellOpacity===70)next.cellOpacity=100;
  }
  // Cell fills and labels no longer belong to user-created themes.
  for(const key of ['ownColor','secondColor','nickColor','massColor']){
    delete next[key];
    if(next.customTheme&&typeof next.customTheme==='object'){
      next.customTheme={...next.customTheme};delete next.customTheme[key];
    }
  }
  next.activeCellIndicatorColor='#ffffff';
  for(const key of ['activeCellBorderColor','bgColor','gridColor','sectorColor','sectorGridColor','borderColor','borderGlowColor','foodColor','virusColor','accentColor','panelColor','textColor']){
    if(!/^#[0-9a-f]{6}$/i.test(String(next[key]||'')))next[key]=DEFAULT_SETTINGS[key];
  }
  const limits={cellOpacity:[0,100],nickSize:[.1,3],massSize:[.1,3],activeCellIndicatorSize:[0,200],activeCellBorderWidth:[0,100],borderWidth:[1,24],borderGlowDistance:[0,100],borderGlowStrength:[0,100],sectorGridWidth:[.5,12],sectorLabelSize:[8,96],sectorScale:[50,250],prismSpeed:[.2,3]};
  for(const [key,[min,max]] of Object.entries(limits))next[key]=typeof next[key]==='number'&&Number.isFinite(next[key])?clamp(next[key],min,max):DEFAULT_SETTINGS[key];
  if(next.ownCellColoring==='uniform')next.ownCellColoring='server';
  if(!['multibox','server'].includes(next.ownCellColoring))next.ownCellColoring=DEFAULT_SETTINGS.ownCellColoring;
  if(!['solid','prism'].includes(next.borderStyle))next.borderStyle='solid';
  if(!['corner','center'].includes(next.sectorLabelPosition))next.sectorLabelPosition='corner';
  if(typeof next.borderGlow!=='boolean')next.borderGlow=false;
  if(typeof next.sectorRainbow!=='boolean')next.sectorRainbow=false;
  next.backgroundDesign=normalizeBackgroundDesign(next.backgroundDesign);
  next.useDrawnBackground=next.useDrawnBackground===true&&!!next.backgroundDesign;
  next.themeArtwork=normalizeBackgroundDesign(next.themeArtwork);
  if(next.themeArtwork)next.themeArtwork.transparent=true;
  if(typeof next.showThemeArtwork!=='boolean')next.showThemeArtwork=true;
  next.visualStyleVersion=DEFAULT_SETTINGS.visualStyleVersion;
  return next;
}
export function formatCellMass(mass,short=true){
  const value=Number.isFinite(mass)?Math.max(0,Math.floor(mass)):0;
  if(short&&value>=1000){const scale=value>=1e6?1e6:1000;return (Math.floor(value/scale*10)/10).toFixed(1).replace(/\.0$/,'')+(scale===1e6?'m':'k');}
  return value.toLocaleString('en-US');
}
export function cellAppearance(p,selectedId,ownedIds,settings=DEFAULT_SETTINGS){
  const ids=[...new Set(ownedIds.filter(Boolean))],owned=ids.includes(p.id),active=owned&&p.id===selectedId;
  const multi=owned&&ids.length>1,multibox=multi&&settings.ownCellColoring==='multibox';
  const fill=multibox?(active?settings.activeCellBorderColor:'#ffffff'):(p.color||'#6ddff3');
  return{fill,owned,active,multibox,indicator:multi&&!multibox,
    indicatorRatio:clamp(settings.activeCellIndicatorSize,0,200)/100,
    borderColor:active?settings.activeCellBorderColor:'#ffffff',
    borderRatio:multi&&!multibox?clamp(settings.activeCellBorderWidth,0,100)/100:0};
}
export function respawnPosition(anchor,cursor,mass,worldSize=WORLD_SIZE){
  const spawnRadius=radius(mass);
  const fallback={x:worldSize/2,y:worldSize/2};
  if(!anchor||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y)){
    const point=cursor&&Number.isFinite(cursor.x)&&Number.isFinite(cursor.y)?cursor:fallback;
    return{x:clamp(point.x,spawnRadius,worldSize-spawnRadius),y:clamp(point.y,spawnRadius,worldSize-spawnRadius)};
  }

  const anchorRadius=radius(anchor.mass);
  const origin={x:clamp(anchor.x,anchorRadius,worldSize-anchorRadius),y:clamp(anchor.y,anchorRadius,worldSize-anchorRadius)};
  const dx=(cursor?.x??origin.x)-origin.x,dy=(cursor?.y??origin.y)-origin.y;
  const magnitude=Math.hypot(dx,dy);
  const ux=magnitude>0?dx/magnitude:1,uy=magnitude>0?dy/magnitude:0;
  const clearance=32;
  const separation=anchorRadius+spawnRadius+clearance;
  const directions=[[ux,uy],[-uy,ux],[uy,-ux],[-ux,-uy]];
  let selected=null;
  for(const [x,y] of directions){
    const horizontal=x>0?(worldSize-spawnRadius-origin.x)/x:x<0?(origin.x-spawnRadius)/-x:Infinity;
    const vertical=y>0?(worldSize-spawnRadius-origin.y)/y:y<0?(origin.y-spawnRadius)/-y:Infinity;
    const available=Math.min(horizontal,vertical);
    if(available<separation)continue;
    const alignment=x*ux+y*uy;
    if(!selected||alignment>selected.alignment)selected={x,y,available,alignment};
  }
  if(!selected)return{x:origin.x,y:origin.y};
  const distance=Math.min(separation,selected.available);
  return{x:origin.x+selected.x*distance,y:origin.y+selected.y*distance};
}
const rand=(a,b)=>a+Math.random()*(b-a);
const PLAYER_COLORS=['#20ff9f','#a938ff','#ff48df','#ff4038','#32d9f4','#ffbe32','#6d25ff'];
const playerColor=()=>PLAYER_COLORS[Math.floor(Math.random()*PLAYER_COLORS.length)];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function foodPoint(players=[],width=WORLD_SIZE){const mass=rand(8,23),point=findSafeSpawn(players,mass,width,8);return point?{...point,mass,color:['#60cfe7','#d991ff','#f39dc8','#7fdfbc','#efca87'][Math.floor(Math.random()*5)]}:null;}
function newCell(x,y,mass,color){return {x,y,mass,color,vx:0,vy:0,mergeAt:0};}
function player(id,name,tag,color,start,npc=false){const x=rand(700,WORLD_SIZE-700),y=rand(700,WORLD_SIZE-700);return {id,name,tag,color,npc,cells:[newCell(x,y,start,color)],target:{x,y},heading:rand(0,Math.PI*2),alive:true};}
export class LocalArena{
  constructor(){this.mode='ffa';this.worldSize=worldSizeFor('ffa');this.players=[];this.food=[];this.viruses=[];this.myIds=[];this.elapsed=0;this.chat=[];this._id=0;}
  reset(mode,name,tag,multi=true,settings=DEFAULT_SETTINGS,spectator=false){
    this.mode=MODES[mode]?mode:'ffa';this.worldSize=worldSizeFor(this.mode);this.elapsed=0;this._id=0;this.chat=[];
    const conf=MODES[this.mode];
    this.food=[];
    this.viruses=Array.from({length:virusTargetFor(this.mode)},()=>makeVirus(rand(120,this.worldSize-120),rand(120,this.worldSize-120)));
    this.virusRespawns=[];
    this.players=[];this.myIds=[];
    if(!spectator){
      const me=player('local-1',name||'Vintage Player',tag||'',playerColor(),conf.start);
      me.multiKey='local-owned';
      me.cells[0].x=this.worldSize/2;me.cells[0].y=this.worldSize/2;me.target={x:me.cells[0].x,y:me.cells[0].y};
      this.players.push(me);this.myIds=[me.id];
      if(multi&&supportsMultibox(this.mode)){const second=player('local-2',name||'Vintage Player',tag,playerColor(),conf.start);
        second.multiKey=me.multiKey;
        Object.assign(second.cells[0],respawnPosition(me.cells[0],{x:me.cells[0].x+1000,y:me.cells[0].y},conf.start,this.worldSize));
        second.target={x:second.cells[0].x,y:second.cells[0].y};
        this.players.push(second);this.myIds.push(second.id);}
    }
    for(let i=0;i<conf.botCount;i++){
      const bot=player('npc-'+i,DEFAULT_NAMES[i],['','VX','RX','NV'][i%4],['#e59fe7','#ffb482','#87f4cd','#9eb3fa'][i%4],randomBotMass(),true);
      const point=findSafeSpawn(this.players,bot.cells[0].mass,this.worldSize);
      if(point){Object.assign(bot.cells[0],point);bot.target={...point};}else{bot.cells=[];bot.respawnAt=0;}
      this.players.push(bot);
    }
    while(this.food.length<(this.mode==='ffa'?foodTargetFor(this.mode):260)){ const point=foodPoint(this.players,this.worldSize);if(!point)break;this.food.push(point);}
  }
  get snapshot(){return limitVisibility({type:'state',mode:this.mode,maxCells:physicsFor(this.mode).maxCells??MAX_CELLS,autoSplitMass:autoSplitMassFor(this.mode),players:this.players.filter(p=>p.cells.length||this.myIds.includes(p.id)),food:this.food,viruses:this.viruses,worldSize:this.worldSize},this.myIds);}
  getById(id){return this.players.find(p=>p.id===id);}
  respawn(id,x,y){
    if(!this.myIds.includes(id))return false;
    const p=this.getById(id);
    if(!p||p.cells.length||this.elapsed<(p.lastRespawnAt??-100)+1.8)return false;
    const mass=MODES[this.mode].start,r=radius(mass);
    const sx=clamp(Number.isFinite(x)?x:this.worldSize/2,r,this.worldSize-r);
    const sy=clamp(Number.isFinite(y)?y:this.worldSize/2,r,this.worldSize-r);
    const point=findPlayerSpawn(this.players,p,mass,this.worldSize,24,Math.random,{x:sx,y:sy});
    if(!point)return false;
    p.cells=[newCell(point.x,point.y,mass,p.color)];p.target={...point};
    p.lastRespawnAt=this.elapsed;p.spawnShieldUntil=this.elapsed+1.5;p.pendingSplits=[];
    return true;
  }
  setTarget(id,x,y){const p=this.getById(id);if(p&&Number.isFinite(x)&&Number.isFinite(y))p.target={x:clamp(x,0,this.worldSize),y:clamp(y,0,this.worldSize)};}
  setMovementStopped(id,stopped){const p=this.getById(id);if(p&&typeof stopped==='boolean')p.movementStopped=stopped;}
  split(id,count=1){return startSplitMacro(this.getById(id),count,this.elapsed,this.worldSize,MAX_CELLS,this.mode);}
  feed(id){return ejectMass(this.getById(id),this.food,this.elapsed,this.worldSize,this.mode);}
  tick(dt,settings=DEFAULT_SETTINGS){
    dt=Math.min(.05,Math.max(0,dt));this.elapsed+=dt;
    const rules=physicsFor(this.mode),threshold=autoSplitMassFor(this.mode);
    for(const p of this.players){
      if(!p.cells.length)continue;
      stepSplitMacro(p,this.elapsed,this.worldSize,MAX_CELLS,this.mode);
      if(p.npc){
        const lead=p.cells[0];
        const threat=this.players.filter(x=>x!==p&&x.cells.length&&x.cells[0].mass>lead.mass*1.3&&distance(x.cells[0],lead)<460)
          .sort((a,b)=>distance(a.cells[0],lead)-distance(b.cells[0],lead))[0];
        if(threat){
          p.aiHuntUntil=0;
          p.heading=Math.atan2(lead.y-threat.cells[0].y,lead.x-threat.cells[0].x);
          p.target={x:clamp(lead.x+Math.cos(p.heading)*520,0,this.worldSize),y:clamp(lead.y+Math.sin(p.heading)*520,0,this.worldSize)};
        }else{
          let hunt=p.aiHuntUntil>this.elapsed
            ? this.players.find(enemy=>enemy.id===p.aiHuntTargetId&&enemy.cells.length)
            : null;
          if(p.aiHuntUntil<=this.elapsed)p.aiHuntUntil=0;
          const attack=hunt
            ? {prey:hunt,target:hunt.cells.reduce((nearest,c)=>distance(c,lead)<distance(nearest,lead)?c:nearest,hunt.cells[0])}
            : findSplitHunt(p,this.players,this.elapsed,this.worldSize,MAX_CELLS,this.mode);
          if(attack){
            p.target={x:attack.target.x,y:attack.target.y};
            p.heading=Math.atan2(attack.target.y-lead.y,attack.target.x-lead.x);
            if(!hunt){
              p.aiHuntTargetId=attack.prey.id;
              p.aiHuntUntil=this.elapsed+2.5;
              const child=splitCell(p,lead,this.elapsed,this.worldSize,this.mode);
              if(child)p.cells.push(child);
            }
          }else{
            if(Math.random()<dt*.6)p.heading=rand(0,Math.PI*2);
            p.target={x:clamp(lead.x+Math.cos(p.heading)*520,0,this.worldSize),y:clamp(lead.y+Math.sin(p.heading)*520,0,this.worldSize)};
          }
        }
      }
      moveCells(p,dt,this.elapsed,this.worldSize,this.mode,p.npc?.73:1);
      if(!rules.autoSplitAfterEating)splitCells(p,this.elapsed,this.worldSize,MAX_CELLS,this.mode,threshold);
    }
    // Check pending virus respawns
    for (let i = this.virusRespawns.length - 1; i >= 0; i--) {
      const resp = this.virusRespawns[i];
      if (this.elapsed >= resp.time) {
        for (let k = 0; k < resp.count && this.viruses.length < VIRUS_MAX_COUNT; k++) {
          this.viruses.push(makeVirus(rand(120, this.worldSize - 120), rand(120, this.worldSize - 120)));
        }
        this.virusRespawns.splice(i, 1);
      }
    }
    stepViruses({viruses:this.viruses,food:this.food,players:this.players,width:this.worldSize,maxCells:Math.min(MAX_CELLS,physicsFor(this.mode).maxCells??MAX_CELLS),time:this.elapsed,dt,
      physics:physicsFor(this.mode),mergeDelay:mass=>mergeDelayFor(mass,this.mode),
      findFoodReceiver:pellet=>findFoodRecipient(pellet,this.players,this.elapsed),
      spawnVirus:()=>makeVirus(rand(120,this.worldSize-120),rand(120,this.worldSize-120)),
      addRespawn:(time,count)=>this.virusRespawns.push({time,count})});
    absorbFood(this.players,this.food,this.mode,this.elapsed);
    eatCells(this.players,this.mode,this.elapsed);
    // Check after all mass gains and before decay, once per player per update.
    if(rules.autoSplitAfterEating)for(const p of this.players)splitCells(p,this.elapsed,this.worldSize,MAX_CELLS,this.mode,threshold);
    decayMass(this.players,dt,this.mode);maintainBots(this.players,this.elapsed,this.worldSize);
    if(this.elapsed>=(this.nextFoodSpawnAt||0)){
      while(this.food.length<(this.mode==='ffa'?foodTargetFor(this.mode):270)){const point=foodPoint(this.players,this.worldSize);if(!point){this.nextFoodSpawnAt=this.elapsed+1;break;}this.food.push(point);}
    }
  }
}
export const normalizeAnimation = value => typeof value==='number'&&Number.isFinite(value)
  ? Math.round(clamp(value,0,500)/10)*10 : DEFAULT_SETTINGS.animation;

/** Presentation state only. Simulation cells and authoritative snapshots stay untouched. */
export class CellAnimator{
  constructor(){this.reset();}
  reset(){this.cells=new Map();this.localIds=new WeakMap();this.nextLocalId=0;}
  key(playerId,cell){
    if(cell.id!==undefined&&cell.id!==null)return playerId+'\0remote:'+cell.id;
    if(!this.localIds.has(cell))this.localIds.set(cell,++this.nextLocalId);
    return playerId+'\0local:'+this.localIds.get(cell);
  }
  sample(players,durationMs=DEFAULT_SETTINGS.animation,dt=1/60,worldSize=WORLD_SIZE){
    const duration=normalizeAnimation(durationMs);
    const elapsed=Number.isFinite(dt)?Math.max(0,dt):1/60;
    const alpha=duration===0?1:-Math.expm1(-elapsed*1000/duration);
    const next=new Map(),previousByPlayer=new Map();
    for(const state of this.cells.values()){
      if(!previousByPlayer.has(state.playerId))previousByPlayer.set(state.playerId,[]);
      previousByPlayer.get(state.playerId).push(state);
    }
    const rendered=players.map(p=>({...p,cells:(p.cells||[]).map(cell=>{
      const key=this.key(p.id,cell),targetRadius=radius(cell.mass);
      let state=this.cells.get(key);
      if(!state){
        const siblings=previousByPlayer.get(p.id)||[];
        const originX=cell.originX??cell.x,originY=cell.originY??cell.y;
        const parent=duration>0?siblings.reduce((closest,s)=>!closest||Math.hypot(s.x-originX,s.y-originY)<Math.hypot(closest.x-originX,closest.y-originY)?s:closest,null):null;
        state=parent?{x:parent.x,y:parent.y,radius:targetRadius}:{x:cell.x,y:cell.y,radius:targetRadius};
      }
      // Respawns and large authoritative corrections should not fly across the map.
      const ratio=Math.hypot(cell.x-state.x,cell.y-state.y)>worldSize/4?1:alpha;
      const visual={playerId:p.id,x:state.x+(cell.x-state.x)*ratio,y:state.y+(cell.y-state.y)*ratio,radius:state.radius+(targetRadius-state.radius)*ratio};
      next.set(key,visual);
      return {...cell,x:visual.x,y:visual.y,renderRadius:visual.radius};
    })}));
    this.cells=next;
    return rendered;
  }
}

/** Stable virus IDs keep launch and charge animations continuous between network snapshots. */
export class VirusAnimator{
  constructor(){this.reset();}
  reset(){this.viruses=new Map();this.localIds=new WeakMap();this.nextLocalId=0;}
  sample(viruses,dt=1/60,worldSize=WORLD_SIZE,durationMs=60){
    const alpha=durationMs<=0?1:-Math.expm1(-Math.max(0,Number.isFinite(dt)?dt:1/60)*1000/durationMs),next=new Map();
    const rendered=viruses.map(virus=>{
      if(virus.id==null&&!this.localIds.has(virus))this.localIds.set(virus,++this.nextLocalId);
      const key=virus.id==null?'local:'+this.localIds.get(virus):'virus:'+virus.id;
      const r=virusRadius(virus),previous=this.viruses.get(key);
      const state=previous||{x:virus.originX??virus.x,y:virus.originY??virus.y,radius:r};
      const ratio=Math.hypot(virus.x-state.x,virus.y-state.y)>worldSize/4?1:alpha;
      const visual={x:state.x+(virus.x-state.x)*ratio,y:state.y+(virus.y-state.y)*ratio,radius:state.radius+(r-state.radius)*ratio};
      next.set(key,visual);return{...virus,x:visual.x,y:visual.y,renderRadius:visual.radius};
    });
    this.viruses=next;return rendered;
  }
}

/** Smooth only FFA feed presentation. Collection and flight stay authoritative. */
export class FeedAnimator{
  constructor(){this.reset();}
  reset(){this.pellets=new Map();this.localIds=new WeakMap();this.nextLocalId=0;}
  key(pellet){
    if(pellet.feedId!=null)return 'feed:'+pellet.feedId;
    if(!this.localIds.has(pellet))this.localIds.set(pellet,++this.nextLocalId);
    return 'local:'+this.localIds.get(pellet);
  }
  sample(food,dt=1/60,enabled=true,worldSize=WORLD_SIZE){
    if(!enabled){this.pellets.clear();return food;}
    const elapsed=Number.isFinite(dt)?Math.max(0,dt):1/60;
    const alpha=-Math.expm1(-elapsed/.045),next=new Map();
    const rendered=food.map(pellet=>{
      if(!pellet.ejected)return pellet;
      const key=this.key(pellet),previous=this.pellets.get(key);
      const state=previous||{x:pellet.x,y:pellet.y,age:0};
      // Do not interpolate a world reset or a large correction across the arena.
      const ratio=Math.hypot(pellet.x-state.x,pellet.y-state.y)>worldSize/4?1:alpha;
      const visual={x:state.x+(pellet.x-state.x)*ratio,y:state.y+(pellet.y-state.y)*ratio,age:state.age+elapsed};
      next.set(key,visual);
      return {...pellet,x:visual.x,y:visual.y,renderAlpha:Math.min(1,visual.age/.08)};
    });
    this.pellets=next;return rendered;
  }
}

/** A compact editable drawing, never executable markup or an external asset URL. */
export const BACKGROUND_MAX_ELEMENTS=240,BACKGROUND_MAX_POINTS=12000;
export function normalizeBackgroundDesign(value){
  if(!value||typeof value!=='object'||value.version!==1||!Array.isArray(value.elements))return null;
  const number=(v,fallback,min,max)=>Number.isFinite(v)?clamp(v,min,max):fallback;
  const color=(v,fallback='#ffffff')=>/^#[0-9a-f]{6}$/i.test(v)?v:fallback;
  const elements=[];let pointBudget=BACKGROUND_MAX_POINTS;
  for(const raw of value.elements.slice(0,BACKGROUND_MAX_ELEMENTS)){
    if(!raw||typeof raw!=='object')continue;
    const common={color:color(raw.color),opacity:number(raw.opacity,1,.05,1)};
    if(raw.type==='stroke'){
      const points=(Array.isArray(raw.points)?raw.points:[]).filter(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])).slice(0,Math.min(1200,pointBudget)).map(p=>[clamp(p[0],-1024,2048),clamp(p[1],-1024,2048)]);
      if(!points.length)continue;
      pointBudget-=points.length;
      elements.push({...common,type:'stroke',points,width:number(raw.width,8,1,100),erase:raw.erase===true});
    }else if(['shape','sticker','text'].includes(raw.type)){
      const item={...common,type:raw.type,x:number(raw.x,512,-1024,2048),y:number(raw.y,512,-1024,2048),rotation:number(raw.rotation,0,-180,180)};
      if(raw.type==='shape'){
        if(!['rect','ellipse','triangle','star','diamond','hexagon','cross','line','arrow'].includes(raw.shape))continue;
        Object.assign(item,{shape:raw.shape,w:number(raw.w,120,-2048,2048),h:number(raw.h,120,-2048,2048),width:number(raw.width,8,1,100),fill:raw.fill===true});
      }else{
        Object.assign(item,{text:Array.from(String(raw.text||'')).slice(0,raw.type==='sticker'?12:80).join(''),size:number(raw.size,80,12,360)});
        if(!item.text.trim())continue;
      }
      elements.push(item);
    }
  }
  return {version:1,baseColor:color(value.baseColor,'#061420'),elements,...(value.transparent===true?{transparent:true}:{})};
}
export function drawBackgroundDesign(ctx,design,size=1024){
  if(!design)return;
  ctx.save();ctx.beginPath();ctx.rect(0,0,size,size);ctx.clip();ctx.scale(size/1024,size/1024);
  if(!design.transparent){ctx.fillStyle=design.baseColor;ctx.fillRect(0,0,1024,1024);}
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const e of design.elements){
    ctx.save();ctx.globalAlpha=e.erase?1:e.opacity;ctx.fillStyle=e.erase?design.baseColor:e.color;ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=e.width||1;
    if(e.erase&&design.transparent)ctx.globalCompositeOperation='destination-out';
    if(e.type==='stroke'){
      ctx.beginPath();ctx.moveTo(...e.points[0]);for(const point of e.points.slice(1))ctx.lineTo(...point);
      if(e.points.length===1){ctx.arc(e.points[0][0],e.points[0][1],e.width/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();
    }else{
      ctx.translate(e.x,e.y);ctx.rotate((e.rotation||0)*Math.PI/180);
      if(e.type==='sticker'||e.type==='text'){
        ctx.font=`700 ${e.size}px Arial, "Segoe UI Emoji", sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(e.text,0,0,1000);
      }else{
        const w=e.w,h=e.h;ctx.beginPath();
        if(e.shape==='rect')ctx.rect(0,0,w,h);
        else if(e.shape==='ellipse')ctx.ellipse(w/2,h/2,Math.abs(w)/2,Math.abs(h)/2,0,0,Math.PI*2);
        else if(e.shape==='triangle'){ctx.moveTo(w/2,0);ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();}
        else if(e.shape==='diamond'){ctx.moveTo(w/2,0);ctx.lineTo(w,h/2);ctx.lineTo(w/2,h);ctx.lineTo(0,h/2);ctx.closePath();}
        else if(e.shape==='hexagon'){for(let i=0;i<6;i++){const a=i*Math.PI/3,x=w/2+Math.cos(a)*w/2,y=h/2+Math.sin(a)*h/2;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();}
        else if(e.shape==='cross'){for(const [i,[x,y]] of [[.35,0],[.65,0],[.65,.35],[1,.35],[1,.65],[.65,.65],[.65,1],[.35,1],[.35,.65],[0,.65],[0,.35],[.35,.35]].entries())i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h);ctx.closePath();}
        else if(e.shape==='star'){
          for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=i%2?.22:.5,x=w/2+Math.cos(a)*w*r,y=h/2+Math.sin(a)*h*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();
        }else{
          ctx.moveTo(0,0);ctx.lineTo(w,h);
          if(e.shape==='arrow'){const a=Math.atan2(h,w),tip=Math.max(18,e.width*3);ctx.moveTo(w-Math.cos(a-.5)*tip,h-Math.sin(a-.5)*tip);ctx.lineTo(w,h);ctx.lineTo(w-Math.cos(a+.5)*tip,h-Math.sin(a+.5)*tip);}
        }
        if(e.fill&&!['line','arrow'].includes(e.shape))ctx.fill();else ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

function prismGradient(ctx,size,time,speed){
  const gradient=ctx.createConicGradient?.(time*.65*speed,size/2,size/2);
  for(let i=0;i<=12;i++)gradient?.addColorStop(i/12,`hsl(${i*30%360},85%,65%)`);
  return gradient;
}
/** Visual sector scaling is independent of the server's fixed sight neighborhoods. */
export function drawArenaGuides(ctx,size,zoom,settings,time=0,pixelRatio=1){
  const z=Math.max(.001,zoom),s={...DEFAULT_SETTINGS,...settings},step=size/5*s.sectorScale/100,count=Math.ceil(size/step);
  if(s.showSectors){
    ctx.save();ctx.beginPath();ctx.rect(0,0,size,size);ctx.clip();
    ctx.globalAlpha=1;ctx.strokeStyle=s.sectorRainbow?(prismGradient(ctx,size,time,s.prismSpeed)||s.sectorGridColor):s.sectorGridColor;ctx.lineWidth=s.sectorGridWidth/z;
    ctx.beginPath();
    for(let i=1;i<count;i++){
      ctx.moveTo(i*step,0);ctx.lineTo(i*step,size);
      ctx.moveTo(0,i*step);ctx.lineTo(size,i*step);
    }
    ctx.stroke();
    // Readable even at 4% zoom, without letting labels fill a small sector.
    const fontSize=Math.min(s.sectorLabelSize,step*z*.35),corner=s.sectorLabelPosition==='corner';
    ctx.font=`600 ${fontSize/z}px Arial, sans-serif`;ctx.textAlign=corner?'left':'center';ctx.textBaseline=corner?'top':'middle';
    ctx.fillStyle=s.sectorColor;
    const inset=Math.max(fontSize*.8,s.sectorGridWidth+4)/z;
    for(let row=0;row<count;row++)for(let col=0;col<count;col++){
      const tileW=Math.min(step,size-col*step),tileH=Math.min(step,size-row*step);
      if(Math.min(tileW,tileH)*z<fontSize*2.5)continue;
      const x=col*step+(corner?inset:tileW/2),y=row*step+(corner?inset:tileH/2);
      ctx.fillText(String.fromCharCode(65+col)+(row+1),x,y);
    }
    ctx.restore();
  }
  if(!s.showBorders)return;
  ctx.save();ctx.globalAlpha=1;ctx.lineJoin='miter';ctx.lineCap='butt';
  const width=s.borderWidth/z,inset=width/2,span=size-width;
  ctx.lineWidth=width;
  if(s.borderGlow&&s.borderGlowDistance>0&&s.borderGlowStrength>0){
    ctx.strokeStyle=s.borderGlowColor;ctx.shadowColor=s.borderGlowColor;
    ctx.shadowBlur=s.borderGlowDistance*pixelRatio;
    ctx.globalAlpha=s.borderGlowStrength/100;
    ctx.strokeRect(inset,inset,span,span);
    ctx.shadowBlur=0;ctx.globalAlpha=1;
  }
  ctx.strokeStyle=s.borderColor;
  if(s.borderStyle==='prism'){
    // One closed stroke keeps all four corners seamless as the palette revolves.
    ctx.strokeStyle=prismGradient(ctx,size,time,s.prismSpeed)||s.borderColor;
  }
  ctx.strokeRect(inset,inset,span,span);
  ctx.restore();
}

export class ArenaRenderer{
  constructor(canvas,minimap,options={}){this.options=options;this.canvas=canvas;this.ctx=canvas.getContext('2d');this.radar=minimap;this.radarCtx=minimap.getContext('2d');this.cellAnimator=new CellAnimator();this.feedAnimator=new FeedAnimator();this.virusAnimator=new VirusAnimator();this.cam={x:WORLD_SIZE/2,y:WORLD_SIZE/2};this.zoom=.75;this.background=null;this.backgroundUrl='';this.worldTexture=null;this.worldTextureSource='';this.worldLogo=null;this.worldLogoUrl='';this.fps=60;this.lastFpsCheck=0;this.frames=0;this.last=performance.now();this.screenW=0;this.screenH=0;}
  resetAnimations(){this.cellAnimator.reset();this.feedAnimator.reset();this.virusAnimator.reset();}
  skinImage(source){
    if(typeof source!=='string'||!source||!(/^https?:\/\//i.test(source)||source.startsWith('/assets/')||source.startsWith('data:image/')))return null;
    this.skinImages??=new Map();
    if(!this.skinImages.has(source)){
      if(this.skinImages.size>=64)this.skinImages.delete(this.skinImages.keys().next().value);
      const img=new Image();img.decoding='async';img.src=source;this.skinImages.set(source,img);
    }
    return this.skinImages.get(source);
  }
  viewport(){return this.options.viewport?.()||{width:innerWidth,height:innerHeight,ratio:Math.min(globalThis.devicePixelRatio||1,2)};}
  resize(){const view=this.viewport(),ratio=view.ratio||1,w=Math.max(1,view.width),h=Math.max(1,view.height);this.canvas.width=Math.round(w*ratio);this.canvas.height=Math.round(h*ratio);this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';this.ctx.setTransform(ratio,0,0,ratio,0,0);this.screenW=w;this.screenH=h;}
  toWorld(x,y){return {x:this.cam.x+(x-this.screenW/2)/this.zoom,y:this.cam.y+(y-this.screenH/2)/this.zoom};}
  draw(snapshot,selectedId,settings=DEFAULT_SETTINGS,playing=false,dt=1/60,freeCamera=false,ownedIds=selectedId?[selectedId]:[]){const viewport=this.viewport();if(!this.screenW||this.screenW!==viewport.width||this.screenH!==viewport.height)this.resize();const ctx=this.ctx,W=this.screenW,H=this.screenH;
    const worldSize=snapshot?.worldSize||worldSizeFor(snapshot?.mode);
    const renderedPlayers=this.cellAnimator.sample(snapshot?.players||[],settings.animation,dt,worldSize);
    const renderedFood=this.feedAnimator.sample(snapshot?.food||[],dt,snapshot?.mode==='ffa',worldSize);
    const renderedViruses=this.virusAnimator.sample(snapshot?.viruses||[],dt,worldSize,Math.min(80,normalizeAnimation(settings.animation)));
    ctx.clearRect(0,0,W,H);ctx.fillStyle=settings.bgColor;ctx.fillRect(0,0,W,H);
    const backgroundSource=settings.backgroundUrl || '/assets/vintage-background.png';
    const useDrawing=settings.useDrawnBackground&&settings.backgroundDesign;
    if(!useDrawing&&settings.backgroundImage && this.backgroundUrl!==backgroundSource){
      this.backgroundUrl=backgroundSource;this.worldTexture=null;this.worldTextureSource='';this.background=new Image();this.background.decoding='async';this.background.src=backgroundSource;
    }
    const logoSource=useDrawing?'':settings.worldLogoUrl || '';
    if(this.worldLogoUrl!==logoSource){
      this.worldLogoUrl=logoSource;this.worldLogo=null;
      if(logoSource){this.worldLogo=new Image();this.worldLogo.decoding='async';this.worldLogo.src=logoSource;}
    }
    const me=renderedPlayers.find(p=>p.id===selectedId&&p.cells?.length);
    const ownPlayers=renderedPlayers.filter(p=>ownedIds.includes(p.id)&&p.cells?.length);
    const c=(ownPlayers.length?ownPlayers:[me].filter(Boolean)).flatMap(p=>p.cells);
    if(c.length&&playing&&!freeCamera){const centroid={x:c.reduce((s,x)=>s+x.x,0)/c.length,y:c.reduce((s,x)=>s+x.y,0)/c.length};const ratio=clamp((settings.cameraSmoothing||.1)*dt*60,.01,1);this.cam.x+=(centroid.x-this.cam.x)*ratio;this.cam.y+=(centroid.y-this.cam.y)*ratio;}
    const mass=c.reduce((s,x)=>s+x.mass,0)||1000;
    const targetZoom=clamp(settings.zoom||1,ZOOM_MIN,ZOOM_MAX)*(freeCamera||snapshot?.mode==='ffa'?1:clamp(1.05-Math.log10(Math.max(100,mass))/12,.48,.78));
    this.zoom+= (targetZoom-this.zoom)*clamp(dt*5,0,1);
    ctx.save();ctx.translate(W/2,H/2);ctx.scale(this.zoom,this.zoom);ctx.translate(-this.cam.x,-this.cam.y);
    const left=this.cam.x-W/this.zoom/2,top=this.cam.y-H/this.zoom/2,right=this.cam.x+W/this.zoom/2,bottom=this.cam.y+H/this.zoom/2;
    // Both images are fixed in WORLD coordinates and never tiled or shown outside the game square.
    ctx.save();ctx.beginPath();ctx.rect(0,0,worldSize,worldSize);ctx.clip();
    if(useDrawing){
      if(typeof document!=='undefined'&&document.createElement){
        if(this.drawnDesign!==settings.backgroundDesign){
          const texture=document.createElement('canvas');texture.width=1536;texture.height=1536;
          const g=texture.getContext('2d');
          if(g){drawBackgroundDesign(g,settings.backgroundDesign,1536);this.drawnTexture=texture;this.drawnDesign=settings.backgroundDesign;}
        }
        if(this.drawnTexture)ctx.drawImage(this.drawnTexture,0,0,worldSize,worldSize);
      }else drawBackgroundDesign(ctx,settings.backgroundDesign,worldSize);
    }else if(settings.backgroundImage && this.background?.complete && this.background.naturalWidth){
      const img=this.background;
      // Fill the square edge to edge with a centered, non-distorted crop, then
      // fit the entire artwork over it so that the Vintage lettering remains visible.
      // Both layers are drawn at fixed WORLD positions, never attached to the camera.
      const compose=(surface,g,size)=>{
        const cover=Math.max(size/img.naturalWidth,size/img.naturalHeight);
        const cw=img.naturalWidth*cover,ch=img.naturalHeight*cover;
        g.globalAlpha=settings.backgroundUrl?.75:.55;
        g.drawImage(img,(size-cw)/2,(size-ch)/2,cw,ch);
        const contain=Math.min(size/img.naturalWidth,size/img.naturalHeight);
        const bw=img.naturalWidth*contain,bh=img.naturalHeight*contain;
        g.globalAlpha=settings.backgroundUrl?.88:.82;
        g.drawImage(img,(size-bw)/2,(size-bh)/2,bw,bh);
        g.globalAlpha=1;
      };
      // Cache the two static background layers once. Only one texture draw per frame,
      // important for keeping gameplay smooth with large imported images.
      if(typeof document!=='undefined' && document.createElement){
        if(!this.worldTexture || this.worldTextureSource!==backgroundSource){
          const texture=document.createElement('canvas');texture.width=1536;texture.height=1536;
          const g=texture.getContext('2d');
          if(g){compose(texture,g,texture.width);this.worldTexture=texture;this.worldTextureSource=backgroundSource;}
        }
        if(this.worldTexture)ctx.drawImage(this.worldTexture,0,0,worldSize,worldSize);
      }else compose(null,ctx,worldSize);
      ctx.globalAlpha=1;
    }
    if(this.worldLogo?.complete && this.worldLogo.naturalWidth){
      const img=this.worldLogo,scale=Math.min(worldSize*.83/img.naturalWidth,worldSize*.34/img.naturalHeight);
      const lw=img.naturalWidth*scale,lh=img.naturalHeight*scale;
      ctx.globalAlpha=.87;ctx.drawImage(img,(worldSize-lw)/2,(worldSize-lh)/2,lw,lh);ctx.globalAlpha=1;
    }
    if(settings.showThemeArtwork&&settings.themeArtwork){
      if(typeof document!=='undefined'&&document.createElement){
        if(this.artworkDesign!==settings.themeArtwork){
          const texture=document.createElement('canvas');texture.width=1536;texture.height=1536;
          const g=texture.getContext('2d');if(g){drawBackgroundDesign(g,settings.themeArtwork,1536);this.artworkTexture=texture;this.artworkDesign=settings.themeArtwork;}
        }
        if(this.artworkTexture)ctx.drawImage(this.artworkTexture,0,0,worldSize,worldSize);
      }else drawBackgroundDesign(ctx,settings.themeArtwork,worldSize);
    }
    ctx.restore();
    if(settings.showGrid){
      // Keep the grid anchored to the arena and legible at very wide zoom.
      const step=110*Math.max(1,2**Math.ceil(Math.log2(32/(110*this.zoom))));
      ctx.save();ctx.beginPath();ctx.rect(0,0,worldSize,worldSize);ctx.clip();
      ctx.lineWidth=1/this.zoom;ctx.strokeStyle=settings.gridColor;ctx.globalAlpha=.45;ctx.beginPath();
      for(let x=Math.max(0,Math.floor(left/step)*step);x<=Math.min(right,worldSize);x+=step){ctx.moveTo(x,Math.max(0,top));ctx.lineTo(x,Math.min(worldSize,bottom));}
      for(let y=Math.max(0,Math.floor(top/step)*step);y<=Math.min(bottom,worldSize);y+=step){ctx.moveTo(Math.max(0,left),y);ctx.lineTo(Math.min(worldSize,right),y);}
      ctx.stroke();ctx.restore();
    }
    drawArenaGuides(ctx,worldSize,this.zoom,settings,performance.now()/1000,Math.min(globalThis.devicePixelRatio||1,2));
    // Limit live entities, not the static arena artwork, grid or square boundary.
    if(Array.isArray(snapshot?.vision)){
      ctx.beginPath();for(const v of snapshot.vision)ctx.rect(v.left,v.top,v.right-v.left,v.bottom-v.top);ctx.clip();
    }
    if(settings.showFood){
      for(const f of renderedFood){
        if(f.x<left-20||f.x>right+20||f.y<top-20||f.y>bottom+20)continue;
        const r=clamp((f.radius??Math.sqrt(f.mass)*1.7)*(settings.foodSize||1),3,15);
        ctx.fillStyle=settings.rainbowFood?(f.color||settings.foodColor):settings.foodColor;
        ctx.globalAlpha=.9*(f.renderAlpha??1);
        ctx.beginPath();ctx.arc(f.x,f.y,r,0,Math.PI*2);ctx.fill();
        // Keep FFA pellets clean and round without bright seams where they overlap.
        if(f.ejected&&f.radius&&snapshot?.mode!=='ffa'){ctx.lineWidth=r*.18;ctx.strokeStyle='rgba(255,255,255,.25)';ctx.stroke();}
      }
      ctx.globalAlpha=1;
    }
    if(snapshot?.viruses&&settings.showViruses){
      const tick=performance.now()/1000;
      for(const v of renderedViruses){
        const r=v.renderRadius;
        if(v.x<left-r*2||v.x>right+r*2||v.y<top-r*2||v.y>bottom+r*2)continue;
        const glow=1+0.05*Math.sin(tick*3+(v.x+v.y)*.02);
        ctx.save();ctx.translate(v.x,v.y);ctx.rotate(tick*.5);
        const outer=r*glow;
        const ringGrad=ctx.createRadialGradient(0,0,outer*.6,0,0,outer*1.3);
        ringGrad.addColorStop(0,settings.virusColor+'33');
        ringGrad.addColorStop(0.7,settings.virusColor+'80');
        ringGrad.addColorStop(1,settings.virusColor+'00');
        ctx.fillStyle=ringGrad;ctx.beginPath();ctx.arc(0,0,outer*1.4,0,Math.PI*2);ctx.fill();

        ctx.beginPath();ctx.arc(0,0,outer,0,Math.PI*2);
        ctx.fillStyle='#3a1224';ctx.fill();
        ctx.lineWidth=4/Math.max(this.zoom,.08);ctx.strokeStyle=settings.virusColor||'#f065b5';ctx.stroke();

        ctx.beginPath();ctx.arc(0,0,outer*.75,0,Math.PI*2);
        ctx.lineWidth=2/Math.max(this.zoom,.08);ctx.strokeStyle=settings.virusColor;ctx.setLineDash([4,4]);ctx.stroke();ctx.setLineDash([]);

        if(virusCharge(v)){
          ctx.beginPath();ctx.arc(0,0,outer*1.2,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.min(1,virusCharge(v)/VIRUS_CHARGE_MASS));
          ctx.lineWidth=4/Math.max(this.zoom,.08);ctx.strokeStyle='#ffd28a';ctx.stroke();
        }
        ctx.restore();
      }
    }
    const ordered=renderedPlayers.flatMap(p=>(p.cells||[]).map(cell=>({p,cell}))).sort((a,b)=>a.cell.mass-b.cell.mass);
    for(const {p,cell} of ordered){
      const r=cell.renderRadius,style=cellAppearance(p,selectedId,ownedIds,settings),fill=style.fill;
      const extent=style.indicator&&!style.active?r*Math.max(1,style.indicatorRatio):r;
      if(cell.x<left-extent||cell.x>right+extent||cell.y<top-extent||cell.y>bottom+extent)continue;
      ctx.globalAlpha=clamp(settings.cellOpacity??100,0,100)/100;
      ctx.beginPath();ctx.arc(cell.x,cell.y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();
      ctx.globalAlpha=1;
      if(settings.showSkins!==false){
        const skin=this.skinImage(cell.skinUrl||p.skinUrl);
        if(skin?.complete&&skin.naturalWidth){ctx.save();ctx.globalAlpha=clamp(settings.cellOpacity??100,0,100)/100;ctx.beginPath();ctx.arc(cell.x,cell.y,r,0,Math.PI*2);ctx.clip();ctx.drawImage(skin,cell.x-r,cell.y-r,r*2,r*2);ctx.restore();}
      }
      if(settings.canvasCellEffects&&settings.showSkins!==false){
        ctx.beginPath();ctx.arc(cell.x,cell.y,Math.max(0,r-7),0,Math.PI*2);ctx.fillStyle='#08131d';ctx.globalAlpha=.18;ctx.fill();
        ctx.lineWidth=5;ctx.strokeStyle=fill;ctx.globalAlpha=.75;ctx.beginPath();ctx.arc(cell.x,cell.y,Math.max(0,r-4),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
      }
      const border=r*style.borderRatio;
      const outlineRadius=r*(style.active?1:style.indicatorRatio);
      if(border>0&&outlineRadius>0){
        const lineWidth=Math.min(border,outlineRadius);
        ctx.lineWidth=lineWidth;ctx.strokeStyle=style.borderColor;ctx.beginPath();ctx.arc(cell.x,cell.y,outlineRadius-lineWidth/2,0,Math.PI*2);ctx.stroke();
      }
      // Keep the nickname legible at common zoom levels, with OR WITHOUT a team tag.
      const readability=Math.max(this.zoom,.17);
      const fontSize=clamp(r*.23,8/readability,48/readability)*settings.nickSize;
      const massFont=clamp(r*.22,8/readability,40/readability)*settings.massSize;
      const labelColor=tagColor(p.teamId??p.tag),nameVisible=settings.showNames&&r*this.zoom>=22;
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=labelColor;
      ctx.lineJoin='round';ctx.lineWidth=2.5/readability;ctx.strokeStyle='#000000';
      const hasMass=settings.showMass&&r*this.zoom>=14;
      const name=(p.name||'Player').trim().slice(0,20)||'Player';
      const nameY=cell.y+(hasMass?-fontSize*.42:0);
      if(nameVisible){
        ctx.font=`700 ${fontSize}px Arial, sans-serif`;ctx.strokeText(name,cell.x,nameY,r*1.8);ctx.fillText(name,cell.x,nameY,r*1.8);
      }
      if(hasMass){ctx.font=`700 ${massFont}px Arial, sans-serif`;ctx.fillStyle=labelColor;
        const label=formatCellMass(cell.mass,settings.shortMass),massY=cell.y+(nameVisible?massFont*.65:0);
        ctx.strokeText(label,cell.x,massY);ctx.fillText(label,cell.x,massY);
      }
      ctx.textBaseline='alphabetic';
    }
    ctx.restore();
    this.drawRadar(snapshot,selectedId,settings,ownedIds);
    this.frames++;if(performance.now()-this.lastFpsCheck>800){this.fps=Math.round(this.frames*1000/(performance.now()-this.lastFpsCheck||1000));this.frames=0;this.lastFpsCheck=performance.now();}
  }
  drawRadar(snapshot,id,settings,ownedIds=id?[id]:[]){
    const worldSize=snapshot?.worldSize||worldSizeFor(snapshot?.mode);
    const ctx=this.radarCtx,size=240,padding=5,inner=size-padding*2;
    ctx.clearRect(0,0,size,size);
    if(!settings.showMinimap||!snapshot)return;
    const peers=getVisibleAllies(snapshot,id).sort((a,b)=>Number(a.id===id)-Number(b.id===id));
    for(const p of peers){
      const total=totalMass(p),weight=Math.max(total,1);
      const x=p.cells.reduce((s,c)=>s+c.x*c.mass,0)/weight;
      const y=p.cells.reduce((s,c)=>s+c.y*c.mass,0)/weight;
      const px=padding+clamp(x/worldSize,0,1)*inner,py=padding+clamp(y/worldSize,0,1)*inner;
      const mine=ownedIds.includes(p.id),r=p.id===id?3.5:3;
      ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);ctx.fill();
      if(!mine){
        ctx.font='600 11px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
        ctx.lineWidth=2.5;ctx.strokeStyle='rgba(0,0,0,.8)';
        const name=String(p.name||'Player').slice(0,18),labelX=clamp(px,35,size-35),labelY=py>size-22?py-16:py+6;
        ctx.strokeText(name,labelX,labelY,inner);ctx.fillText(name,labelX,labelY,inner);
      }
    }
  }
}
