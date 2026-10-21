import {THEMES} from './themes.js';
import {MODES, DEFAULT_SETTINGS, LocalArena, ArenaRenderer, AUTO_SPLIT_MASS, WORLD_SIZE, sectorAt, totalMass, getVisibleAllies} from './game.js';

const $ = id => document.getElementById(id);
const SETTINGS_KEY = 'vintage-settings-v2';
const HEX = /^#[0-9a-fA-F]{6}$/;
function cleanHex(value,fallback){return HEX.test(String(value))?String(value):fallback;}
function cleanAssetUrl(value){
  const candidate=String(value||'').trim().slice(0,1200);
  if(!candidate)return '';
  try{const url=new URL(candidate,location.origin);return ['https:','http:'].includes(url.protocol)?url.href:'';}catch{return '';}
}

const cloneDefaults = () => ({...DEFAULT_SETTINGS, chatCommands:[...DEFAULT_SETTINGS.chatCommands]});
const valueSafe = (saved={}) => {
  const next = cloneDefaults();
  for (const [key, val] of Object.entries(saved || {})) {
    if (!(key in next)) continue;
    if (Array.isArray(next[key]) && Array.isArray(val)) next[key] = [...val].slice(0, 10);
    else if(key==='customTheme' && val && typeof val==='object' && !Array.isArray(val)){
      const colors={};
      for(const prop of ['accentColor','panelColor','textColor','bgColor','gridColor','ownColor','secondColor','foodColor','virusColor'])
        colors[prop]=cleanHex(val[prop],next[prop]);
      next.customTheme={name:String(val.name||'My theme').slice(0,32),...colors,backgroundUrl:cleanAssetUrl(val.backgroundUrl),worldLogoUrl:cleanAssetUrl(val.worldLogoUrl)};
    }
    else if (typeof val === typeof next[key]) next[key] = val;
  }
  return next;
};

let settings = (()=>{ try { return valueSafe(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')); } catch { return cloneDefaults(); }})();
let mode='ffa', playing=false, spectating=false, spectateTargetId='', activeSlot=0, remote=null, hudVisible=true, chatChannel='all', isSettingsOpen=false, frameTime=performance.now();
let nickname='Vintage Player', tag='';
let region='EU', browseRegion='EU', serverId='eu-ffa', selectedServer=null, sessionServerId=null, sessionMode=null;
const serverUrl=()=>String(selectedServer?.wsUrl || window.VINTAGE_CONFIG?.wsUrl || '').trim();
let showDeaths=false, remoteSnapshot=null;
const RESTART_INTERVAL=3*60*60*1000;
let nextRestartAt=0, shownRestartWarnings=new Set(), restartNoticeUntil=0;
const asTimer = ms => {
  const n=Math.max(0,Math.ceil(ms/1000));
  return [Math.floor(n/3600),Math.floor(n%3600/60),n%60].map(x=>String(x).padStart(2,'0')).join(':');
};
function displayServerNotice(message,ms=13000){
  const node=$('server-announcement');node.textContent=message;node.classList.remove('hidden');
  restartNoticeUntil=Date.now()+ms;
  addChat('system',message,'all');
}
function setRestartClock(at){
  nextRestartAt=Number.isFinite(Number(at)) ? Number(at) : 0;
  shownRestartWarnings=new Set();
}
function updateRestartClock(now=Date.now()){
  const label=$('restart-label'),count=$('restart-countdown');
  if(!(playing||spectating)||!nextRestartAt){$('restart-status').classList.add('hidden');return;}
  $('restart-status').classList.remove('hidden');
  label.textContent=remote ? 'SERVER RESTART' : 'LOCAL DEMO RESET';
  const remaining=nextRestartAt-now;
  count.textContent=asTimer(remaining);
  if(!remote){
    for(const minute of [10,5]){
      if(remaining<=minute*60000 && remaining>0 && !shownRestartWarnings.has(minute)){
        shownRestartWarnings.add(minute);
        displayServerNotice('Local demo world resets in '+minute+' minutes');
      }
    }
    if(remaining<=0){
      arena.reset(mode,nickname,tag,true,settings,spectating);
      setRestartClock(now+RESTART_INTERVAL);
      displayServerNotice('Local demo world reset • New 3-hour round started');
    }
  }
  if(restartNoticeUntil && now>restartNoticeUntil){
    restartNoticeUntil=0;$('server-announcement').classList.add('hidden');
  }
}
let pointer={x:innerWidth/2+100,y:innerHeight/2}, rightDown=false, macroFeedHeld=false,nextMacroFeedAt=0;
let pointerOverField=false, draggingCamera=false, dragPointer=null;
let settingsTab='game', settingsPage='Render';

const arena = new LocalArena();
arena.reset('ffa', nickname, tag, true, settings);
const renderer = new ArenaRenderer($('arena'), $('minimap-canvas'));
renderer.resize();

const toName = (s,max=18)=>String(s||'').trim().slice(0,max).replace(/[<>\u0000-\u001f]/g,'')||'Vintage Player';
const toTag = s => String(s||'').trim().slice(0,8).replace(/[<>\u0000-\u001f]/g,'');

function saveSettings(){ try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }catch{} applySettings(); }
function updateProfileName(){ const name = toName($('nickname')?.value || nickname); const node = $('profile-name'); if(node) node.textContent = name; }
function applySettings(){
  document.documentElement.style.setProperty('--accent', cleanHex(settings.accentColor,'#a9dcff'));
  const theme=THEMES[settings.themePreset] || THEMES.vintage;
  const custom=settings.themePreset==='custom' && settings.customTheme;
  document.body.dataset.theme=custom?'custom':(THEMES[settings.themePreset]?settings.themePreset:'vintage');
  document.documentElement.style.setProperty('--theme-panel',cleanHex(custom?.panelColor||settings.panelColor||theme.panel,theme.panel));
  document.documentElement.style.setProperty('--text',cleanHex(custom?.textColor||settings.textColor,'#f5f9ff'));
  document.documentElement.style.setProperty('--hud-border',cleanHex(settings.gridColor,'#27323e'));
  document.documentElement.style.setProperty('--pink',cleanHex(settings.secondColor,'#f065b5'));
  document.documentElement.style.setProperty('--accent2',cleanHex(settings.secondColor,'#bd93ff'));
  document.documentElement.style.setProperty('--theme-radius',theme.radius);
  document.body.classList.toggle('vintage-background-enabled',settings.backgroundImage);
  $('leaderboard').classList.toggle('hidden', !settings.showLeaderboard || !hudVisible);
  $('minimap').classList.toggle('hidden', !settings.showMinimap || !hudVisible);
  $('chat').classList.toggle('hidden', !settings.showChat || !hudVisible);
  $('help-panel')?.classList.toggle('hidden', !settings.showHelp || !hudVisible);
}
function setLobbyState(isLobby){ document.body.classList.toggle('show-lobby', !!isLobby); document.body.classList.toggle('is-spectating', !isLobby&&spectating); }
function setCameraControlsVisible(){
  const active=(playing||spectating) && !document.body.classList.contains('show-lobby');
  $('zoom-panel').classList.toggle('hidden', !active || spectating);
  document.body.classList.toggle('is-spectating',spectating);
  $('zoom-value').textContent=Math.round(settings.zoom*100)+'%';
}
function adjustZoom(factor,x=innerWidth/2,y=innerHeight/2){
  if(!playing&&!spectating)return;
  const before=spectating?renderer.toWorld(x,y):null;
  const next=clampClient(settings.zoom*factor, spectating?.07:.25, spectating?5.5:4.2);
  settings.zoom=next;
  if(spectating){
    renderer.zoom=next;
    renderer.cam.x=clampClient(before.x-(x-renderer.screenW/2)/next,0,WORLD_SIZE);
    renderer.cam.y=clampClient(before.y-(y-renderer.screenH/2)/next,0,WORLD_SIZE);
  }
  $('zoom-value').textContent=Math.round(next*100)+'%';
  saveSettings();
}
const clampClient=(v,min,max)=>Math.max(min,Math.min(max,v));
function toast(msg){ const d=document.createElement('div'); d.className='toast'; d.textContent=msg; $('toast-area').appendChild(d); setTimeout(()=>d.remove(),3200); }

function updateMode(next){
  if(!MODES[next]) return;
  mode = next;
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected', b.dataset.mode===mode));
  $('top-mode').textContent = mode.toUpperCase() + ' · '+region;
  $('mode-label').textContent = MODES[mode].title + ' MODE';
  const label=$('lobby-mode-name'),mass=$('lobby-mode-mass');
  if(label)label.textContent=MODES[mode].title;
  if(mass)mass.textContent='STARTS AT '+MODES[mode].start.toLocaleString('en-US')+' MASS';
  if(!playing && !spectating) arena.reset(mode, nickname, tag, true, settings);
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
}

function enterLobby(){
  macroFeedHeld=false;rightDown=false;pointerOverField=false;
  setLobbyState(true);$('lobby').classList.remove('hidden');$('gameover').classList.add('hidden');
  $('play-btn').innerHTML=playing ? '<span>▶</span> RESUME MATCH <span>↗</span>' : '<span>▶</span> PLAY NOW <span>↗</span>';
  setCameraControlsVisible();
}
function leaveSession(){
  playing=false;spectating=false;showDeaths=false;
  const old=remote;remote=null;old?.disconnect();remoteSnapshot=null;
  sessionServerId=null;sessionMode=null;setRestartClock(0);
}

function beginGame(){
  if(playing && sessionMode===mode && sessionServerId===serverId &&
     toName($('nickname').value)===nickname && toTag($('team-tag').value)===tag){
    setLobbyState(false);$('lobby').classList.add('hidden');$('gameover').classList.add('hidden');
    setCameraControlsVisible();return;
  }
  leaveSession();sessionMode=mode;sessionServerId=serverId;

  nickname = toName($('nickname').value); tag = toTag($('team-tag').value);
  $('nickname').value = nickname; $('team-tag').value = tag;
  $('chat-tag-label').textContent = tag ? ('#'+tag.toUpperCase()) : 'NO TAG';
  if(!tag){chatChannel='all';updateChatTabs();}
  updateProfileName();
  macroFeedHeld=false;activeSlot=0; remoteSnapshot=null; showDeaths=false; spectating=false; spectateTargetId=''; playing=true;
  setLobbyState(false);
  setCameraControlsVisible();
  $('lobby').classList.add('hidden'); $('gameover').classList.add('hidden'); clearChat();
  const multi = true;
  arena.reset(mode, nickname, tag, multi, settings);
  remote?.disconnect(); remote=null;
  const wsUrl = serverUrl();
  setRestartClock(wsUrl&&/^wss?:\/\//i.test(wsUrl)?0:Date.now()+RESTART_INTERVAL);
  if(wsUrl && /^wss?:\/\//i.test(wsUrl)){
    remote = new RemoteArena(wsUrl,{mode,nickname,tag,multi});
    remote.connect();
    $('connection-status').innerHTML = '<i></i> CONNECTING';
    $('chat-online').textContent = 'CONNECTING';
  }else{
    $('connection-status').innerHTML = '<i></i> DEMO MODE';
    $('chat-online').textContent = 'LOCAL DEMO';
    addChat('system','You are playing against local AI. Configure /config.js for online multiplayer.','all');
  }
}

class RemoteArena{
  constructor(url,opts){ this.url=url; this.opts=opts; this.sockets=[]; this.myIds=[]; this.latest=null; this.connected=false;
    this.latencyMs=null;this.lastPingAt=0;this.pingStarted=0;this.pingId=0;this.pingTimer=null; }
  connect(){ const total=this.opts.spectator?1:(this.opts.multi?2:1); for(let n=0;n<total;n++) this.open(n);
    this.pingTimer=setInterval(()=>this.probe(),2500); }
  probe(){const ws=this.sockets[0];if(ws?.readyState!==WebSocket.OPEN)return;
    const nonce=++this.pingId;this.pingStarted=performance.now();this.lastPingAt=Date.now();
    this.send(0,{type:'ping',nonce});}
  open(slot){
    let ws; try{ ws=new WebSocket(this.url); }catch{ toast('Invalid WebSocket server URL'); return; }
    this.sockets[slot]=ws;
    ws.addEventListener('open',()=>{ const packet=this.opts.spectator?{type:'spectate',mode:this.opts.mode}:{type:'join',mode:this.opts.mode,name:slot?this.opts.nickname+' II':this.opts.nickname,tag:this.opts.tag};ws.send(JSON.stringify(packet)); });
    ws.addEventListener('message',e=>{
      let payload; try{ payload=JSON.parse(e.data); }catch{ return; }
      if(payload.type==='spectator_welcome'){
        this.connected=true; $('connection-status').innerHTML='<i></i> LIVE SPECTATE'; $('connection-status').classList.add('online'); $('chat-online').textContent='LIVE';
      }
      if(payload.type==='welcome'){
        this.myIds[slot]=payload.playerId; this.connected=true;
        $('connection-status').innerHTML='<i></i> ONLINE'; $('connection-status').classList.add('online'); $('chat-online').textContent='LIVE';
        if(slot===0){ addChat('system','Connected to the '+MODES[mode].title+' room.','all');this.probe(); }
      }
      if(payload.type==='state' && slot===0){ this.latest=payload; remoteSnapshot=payload; }
      if(payload.type==='server_schedule' && slot===0) setRestartClock(payload.nextRestartAt);
      if(payload.type==='server_notice' && slot===0) displayServerNotice(payload.message);
      if(payload.type==='server_restarted' && slot===0){
        this.restarting=true;
        displayServerNotice('Server restarted • Reconnecting all players...');
      }
      if(payload.type==='pong' && slot===0 && payload.nonce===this.pingId){this.latencyMs=Math.round(performance.now()-this.pingStarted);}

      if(payload.type==='respawned' && slot===0) toast('Multi respawned at cursor');
      if(payload.type==='chat' && slot===0) addChat(payload.name,payload.text,payload.channel,payload.tag);
      if(payload.type==='error' && slot===0) toast(payload.message || 'Server error');
    });
    ws.addEventListener('close',event=>{
      if(slot===0 && event.code===4001 && remote===this && (playing||spectating)){
        this.connected=false;this.myIds=[];this.latest=null;remoteSnapshot=null;
        clearInterval(this.pingTimer);this.pingTimer=null;
        $('connection-status').innerHTML='<i></i> RECONNECTING';
        setTimeout(()=>{if(remote===this && (playing||spectating)) this.connect();},1500);
        return;
      }
      if(slot===0 && (playing||spectating) && remote===this){
        this.connected=false;clearInterval(this.pingTimer);this.pingTimer=null;$('connection-status').innerHTML='<i></i> OFFLINE'; $('connection-status').classList.remove('online'); $('chat-online').textContent='OFFLINE';
        toast('Connection lost. Reconnect to start a new match.'); playing=false;spectating=false;enterLobby(); 
      }
    });
    ws.addEventListener('error',()=>{ if(slot===0) toast('WebSocket connection failed'); });
  }
  send(slot,msg){ const socket=this.sockets[slot]; if(socket?.readyState===WebSocket.OPEN) socket.send(JSON.stringify(msg)); }
  sendChat(text,channel){ this.send(0,{type:'chat',channel,text}); }
  sendControl(slot,world){ this.send(slot,{type:'move',x:world.x,y:world.y}); }
  sendAction(slot,action){ this.send(slot,{type:action}); }
  respawn(slot,position){this.send(slot,{type:'respawn',x:position.x,y:position.y});}
  disconnect(){ clearInterval(this.pingTimer);this.pingTimer=null; for(const s of this.sockets){ if(s && [0,1].includes(s.readyState)){ try{s.close(1000,'Switch game');}catch{} } } this.connected=false; this.sockets=[]; }
}

function clearChat(){ chatHistory.length=0;$('chat-messages').replaceChildren(); }
const chatHistory=[];
function addChat(name,message,channel='all',messageTag=''){
  const row={name:String(name).slice(0,25), text:String(message).slice(0,180), channel, tag:messageTag||''};
  chatHistory.push(row); if(chatHistory.length>100) chatHistory.shift(); renderChat();
}
function renderChat(){
  const list=$('chat-messages'); list.replaceChildren();
  for(const line of chatHistory.slice(-40)){
    if(chatChannel==='tag' && line.channel!=='tag' && line.name!=='system') continue;
    if(chatChannel==='all' && line.channel==='tag') continue;
    const p=document.createElement('div'); p.className='msg';
    if(line.name==='system'){ p.className+=' system'; p.textContent=line.text; }
    else {
      const n=document.createElement('span'); n.className='who'; n.textContent=(line.tag?'['+line.tag+'] ':'')+line.name+': ';
      p.append(n,document.createTextNode(line.text));
    }
    list.appendChild(p);
  }
  list.scrollTop=list.scrollHeight;
}
function sendMessage(text){
  text=String(text).trim().slice(0,180); if(!text) return;
  if(chatChannel==='tag' && !tag){ toast('Enter a team tag to use Tag chat'); return; }
  if(remote){if(remote.connected)remote.sendChat(text,chatChannel);else toast('Chat unavailable until connected');}
  else addChat(nickname,text,chatChannel,tag);
}

function activeId(){ return remote ? (remote.myIds[Math.min(activeSlot,remote.myIds.length-1)]||remote.myIds[0]) : (arena.myIds[Math.min(activeSlot,arena.myIds.length-1)]||arena.myIds[0]); }
function selectedId(snapshot){ return spectating ? null : activeId(); }
function beginSpectate(){
  leaveSession();
  spectating=true; playing=false; showDeaths=false; spectateTargetId=''; rightDown=false; draggingCamera=false;
  setLobbyState(false); $('lobby').classList.add('hidden'); $('gameover').classList.add('hidden');
  const wsUrl=serverUrl();
  setRestartClock(wsUrl&&/^wss?:\/\//i.test(wsUrl)?0:Date.now()+RESTART_INTERVAL);
  remote?.disconnect(); remote=null; remoteSnapshot=null;
  arena.reset(mode, 'Spectator', '', false, settings, true);
  renderer.cam={x:WORLD_SIZE/2,y:WORLD_SIZE/2};
  renderer.zoom=clampClient(settings.zoom,.07,5.5);
  if(wsUrl && /^wss?:\/\//i.test(wsUrl)){
    remote=new RemoteArena(wsUrl,{mode,nickname:'Spectator',tag:'',multi:false,spectator:true});
    remote.connect(); $('connection-status').innerHTML='<i></i> CONNECTING'; $('chat-online').textContent='CONNECTING';
  }else{
    $('connection-status').innerHTML='<i></i> DEMO MODE'; $('chat-online').textContent='LOCAL';
    addChat('system','Free camera: move mouse to explore, drag to pan, wheel to zoom.','all');
  }
  setCameraControlsVisible();
}
function changeSlot(){
  const ids=remote?.connected?remote.myIds:arena.myIds;
  if(ids.length<2){toast('Waiting for Multi Connect 2');return;}
  const next=(activeSlot+1)%ids.length;
  const id=ids[next];
  if(!id){toast('Waiting for Multi connection');return;}
  const snap=remote?.connected?remoteSnapshot:arena.snapshot;
  const target=snap?.players?.find(p=>p.id===id);
  activeSlot=next;
  if(!target?.cells?.length){
    const world=renderer.toWorld(pointer.x,pointer.y);
    const sx=clampClient(world.x,0,WORLD_SIZE),sy=clampClient(world.y,0,WORLD_SIZE);
    if(remote?.connected){remote.respawn(next,{x:sx,y:sy});toast('Respawning Connect '+(next+1)+' at cursor');}
    else {if(arena.respawn(id,sx,sy))toast('Connect '+(next+1)+' respawned at cursor');else toast('Waiting for respawn cooldown');}
  }else toast('Controlling Connect '+(next+1));
}

function doAction(action){ if(!playing||spectating||isSettingsOpen||document.body.classList.contains('show-lobby')) return; const id=activeId(); if(remote?.connected){ remote.sendAction(activeSlot,action); } else { if(action==='split') arena.split(id,settings); if(action==='feed') arena.feed(id); } }
function repeatAction(action,count){ for(let i=0;i<count;i++) doAction(action); }
function stopMovement(){
  if(remote?.connected){
    const snap = remoteSnapshot?.players?.find(p=>p.id===activeId());
    const c = snap?.cells?.[0];
    if(c) remote.sendControl(activeSlot,{x:c.x,y:c.y});
  } else {
    const local = arena.getById(activeId());
    const c = local?.cells?.[0];
    if(c) arena.setTarget(activeId(),c.x,c.y);
  }
  toast('Movement stopped');
}
function setZoomLevel(level){ const values=[0.55,0.75,0.95,1.15,1.35]; settings.zoom = values[level-1] || 1; saveSettings(); setCameraControlsVisible(); toast('Zoom level '+level); }
function toggleSetting(key,label){ settings[key]=!settings[key]; saveSettings(); if(label) toast(label+' '+(settings[key]?'enabled':'disabled')); }
function triggerCommand(index){ const msg=settings.chatCommands[index]; if(msg) sendMessage(msg); }
function gameover(){ macroFeedHeld=false;showDeaths=true; playing=false; spectating=false; $('gameover').classList.remove('hidden'); $('death-score').textContent='Better luck next time. Return stronger.'; if(settings.autoRespawn) setTimeout(()=>{ if(showDeaths && !$('gameover').classList.contains('hidden')) beginGame(); },1800); }
function updateHUD(snapshot){
  const focusId=selectedId(snapshot);
  const me=snapshot?.players?.find(p=>p.id===focusId);
  const score=(me?.cells||[]).reduce((s,c)=>s+c.mass,0);
  $('mass-label').textContent=Math.floor(score).toLocaleString('en-US');
  $('cell-label').textContent=(me?.cells?.length||0)+' CELL'+((me?.cells?.length||0)===1?'':'S');
  $('mass-progress').style.width=Math.min(100,score/AUTO_SPLIT_MASS*100)+'%';
  $('fps-label').textContent=renderer.fps+' FPS';
  const ownIds=remote?.connected?remote.myIds:arena.myIds;
  const ownPlayers=(snapshot?.players||[]).filter(p=>ownIds.includes(p.id));
  const ownMass=ownPlayers.reduce((sum,p)=>sum+(p.cells||[]).reduce((n,c)=>n+c.mass,0),0);
  const ownCells=ownPlayers.reduce((n,p)=>n+(p.cells?.length||0),0);
  const realOnline=remote?.connected?(snapshot?.players||[]).filter(p=>!p.npc).length:0;
  $('stat-fps').textContent=String(renderer.fps);
  $('stat-ping').textContent=remote?.connected ? (remote.latencyMs!==null && Date.now()-remote.lastPingAt<10000 ? remote.latencyMs+' ms':'—') : (remote?'OFFLINE':'LOCAL');
  $('stat-score').textContent=Math.floor(ownMass).toLocaleString('en-US');
  $('stat-mass').textContent=Math.floor(score).toLocaleString('en-US');
  $('stat-cells').textContent=String(ownCells);
  $('stat-online').textContent=remote?.connected?String(realOnline):'DEMO';
  const visible=getVisibleAllies(snapshot,focusId);
  const teamTag=String(me?.tag||'').trim();
  $('allies-heading').textContent=teamTag?'ALLIES · '+teamTag.toUpperCase():'SOLO PLAYERS';
  $('player-count').textContent=visible.length+' VISIBLE';
  $('map-sector').textContent=me?.cells?.length?sectorAt(me.cells[0].x,me.cells[0].y):'—';
  $('map-team').textContent=teamTag?'#'+teamTag.toUpperCase():'NO TAG';
  const rows=visible.map(p=>({...p,total:totalMass(p)})).sort((a,b)=>b.total-a.total).slice(0,8);
  const container=$('board-entries');container.replaceChildren();
  for(let i=0;i<rows.length;i++){
    const p=rows[i],line=document.createElement('div');line.className='leader-entry'+(p.id===focusId?' is-me':'');
    const place=document.createElement('span'),n=document.createElement('b'),m=document.createElement('em');
    place.textContent=String(i+1);n.textContent=p.name;
    m.textContent=p.total>=1000?(p.total/1000).toFixed(1)+'k':Math.floor(p.total).toString();
    const sector=document.createElement('small');sector.className='ally-sector';
    sector.textContent=p.cells.length?sectorAt(p.cells[0].x,p.cells[0].y):'—';
    line.append(place,m,sector,n);container.appendChild(line);
  }
}

let controlAt=0, hudAt=0;
function gameLoop(now){
  const dt=Math.min(.05,(now-frameTime)/1000||.016); frameTime=now;
  if(playing && macroFeedHeld && !isSettingsOpen && now>=nextMacroFeedAt){
    doAction('feed');nextMacroFeedAt=now+85;
  }
  if((playing || spectating) && !isSettingsOpen && !document.body.classList.contains('show-lobby')){
    if(spectating && !draggingCamera && pointerOverField){
      const edge=(pos,size)=>{const n=(pos/size-.5)*2,dead=.23;return Math.sign(n)*Math.pow(Math.max(0,Math.abs(n)-dead)/(1-dead),1.55)};
      const speed=780*dt/Math.max(renderer.zoom,.09);
      renderer.cam.x=clampClient(renderer.cam.x+edge(pointer.x,innerWidth)*speed,0,WORLD_SIZE);
      renderer.cam.y=clampClient(renderer.cam.y+edge(pointer.y,innerHeight)*speed,0,WORLD_SIZE);
    }
    const world=renderer.toWorld(renderer.screenW/2+(pointer.x-renderer.screenW/2)*settings.mouseSensitivity,renderer.screenH/2+(pointer.y-renderer.screenH/2)*settings.mouseSensitivity);
    const slot=(rightDown && settings.rightClickMove && (remote?.myIds.length || arena.myIds.length)>1)?1:activeSlot;
    if(playing){
      if(remote?.connected){ if(now-controlAt>60){ remote.sendControl(slot,world); controlAt=now; } }
      else { const id=arena.myIds[slot] || activeId(); arena.setTarget(id,world.x,world.y); }
    }
    }
  if(!remote && !showDeaths) arena.tick((playing||spectating)?dt:dt*.45,settings);
  const snap = remote ? (remoteSnapshot || {players:[],food:[],viruses:[],worldSize:WORLD_SIZE}) : arena.snapshot;
  const focusId=selectedId(snap);
  renderer.draw(snap, focusId, settings, playing, dt, spectating);
  if(now-hudAt>280){ hudAt=now; updateHUD(snap); if(playing && (!remote || remote.connected) && snap.players?.length){const ids=remote?.connected?remote.myIds:arena.myIds;if(ids.length && ids.every(id=>id && !snap.players.find(p=>p.id===id)?.cells?.length)){gameover();}} }
  if(now-hudAt<20) updateRestartClock(Date.now());
  requestAnimationFrame(gameLoop);
}

const S = {
  game:{
    Render:[
      {key:'showGrid',label:'Background grid',type:'toggle'},
      {key:'showSectors',label:'Sector labels',type:'toggle'},
      {key:'showBorders',label:'World border',type:'toggle'},
      {key:'borderWidth',label:'Border width',type:'range',min:1,max:12,step:1},
    ],
    Cells:[
      {key:'showNames',label:'Player names',type:'toggle'},
      {key:'showMass',label:'Cell mass values',type:'toggle'},

      {key:'cellOpacity',label:'Cell opacity',type:'range',min:30,max:100,step:5},
    ],
    Elements:[
      {key:'showFood',label:'Show food',type:'toggle'},
      {key:'showViruses',label:'Show viruses',type:'toggle'},
      {key:'foodSize',label:'Food size',type:'range',min:.5,max:2,step:.1},
    ],
    Camera:[
      {key:'zoom',label:'Camera zoom',type:'range',min:.3,max:3.2,step:.1},
      {key:'wheelZoom',label:'Mouse wheel zoom',type:'toggle'},
      {key:'wheelZoomSensitivity',label:'Wheel zoom sensitivity',type:'range',min:.4,max:2,step:.1},
      {key:'cameraSmoothing',label:'Camera smoothing',type:'range',min:.02,max:.6,step:.02},
      {key:'mouseSensitivity',label:'Cursor sensitivity',type:'range',min:.5,max:1.8,step:.1},
    ],
    Helpers:[
      {key:'showLeaderboard',label:'Leaderboard',type:'toggle'},
      {key:'showMinimap',label:'Minimap',type:'toggle'},
      {key:'showChat',label:'Chat box',type:'toggle'},
      {key:'autoRespawn',label:'Automatic respawn after death',type:'toggle'},
    ]
  },
  theme:{
    'Theme presets':[],
    'PUT UR THEME':[],
    HUD:[
      {key:'accentColor',label:'Accent color',type:'color'},
      {key:'panelColor',label:'HUD / panel color',type:'color'},
      {key:'textColor',label:'Text color',type:'color'},
      {key:'foodColor',label:'Food color',type:'color'},
      {key:'virusColor',label:'Virus color',type:'color'},
    ],
    Cells:[
      {key:'ownColor',label:'Primary cell color',type:'color'},
      {key:'secondColor',label:'Secondary cell color',type:'color'},
      {key:'nickSize',label:'Nickname size',type:'range',min:.6,max:1.8,step:.1},
      {key:'massSize',label:'Mass label size',type:'range',min:.6,max:1.8,step:.1},
      {key:'cellOpacity',label:'Cell opacity',type:'range',min:30,max:100,step:5},
    ],
    Border:[
      {key:'gridColor',label:'Grid / sector color',type:'color'},
      {key:'borderWidth',label:'Border width',type:'range',min:1,max:12,step:1},
    ],
    Background:[
      {key:'bgColor',label:'Background color',type:'color'},
      {key:'backgroundImage',label:'Use background image',type:'toggle'},
      {key:'backgroundUrl',label:'Static background URL (inside server square)',type:'url'},
      {key:'worldLogoUrl',label:'Center logo URL (fit inside square)',type:'url'},
    ]
  },
  controls:{
    Keyboard:[
      {key:'keyMenu',label:'Toggle menu',type:'key'},
      {key:'keyHUD',label:'Toggle HUD',type:'key'},
      {key:'keySaveReplay',label:'Save replay',type:'coming'},
      {key:'keyChat',label:'Chat',type:'key'},
      {key:'keyChatToggle',label:'Toggle chat mode',type:'key'},
      {key:'keySpectateMode',label:'Toggle spectate mode',type:'key'},
      {key:'keySplit',label:'Split',type:'key'},
      {key:'keyDoubleSplit',label:'Double split',type:'key'},
      {key:'keyTripleSplit',label:'Triple split',type:'key'},
      {key:'keySplit16',label:'Split 16',type:'key'},
      {key:'keySplit32',label:'Split 32',type:'key'},
      {key:'keySplit64',label:'Split 64',type:'key'},
      {key:'keyFeed',label:'Feed',type:'key'},
      {key:'keyMacroFeed',label:'Macro feed',type:'key'},
      {key:'keySwitch',label:'Dual toggle',type:'key'},
      {key:'keyStopMove',label:'Stop movement',type:'key'},
      {key:'keyToggleNames',label:'Toggle cell nick',type:'key'},
      {key:'keyToggleMass',label:'Toggle cell mass',type:'key'},
      {key:'keyToggleSkin',label:'Toggle skin',type:'coming'},
      {key:'keyToggleChat',label:'Toggle chat messages',type:'key'},
      {key:'keyToggleSectors',label:'Toggle background sectors',type:'key'},
      {key:'emoji1',label:'Emoji 1',type:'coming'},
      {key:'emoji2',label:'Emoji 2',type:'coming'},
      {key:'emoji3',label:'Emoji 3',type:'coming'},
    ],
    Mouse:[
      {key:'mouseSensitivity',label:'Mouse sensitivity',type:'range',min:.5,max:1.8,step:.1},
      {key:'rightClickMove',label:'Right-click movement',type:'toggle'},
      {key:'mouseWheelFeed',label:'Mouse wheel feed',type:'coming'},
      {key:'mouseInvert',label:'Invert wheel zoom',type:'coming'},
    ],
    Commands:[
      {key:'keyCommand1',label:'Command 1',type:'key'},
      {key:'keyCommand2',label:'Command 2',type:'key'},
      {key:'keyCommand3',label:'Command 3',type:'key'},
      {key:'keyCommand4',label:'Command 4',type:'key'},
      {key:'keyCommand5',label:'Command 5',type:'key'},
      {key:'keyCommand6',label:'Command 6',type:'key'},
      {key:'keyCommand7',label:'Command 7',type:'key'},
      {key:'keyCommand8',label:'Command 8',type:'key'},
      {key:'keyCommand9',label:'Command 9',type:'key'},
      {key:'keyCommand10',label:'Command 10',type:'key'},
      {key:'keyZoom1',label:'Zoom level 1',type:'key'},
      {key:'keyZoom2',label:'Zoom level 2',type:'key'},
      {key:'keyZoom3',label:'Zoom level 3',type:'key'},
      {key:'keyZoom4',label:'Zoom level 4',type:'key'},
      {key:'keyZoom5',label:'Zoom level 5',type:'key'},
      {key:'chatCommands',label:'Command messages',type:'commands'},
    ]
  },
  import:{'Import / Export':[]}
};

function showSettings(){ macroFeedHeld=false;isSettingsOpen=true; $('settings-overlay').classList.remove('hidden'); renderSettings(); }
function hideSettings(){ isSettingsOpen=false; $('settings-overlay').classList.add('hidden'); }

function renderSettings(){
  if(!(settingsPage in S[settingsTab])) settingsPage = Object.keys(S[settingsTab])[0];
  document.querySelectorAll('#settings-tabs button').forEach(b=>b.classList.toggle('active', b.dataset.tab===settingsTab));
  const nav = $('settings-nav'); nav.replaceChildren();
  for(const name of Object.keys(S[settingsTab])){
    const b=document.createElement('button'); b.textContent=name; b.className=name===settingsPage?'active':''; b.onclick=()=>{ settingsPage=name; renderSettings(); }; nav.appendChild(b);
  }
  const area = $('settings-content'); area.replaceChildren();
  if(settingsTab === 'import'){ renderImport(area); return; }
  const heading=document.createElement('h3');heading.className='settings-section-title';heading.textContent=settingsPage.toUpperCase();area.append(heading);
  if(settingsTab==='theme' && settingsPage==='Theme presets'){renderThemePresets(area);return;}
  if(settingsTab==='theme' && settingsPage==='PUT UR THEME'){renderCustomTheme(area);return;}
  for(const item of S[settingsTab][settingsPage]) renderSettingRow(area,item);
}

function renderThemePresets(area){
  const grid=document.createElement('div');grid.className='theme-grid';
  for(const [id,t] of Object.entries(THEMES)){
    const card=document.createElement('button');card.className='theme-card'+(settings.themePreset===id?' selected':'');
    card.style.setProperty('--swatch',t.accentColor);card.style.setProperty('--card-bg',t.panel);
    const title=document.createElement('strong');title.textContent=t.label;
    const desc=document.createElement('span');desc.textContent=t.description;
    const preview=document.createElement('div');preview.className='theme-preview';preview.innerHTML='<i></i><i></i><i></i>';
    card.append(preview,title,desc);card.onclick=()=>{
      for(const key of ['accentColor','bgColor','gridColor','ownColor','secondColor']) settings[key]=t[key];
      settings.themePreset=id;settings.panelColor=t.panel;settings.textColor='#f5f9ff';saveSettings();renderSettings();
    };grid.append(card);
  }
  const custom=document.createElement('button');custom.type='button';custom.className='theme-card custom-theme-card';
  const customTitle=document.createElement('strong');customTitle.textContent='PUT UR THEME';
  const customDesc=document.createElement('span');customDesc.textContent='Create your own theme • Choose all colors, a background and a center logo • Save locally';
  const customPreview=document.createElement('div');customPreview.className='theme-preview';customPreview.innerHTML='<i></i><i></i><i></i>';
  custom.append(customPreview,customTitle,customDesc);custom.onclick=()=>{settingsPage='PUT UR THEME';renderSettings();};grid.append(custom);
  area.append(grid);
}
function renderCustomTheme(area){
  const base=settings.customTheme||{};
  const defaults={name:'My Vintage Theme',accentColor:settings.accentColor,panelColor:settings.panelColor,textColor:settings.textColor,
    bgColor:settings.bgColor,gridColor:settings.gridColor,ownColor:settings.ownColor,secondColor:settings.secondColor,
    foodColor:settings.foodColor,virusColor:settings.virusColor,backgroundUrl:settings.backgroundUrl,worldLogoUrl:settings.worldLogoUrl};
  const draft={...defaults,...base};
  const intro=document.createElement('p');intro.className='theme-intro';intro.textContent='Customize your entire game. Your theme is saved on this browser only and can be exported from Import / Export.';
  area.append(intro);
  function makeInput(title,key,type){
    const wrap=document.createElement('label');wrap.className='theme-field';
    const text=document.createElement('span');text.textContent=title;
    const inp=document.createElement('input');inp.type=type;inp.value=draft[key]|| (type==='color'?'#ffffff':'');
    if(type==='text')inp.maxLength=32;
    if(type==='url'){inp.placeholder='https://example.com/image.png';inp.maxLength=1200;}
    inp.addEventListener('input',()=>{draft[key]=inp.value;});
    wrap.append(text,inp);return wrap;
  }
  const title=document.createElement('div');title.className='theme-name-field';title.append(makeInput('YOUR THEME NAME','name','text'));area.append(title);
  const controls=document.createElement('div');controls.className='custom-colors';
  const fields=[['Accent','accentColor'],['Panel / HUD','panelColor'],['Text','textColor'],['Field background','bgColor'],
    ['Grid','gridColor'],['Primary cell','ownColor'],['Secondary cell','secondColor'],['Food','foodColor'],['Virus','virusColor']];
  for(const [name,key] of fields)controls.append(makeInput(name,key,'color'));
  area.append(controls);
  const assets=document.createElement('div');assets.className='theme-assets';assets.append(makeInput('BACKGROUND URL (fixed inside server square)','backgroundUrl','url'),makeInput('CENTER LOGO URL','worldLogoUrl','url'));area.append(assets);
  const actions=document.createElement('div');actions.className='custom-theme-actions';
  const save=document.createElement('button');save.type='button';save.className='settings-action blue';save.textContent='SAVE & APPLY THEME';
  save.onclick=()=>{
    const preset={name:String(draft.name||'My Vintage Theme').trim().slice(0,32)||'My Vintage Theme',backgroundUrl:cleanAssetUrl(draft.backgroundUrl),worldLogoUrl:cleanAssetUrl(draft.worldLogoUrl)};
    for(const [,key] of fields)preset[key]=cleanHex(draft[key],defaults[key]);
    if(draft.backgroundUrl&&!preset.backgroundUrl||draft.worldLogoUrl&&!preset.worldLogoUrl){toast('Use a valid http(s) image URL');return;}
    settings.customTheme=preset;settings.themePreset='custom';
    for(const [,key] of fields)settings[key]=preset[key];
    settings.backgroundUrl=preset.backgroundUrl;settings.worldLogoUrl=preset.worldLogoUrl;
    settings.backgroundImage=true;saveSettings();toast('Theme saved: '+preset.name);renderSettings();
  };
  actions.append(save);
  const reset=document.createElement('button');reset.type='button';reset.className='settings-action';reset.textContent='BACK TO PRESETS';
  reset.onclick=()=>{settingsPage='Theme presets';renderSettings();};actions.append(reset);area.append(actions);
  if(settings.themePreset==='custom' && settings.customTheme){const current=document.createElement('p');current.className='hint';current.textContent='ACTIVE: '+settings.customTheme.name;area.append(current);}
}
function renderSettingRow(area,item){
  const row=document.createElement('div'); row.className='setting-row';
  const lab=document.createElement('div'); lab.className='setting-label'; lab.textContent=item.label;
  const box=document.createElement('div'); box.className='setting-control';
  if(item.type==='toggle'){
    row.classList.add('is-toggle');
    const labelWrap=document.createElement('label'); labelWrap.className='toggle-switch';
    const field=document.createElement('input'); field.type='checkbox'; field.checked=!!settings[item.key]; field.onchange=()=>{ settings[item.key]=field.checked; status.textContent=field.checked?'ON':'OFF'; saveSettings(); };
    const slider=document.createElement('span'); slider.className='toggle-slider';
    const status=document.createElement('span'); status.className='toggle-status'; status.textContent=field.checked?'ON':'OFF';
    labelWrap.append(field,slider,status); box.append(labelWrap);
  } else if(item.type==='range'){
    const field=document.createElement('input'); field.type='range'; field.min=item.min; field.max=item.max; field.step=item.step; field.value=settings[item.key];
    const v=document.createElement('span'); v.className='setting-value'; v.textContent=settings[item.key];
    field.oninput=()=>{ settings[item.key]=Number(field.value); v.textContent=field.value; saveSettings(); if(item.key==='zoom')setCameraControlsVisible(); };
    box.append(field,v);
  } else if(item.type==='color'){
    const field=document.createElement('input'); field.type='color'; field.value=settings[item.key]; field.oninput=()=>{ settings[item.key]=field.value; saveSettings(); }; box.append(field);
  } else if(item.type==='url'){
    const field=document.createElement('input'); field.type='url'; field.value=settings[item.key]; field.placeholder='https://...'; field.onchange=()=>{ const val=cleanAssetUrl(field.value);if(field.value.trim()&&!val){toast('Use an http(s) image link');field.value=settings[item.key];return;}settings[item.key]=val;saveSettings(); }; box.append(field);
  } else if(item.type==='key'){
    const field=document.createElement('input'); field.type='text'; field.className='keybind'; field.readOnly=true; field.value=settings[item.key]; field.title='Click, then press a key';
    field.onfocus=()=>{ field.value='PRESS KEY...'; };
    field.onkeydown=e=>{ e.preventDefault(); e.stopPropagation(); const k=normalizeKey(e); settings[item.key]=k; field.value=k; field.blur(); saveSettings(); };
    field.onblur=()=>{ field.value=settings[item.key]; };
    box.append(field);
  } else if(item.type==='coming'){
    const badge=document.createElement('span'); badge.className='coming-pill'; badge.textContent='COMING SOON'; box.append(badge);
  } else if(item.type==='commands'){
    const grid=document.createElement('div'); grid.className='command-list';
    settings.chatCommands.forEach((s,i)=>{
      const sub=document.createElement('div'); sub.className='setting-row';
      const lbl=document.createElement('label'); lbl.className='setting-label'; lbl.textContent='Message '+(i+1);
      const input=document.createElement('input'); input.type='text'; input.value=s; input.maxLength=80; input.onchange=()=>{ settings.chatCommands[i]=input.value; saveSettings(); };
      const wr=document.createElement('div'); wr.className='setting-control'; wr.append(input); sub.append(lbl,wr); grid.append(sub);
    });
    area.append(grid); return;
  }
  row.append(lab,box); area.appendChild(row);
}

function renderImport(area){
  const h=document.createElement('h3'); h.textContent='Save your setup';
  const p=document.createElement('p'); p.className='hint'; p.textContent='Export your saved theme, controls and gameplay settings as JSON. Importing applies the selected values immediately. No account required.';
  const text=document.createElement('textarea'); text.id='settings-json'; text.placeholder='Paste an exported JSON file here, or click Export to display the current configuration.';
  const actions=document.createElement('div'); actions.className='import-actions';
  const exp=document.createElement('button'); exp.className='settings-action pink'; exp.textContent='↓ EXPORT JSON'; exp.onclick=()=>{ const json=JSON.stringify(settings,null,2); text.value=json; const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url; a.download='vintage-settings.json'; a.click(); URL.revokeObjectURL(url); toast('Settings exported'); };
  const imp=document.createElement('button'); imp.className='settings-action blue'; imp.textContent='↑ IMPORT JSON'; imp.onclick=()=>{ try{ const data=JSON.parse(text.value); if(!data || typeof data!=='object' || Array.isArray(data)) throw Error('Invalid'); settings=valueSafe(data); saveSettings(); toast('Settings imported'); renderSettings(); }catch{ toast('Invalid settings JSON'); } };
  const reset=document.createElement('button'); reset.className='settings-action red'; reset.textContent='↺ RESET DEFAULTS'; reset.onclick=()=>{ if(confirm('Reset all Vintage settings to defaults?')){ settings=cloneDefaults(); saveSettings(); renderSettings(); toast('Defaults restored'); } };
  actions.append(exp,imp,reset);
  const fileWrap=document.createElement('label'); fileWrap.className='file-pick'; fileWrap.textContent='Choose JSON file';
  const file=document.createElement('input'); file.type='file'; file.accept='.json,application/json'; file.onchange=async()=>{ const chosen=file.files?.[0]; if(chosen){ text.value=(await chosen.text()).slice(0,100000); fileWrap.dataset.filename=chosen.name; } }; fileWrap.append(file);
  area.append(h,p,actions,fileWrap,text);
}

function normalizeKey(e){
  if(e.altKey && /^[0-9]$/.test(e.key)) return `ALT+${e.key}`;
  const map={ ' ':'SPACE', Escape:'ESCAPE', Enter:'ENTER', Tab:'TAB' };
  if(map[e.key]) return map[e.key];
  return String(e.key || '').toUpperCase();
}
function isEditing(){ return ['INPUT','TEXTAREA'].includes(document.activeElement?.tagName) || isSettingsOpen; }

window.addEventListener('keydown',e=>{
  if(isSettingsOpen){ if(e.key==='Escape'){ hideSettings(); e.preventDefault(); } return; }
  const k=normalizeKey(e);
  if(document.activeElement === $('chat-input')){ if(k==='ESCAPE'){ document.activeElement.blur(); e.preventDefault(); } return; }
  if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){ if(k==='ESCAPE') document.activeElement.blur(); return; }
  if(k===settings.keyMenu){ if(document.body.classList.contains('show-lobby') && playing) beginGame(); else enterLobby(); e.preventDefault(); return; }
  if(k===settings.keySettings){ showSettings(); e.preventDefault(); return; }
  if((!playing && !spectating) || isEditing() || document.body.classList.contains('show-lobby')) return;
  if(k===settings.keyChat){ $('chat-input').focus(); e.preventDefault(); return; }
  if(k===settings.keyChatToggle){ chatChannel = chatChannel==='all' ? 'tag' : 'all'; updateChatTabs(); e.preventDefault(); return; }
  if(k===settings.keyHUD){ hudVisible=!hudVisible; applySettings(); e.preventDefault(); return; }
  if(k===settings.keySpectateMode){ spectating ? enterLobby() : beginSpectate(); e.preventDefault(); return; }
  if(spectating){ return; }
  if(k===settings.keySwitch){ changeSlot(); e.preventDefault(); return; }
  if(k===settings.keySplit){ doAction('split'); e.preventDefault(); return; }
  if(k===settings.keyDoubleSplit){ repeatAction('split',2); e.preventDefault(); return; }
  if(k===settings.keyTripleSplit){ repeatAction('split',3); e.preventDefault(); return; }
  if(k===settings.keySplit16){ repeatAction('split',4); e.preventDefault(); return; }
  if(k===settings.keySplit32){ repeatAction('split',5); e.preventDefault(); return; }
  if(k===settings.keySplit64){ repeatAction('split',6); e.preventDefault(); return; }
  if(k===settings.keyFeed){ doAction('feed'); e.preventDefault(); return; }
  if(k===settings.keyMacroFeed){ if(!macroFeedHeld){macroFeedHeld=true;nextMacroFeedAt=0;}e.preventDefault();return; }
  if(k===settings.keyStopMove && settings.keyStopMove!=='NO KEY'){ stopMovement(); e.preventDefault(); return; }
  if(k===settings.keyToggleNames){ toggleSetting('showNames','Names'); e.preventDefault(); return; }
  if(k===settings.keyToggleMass){ toggleSetting('showMass','Mass labels'); e.preventDefault(); return; }
  if(k===settings.keyToggleChat && settings.keyToggleChat!=='NO KEY'){ toggleSetting('showChat','Chat'); e.preventDefault(); return; }
  if(k===settings.keyToggleSectors){ toggleSetting('showSectors','Sectors'); e.preventDefault(); return; }
  for(let i=1;i<=10;i++){ if(k===settings['keyCommand'+i]){ triggerCommand(i-1); e.preventDefault(); return; } }
  for(let i=1;i<=5;i++){ if(k===settings['keyZoom'+i]){ setZoomLevel(i); e.preventDefault(); return; } }
});

window.addEventListener('keyup',e=>{if(normalizeKey(e)===settings.keyMacroFeed)macroFeedHeld=false;});
function updateChatTabs(){ document.querySelectorAll('.chat-tab').forEach(b=>b.classList.toggle('active', b.dataset.channel===chatChannel)); renderChat(); }

const EMOJI_CATALOG=[
  ['😀','grin'],['😃','smile'],['😄','happy'],['😁','grin'],['😆','laugh'],['😂','laugh'],['🤣','rofl'],['😊','blush'],['🙂','smile'],['😉','wink'],
  ['😍','love'],['🥰','love'],['😘','kiss'],['😎','cool'],['🤩','star'],['🥳','party'],['😏','smirk'],['😋','yum'],['😝','tongue'],['🤔','thinking'],
  ['😐','neutral'],['🙄','eyes'],['😴','sleep'],['😭','cry'],['😢','sad'],['😡','angry'],['😱','shock'],['😨','fear'],['😤','angry'],['🤯','mind'],
  ['😇','angel'],['😈','devil'],['👻','ghost'],['💀','skull'],['👽','alien'],['🤖','robot'],['💩','poop'],['❤️','heart'],['🧡','heart'],['💛','heart'],
  ['💚','heart'],['💙','heart'],['💜','heart'],['🖤','heart'],['💔','broken'],['💯','100'],['🔥','fire'],['✨','sparkles'],['⭐','star'],['🌟','star'],
  ['🎉','party'],['🎮','game'],['🏆','trophy'],['👑','crown'],['⚔️','sword'],['🛡️','shield'],['🎯','target'],['💎','diamond'],['🚀','rocket'],['⚡','lightning'],
  ['👍','thumb'],['👎','thumb'],['👏','clap'],['🙌','hands'],['💪','strong'],['🙏','pray'],['🤝','handshake'],['👌','ok'],['✌️','peace'],['👀','eyes'],
  ['🐉','dragon'],['🐱','cat'],['🐶','dog'],['🐼','panda'],['🍕','pizza'],['🍔','burger'],['☕','coffee'],['🎵','music'],['🌈','rainbow'],['☀️','sun']
];
function renderEmojis(query=''){
  const list=$('emoji-grid');list.replaceChildren();
  const search=query.toLowerCase().trim();
  for(const [emoji,key] of EMOJI_CATALOG){if(search && !key.includes(search)&&!emoji.includes(search))continue;
    const b=document.createElement('button');b.type='button';b.className='emoji-option';b.textContent=emoji;b.title=key;
    b.addEventListener('pointerdown',e=>e.preventDefault());
    b.addEventListener('click',()=>{
      const input=$('chat-input'),start=input.selectionStart??input.value.length,end=input.selectionEnd??start;
      input.setRangeText(emoji,start,end,'end');input.focus();
    });list.append(b);
  }
  if(!list.children.length){const none=document.createElement('span');none.className='emoji-empty';none.textContent='No emojis found';list.append(none);}
}
function setEmojiPicker(open){
  $('emoji-picker').classList.toggle('hidden',!open);
  $('emoji-toggle').setAttribute('aria-expanded',String(open));
  $('chat').classList.toggle('chat-active',open||document.activeElement===$('chat-input'));
}
$('chat-input').addEventListener('focus',()=>{$('chat').classList.add('chat-active');});
$('chat-input').addEventListener('blur',()=>{setTimeout(()=>{if(!$('chat').contains(document.activeElement)){$('chat').classList.remove('chat-active');setEmojiPicker(false);}},120);});
const QUICK_EMOJIS=['😀','😂','😍','😎','😭','🔥','❤️','👍','👑','🎮'];
for(const emoji of QUICK_EMOJIS){
  const b=document.createElement('button');b.type='button';b.className='quick-emoji';b.textContent=emoji;
  b.title='Insert '+emoji;b.addEventListener('pointerdown',e=>e.preventDefault());
  b.onclick=()=>{const input=$('chat-input'),start=input.selectionStart??input.value.length;
    input.setRangeText(emoji,start,input.selectionEnd??start,'end');input.focus();};
  $('emoji-quick').append(b);
}
$('emoji-search').oninput=()=>renderEmojis($('emoji-search').value);
$('emoji-toggle').onclick=()=>{setEmojiPicker($('emoji-picker').classList.contains('hidden'));renderEmojis($('emoji-search').value);};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#chat'))setEmojiPicker(false);});
$('chat-form').onsubmit=e=>{ e.preventDefault(); sendMessage($('chat-input').value); $('chat-input').value='';setEmojiPicker(false); $('chat-input').blur(); };

$('play-btn').onclick=beginGame;
$('respawn-btn').onclick=beginGame;
$('back-to-lobby').onclick=enterLobby;
$('menu-btn').onclick=enterLobby;
$('settings-btn').onclick=showSettings;
$('lobby-settings-btn').onclick=showSettings;
$('lobby-settings-secondary').onclick=showSettings;
$('v-login-trigger').onclick=()=>{const menu=$('auth-menu');const open=menu.classList.toggle('hidden')===false;$('v-login-trigger').setAttribute('aria-expanded',String(open));};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.v-stage-account')){$('auth-menu')?.classList.add('hidden');$('v-login-trigger')?.setAttribute('aria-expanded','false');}});
$('spectate-btn').onclick=beginSpectate;
$('zoom-in').onclick=()=>adjustZoom(1.18);
$('zoom-out').onclick=()=>adjustZoom(1/1.18);
$('zoom-reset').onclick=()=>adjustZoom(1/Math.max(settings.zoom,.01));
$('close-settings').onclick=hideSettings;
$('settings-done').onclick=hideSettings;
$('settings-overlay').addEventListener('click',e=>{ if(e.target===$('settings-overlay')) hideSettings(); });
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=(e)=>{ const btn=e.target.closest('[data-mode]'); if(!btn)return; if(playing) enterLobby(); if(btn.dataset.mode) updateMode(btn.dataset.mode); });
document.querySelectorAll('.chat-tab').forEach(b=>b.onclick=()=>{ chatChannel=b.dataset.channel; updateChatTabs(); });
document.querySelectorAll('#settings-tabs button').forEach(b=>b.onclick=()=>{ settingsTab=b.dataset.tab; settingsPage=Object.keys(S[settingsTab])[0]; renderSettings(); });
document.querySelectorAll('.soon-btn').forEach(btn=>btn.addEventListener('click',e=>{ const msg=btn.dataset.soon; if(msg){ e.preventDefault(); toast(msg); } }));
document.querySelectorAll('.region-tab').forEach(btn=>btn.addEventListener('click',()=>{ if(btn.classList.contains('soon-btn')) return; document.querySelectorAll('.region-tab').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); }));
$('nickname').addEventListener('input', updateProfileName);
window.addEventListener('pointermove',e=>{
  pointer={x:e.clientX,y:e.clientY}; pointerOverField=e.target===$('arena');
  if(draggingCamera && spectating && dragPointer){
    renderer.cam.x=clampClient(renderer.cam.x+(dragPointer.x-e.clientX)/Math.max(renderer.zoom,.07),0,WORLD_SIZE);
    renderer.cam.y=clampClient(renderer.cam.y+(dragPointer.y-e.clientY)/Math.max(renderer.zoom,.07),0,WORLD_SIZE);
    dragPointer={x:e.clientX,y:e.clientY};
  }
});
window.addEventListener('wheel',e=>{
  if(!settings.wheelZoom || !(playing||spectating) || isSettingsOpen) return;
  e.preventDefault();
  const delta=(e.deltaMode===1?e.deltaY*16:e.deltaMode===2?e.deltaY*innerHeight:e.deltaY);
  adjustZoom(Math.exp(-Math.max(-320,Math.min(320,delta))*.0023*(settings.wheelZoomSensitivity||1)),e.clientX,e.clientY);
},{passive:false});
$('arena').addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('contextmenu',e=>{ if(spectating || (playing && settings.rightClickMove)) e.preventDefault(); });
window.addEventListener('pointerdown',e=>{
  if(e.target!==$('arena'))return;
  if(spectating && e.button===2){ enterLobby(); e.preventDefault(); return; }
  if(spectating && e.button===0){draggingCamera=true;dragPointer={x:e.clientX,y:e.clientY};document.body.classList.add('dragging-camera');e.preventDefault();return;}
  if(playing && e.button===2 && settings.rightClickMove){rightDown=true;e.preventDefault();}
});
window.addEventListener('pointerup',e=>{
  if(e.button===2)rightDown=false;
  if(e.button===0){draggingCamera=false;dragPointer=null;document.body.classList.remove('dragging-camera');}
});
window.addEventListener('blur',()=>{macroFeedHeld=false;rightDown=false;draggingCamera=false;dragPointer=null;document.body.classList.remove('dragging-camera');});
window.addEventListener('resize',()=>renderer.resize());

applySettings();
setLobbyState(true);
updateProfileName();
selectedServer=window.VINTAGE_CONFIG?.regions?.EU?.[0]||null;
updateMode('ffa');
updateServerLabel();
setCameraControlsVisible();
requestAnimationFrame(gameLoop);

function updateServerLabel(){
  $('server-picker-btn').querySelector('span').textContent=region+' · '+mode.toUpperCase()+' ▾';
  $('world-status').textContent='CURRENT WORLD · '+(serverUrl()?region+' ONLINE':'LOCAL DEMO');
}
function renderServers(){
  document.querySelectorAll('[data-region]').forEach(b=>b.classList.toggle('active',b.dataset.region===browseRegion));
  const list=$('server-list');list.replaceChildren();
  const entries=browseRegion==='ASIA'?[]:(window.VINTAGE_CONFIG?.regions?.[browseRegion]||[]);
  if(!entries.length){const empty=document.createElement('p');empty.className='server-empty';empty.textContent='No servers available in '+browseRegion+'.';list.append(empty);return;}
  for(const entry of entries){
    if(!MODES[entry.mode])continue;
    const b=document.createElement('button');b.className='server-entry'+(entry.id===serverId?' selected':'');
    const name=document.createElement('strong');name.textContent=entry.name;
    const detail=document.createElement('span');detail.textContent=MODES[entry.mode].start.toLocaleString()+' MASS · '+((entry.wsUrl||window.VINTAGE_CONFIG?.wsUrl)?'ONLINE ENDPOINT':'LOCAL DEMO');
    b.append(name,detail);b.onclick=()=>{
      if(serverId!==entry.id){if(playing&&!confirm('Switch server and leave your current match?'))return;leaveSession();}
      region=browseRegion;selectedServer=entry;serverId=entry.id;updateMode(entry.mode);updateServerLabel();enterLobby();$('servers-overlay').classList.add('hidden');
    };list.append(b);
  }
}
$('server-picker-btn').onclick=()=>{renderServers();$('servers-overlay').classList.remove('hidden');};
$('close-servers').onclick=()=>$('servers-overlay').classList.add('hidden');
$('servers-overlay').onclick=e=>{if(e.target===$('servers-overlay'))$('servers-overlay').classList.add('hidden');};
document.querySelectorAll('[data-region]').forEach(b=>b.onclick=()=>{browseRegion=b.dataset.region;renderServers();});
const authBase=String(window.VINTAGE_CONFIG?.authBaseUrl||'').replace(/\/$/,'');
async function refreshAccount(){
  try{const r=await fetch(authBase+'/auth/me',{credentials:'include'});if(!r.ok)return;const data=await r.json();
    $('account-name').textContent=data.user?.name||'GUEST ACCESS';$('logout-btn').classList.toggle('hidden',!data.user);
    if(data.user){$('nickname').value=toName(data.user.name);updateProfileName();}
  }catch{}
}
let authPopup=null;
document.querySelectorAll('[data-provider]').forEach(b=>b.onclick=async()=>{
  const provider=b.dataset.provider;
  authPopup=window.open('about:blank','vintage-login','width=520,height=720');
  try{const r=await fetch(authBase+'/auth/providers',{credentials:'include'});if(!r.ok)throw Error('Account server is not configured.');
    const providers=await r.json();if(!providers[provider])throw Error(provider+' login needs application credentials on the server.');
    if(!authPopup)throw Error('Allow popups to sign in.');authPopup.location=authBase+'/auth/'+provider;
  }catch(e){authPopup?.close();$('auth-status').textContent=e.message;}
});
window.addEventListener('message',e=>{if(e.origin!==new URL(authBase||location.origin).origin || e.source!==authPopup || e.data?.type!=='vintage-auth')return;refreshAccount();authPopup?.close();});
$('logout-btn').onclick=async()=>{await fetch(authBase+'/auth/logout',{method:'POST',credentials:'include'});refreshAccount();};
refreshAccount();
