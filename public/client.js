import {THEMES} from './themes.js';
import {mountBackgroundStudio} from './background-studio.js?v=2-shapes';
import {mountThemeScene} from './theme-scene.js?v=1-live-theme';
import {TagVoice} from './tag-voice.js?v=2-audio';
import {SETTING_HELP,SETTINGS_CATEGORIES} from './settings-help.js?v=4-live-scene';
import {MODES, DEFAULT_SETTINGS, LocalArena, ArenaRenderer, drawArenaGuides, drawBackgroundDesign, normalizeBackgroundDesign, BACKGROUND_MAX_ELEMENTS, BACKGROUND_MAX_POINTS, autoSplitMassFor, WORLD_SIZE, radius, respawnPosition, sectorAt, totalMass, getVisibleAllies, normalizeAnimation, normalizeVisualSettings, supportsMultibox, INPUT_ACTIONS, CONTROL_KEYS, physicalKey, normalizeControlSettings, tagColor, feedIntervalFor, worldSizeFor, ZOOM_MIN, ZOOM_MAX} from './game.js?v=25-multi-virus';

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
const valueSafe = (saved={},migrate=false) => {
  const next = cloneDefaults();
  for (const [key, val] of Object.entries(saved || {})) {
    if (!(key in next)) continue;
    if (Array.isArray(next[key]) && Array.isArray(val)) next[key] = [...val].slice(0, 10);
    else if(key==='customTheme' && val && typeof val==='object' && !Array.isArray(val)){
      const colors={};
      for(const prop of ['accentColor','panelColor','textColor','bgColor','gridColor','foodColor','virusColor','borderColor','sectorGridColor','sectorColor'])
        colors[prop]=cleanHex(val[prop],next[prop]);
      next.customTheme={name:String(val.name||'My theme').slice(0,32),...colors,backgroundUrl:cleanAssetUrl(val.backgroundUrl),worldLogoUrl:cleanAssetUrl(val.worldLogoUrl),artwork:normalizeBackgroundDesign(val.artwork)};
    }
    else if (typeof val === typeof next[key]) next[key] = val;
  }
  next.animation=normalizeAnimation(next.animation);
  return normalizeControlSettings({...normalizeVisualSettings({...next,visualStyleVersion:saved?.visualStyleVersion},migrate),controlsVersion:saved?.controlsVersion},migrate);
};

let settings = (()=>{try{
  const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null'),next=valueSafe(saved,true);
  if(saved&&(saved.visualStyleVersion!==next.visualStyleVersion||saved.controlsVersion!==next.controlsVersion)){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(next));}catch{}}
  return next;
}catch{return cloneDefaults();}})();
let mode='ffa', playing=false, spectating=false, spectateTargetId='', activeSlot=0, remote=null, hudVisible=true, chatChannel='all', isSettingsOpen=false, frameTime=performance.now();
let nickname='Vintage Player', tag='',peakScore=0;
let region='EU', browseRegion='EU', serverId='eu-ffa', selectedServer=null, sessionServerId=null, sessionMode=null, sessionMulti=false;
const serverUrl=()=>String(selectedServer?.wsUrl || window.VINTAGE_CONFIG?.wsUrl || '').trim();
const currentMulti=()=>supportsMultibox(mode,selectedServer);
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
      arena.reset(mode,nickname,tag,sessionMulti,settings,spectating);
      renderer.resetAnimations();
      setRestartClock(now+RESTART_INTERVAL);
      displayServerNotice('Local demo world reset • New 3-hour round started');
    }
  }
  if(restartNoticeUntil && now>restartNoticeUntil){
    restartNoticeUntil=0;$('server-announcement').classList.add('hidden');
  }
}
let pointer={x:innerWidth/2+100,y:innerHeight/2}, rightDown=false, feedHeld=false, macroFeedHeld=false,nextMacroFeedAt=0;
const stoppedConnections=new Set();
let pointerOverField=false, draggingCamera=false, dragPointer=null;
const mouseFeedButtons=new Set(),mouseMacroButtons=new Set();
function releaseInputs(){feedHeld=false;macroFeedHeld=false;rightDown=false;mouseFeedButtons.clear();mouseMacroButtons.clear();}
let settingsTab='game',settingsPage='Camera',settingsOpeningCopy=null,selectedSetting=null,settingsTrigger=null;
let backgroundStudio=null,settingsPreviewAt=0;
let themeDraft=null,scenePreview=null,lobbyArtwork=null,lobbyArtworkSource=null,lobbyArtworkSize='';
function isCustomThemeOpen(){return isSettingsOpen&&settingsTab==='theme'&&settingsPage==='PUT UR THEME'&&!$('settings-search').value.trim();}
function currentVisualSettings(){return isCustomThemeOpen()&&themeDraft?themeDraft:settings;}

const arena = new LocalArena();
arena.reset('ffa', nickname, tag, currentMulti(), settings);
const renderer = new ArenaRenderer($('arena'), $('minimap-canvas'));
renderer.resize();
const voice=new TagVoice($('tag-voice'),{iceServers:()=>window.VINTAGE_CONFIG?.voiceIceServers});

const toName = (s,max=18)=>String(s||'').trim().slice(0,max).replace(/[<>\u0000-\u001f]/g,'')||'Vintage Player';
const toTag = s => String(s||'').normalize('NFKC').trim().slice(0,8).replace(/[<>\u0000-\u001f]/g,'').toUpperCase();

function saveSettings(){let saved=true;try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{saved=false;toast('Browser storage is full. Export your settings to keep your work.');}applySettings();if(isSettingsOpen)refreshSettingsDetail();return saved;}
function updateProfileName(){ const name = toName($('nickname')?.value || nickname); const node = $('profile-name'); if(node) node.textContent = name; }
function applySettings(){
  const visual=currentVisualSettings();
  document.documentElement.style.setProperty('--accent', cleanHex(visual.accentColor,'#a9dcff'));
  const theme=THEMES[visual.themePreset] || THEMES.vintage;
  const custom=visual.themePreset==='custom';
  document.body.dataset.theme=custom?'custom':(THEMES[visual.themePreset]?visual.themePreset:'vintage');
  document.documentElement.style.setProperty('--theme-panel',cleanHex(visual.panelColor||theme.panel,theme.panel));
  document.documentElement.style.setProperty('--text',cleanHex(visual.textColor,'#f5f9ff'));
  document.documentElement.style.setProperty('--hud-border',cleanHex(visual.gridColor,'#27323e'));
  document.documentElement.style.setProperty('--pink','#f065b5');
  document.documentElement.style.setProperty('--accent2','#bd93ff');
  document.documentElement.style.setProperty('--theme-radius',theme.radius);
  document.body.classList.toggle('vintage-background-enabled',settings.backgroundImage);
  $('leaderboard').classList.toggle('hidden', !settings.showLeaderboard || !hudVisible);
  $('minimap').classList.toggle('hidden', !settings.showMinimap || !hudVisible);
  $('chat').classList.toggle('hidden', !settings.showChat || !hudVisible);
  $('help-panel')?.classList.toggle('hidden', !settings.showHelp || !hudVisible);
  document.body.classList.toggle('hud-hidden',!hudVisible);
  if(!hudVisible)closeChat();
  updateLobbyArtwork(visual);
}
function updateLobbyArtwork(visual=currentVisualSettings()){
  const design=visual.showThemeArtwork&&visual.themeArtwork;
  if(!design){if(lobbyArtwork)lobbyArtwork.hidden=true;return;}
  if(!lobbyArtwork){lobbyArtwork=document.createElement('canvas');lobbyArtwork.id='theme-artwork-overlay';lobbyArtwork.setAttribute('aria-hidden','true');$('lobby').prepend(lobbyArtwork);}
  lobbyArtwork.hidden=false;
  const w=innerWidth,h=innerHeight,ratio=Math.min(devicePixelRatio||1,2),key=w+'x'+h+'@'+ratio;
  if(lobbyArtworkSource===design&&lobbyArtworkSize===key)return;
  lobbyArtwork.width=w*ratio;lobbyArtwork.height=h*ratio;
  const g=lobbyArtwork.getContext('2d'),span=Math.min(w,h)*.92;
  g.setTransform(ratio,0,0,ratio,0,0);g.translate((w-span)/2,(h-span)/2);drawBackgroundDesign(g,design,span);
  lobbyArtworkSource=design;lobbyArtworkSize=key;
}
function setLobbyState(isLobby){ document.body.classList.toggle('show-lobby', !!isLobby); document.body.classList.toggle('is-spectating', !isLobby&&spectating); }
function setCameraControlsVisible(){
  document.body.classList.toggle('is-spectating',spectating);
}
function adjustZoom(factor,x=innerWidth/2,y=innerHeight/2){
  if(!playing&&!spectating)return;
  const before=spectating?renderer.toWorld(x,y):null;
  const next=clampClient(settings.zoom*factor, ZOOM_MIN,ZOOM_MAX);
  settings.zoom=next;
  if(spectating){
    renderer.zoom=next;
    renderer.cam.x=clampClient(before.x-(x-renderer.screenW/2)/next,0,(remoteSnapshot?.worldSize||worldSizeFor(mode)));
    renderer.cam.y=clampClient(before.y-(y-renderer.screenH/2)/next,0,(remoteSnapshot?.worldSize||worldSizeFor(mode)));
  }
  saveSettings();
}
const clampClient=(v,min,max)=>Math.max(min,Math.min(max,v));
function toast(msg){ const d=document.createElement('div'); d.className='toast'; d.textContent=msg; $('toast-area').appendChild(d); setTimeout(()=>d.remove(),3200); }

function updateMode(next){
  if(!MODES[next]) return;
  mode = next;
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected', b.dataset.mode===mode));
  $('top-mode').textContent = mode.toUpperCase() + ' · '+region;
  const label=$('lobby-mode-name'),mass=$('lobby-mode-mass');
  if(label)label.textContent=MODES[mode].title;
  if(mass)mass.textContent='STARTS AT '+MODES[mode].start.toLocaleString('en-US')+' MASS';
  if(!playing && !spectating){arena.reset(mode, nickname, tag, currentMulti(), settings);renderer.resetAnimations();}
  const multiLabel=$('multibox-status');if(multiLabel)multiLabel.textContent=currentMulti()?'MULTI ENABLED':'SINGLE CONNECTION';
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
}

function enterLobby(){
  releaseInputs();pointerOverField=false;
  setLobbyState(true);$('lobby').classList.remove('hidden');$('gameover').classList.add('hidden');
  $('play-btn').innerHTML=playing ? '<span>▶</span> RESUME MATCH <span>↗</span>' : '<span>▶</span> PLAY NOW <span>↗</span>';
  setCameraControlsVisible();
}
function leaveSession(){
  voice.detach();voice.setContext({tagged:false});
  stoppedConnections.clear();
  releaseInputs();peakScore=0;
  playing=false;spectating=false;showDeaths=false;
  const old=remote;remote=null;old?.disconnect();remoteSnapshot=null;
  sessionServerId=null;sessionMode=null;sessionMulti=false;setRestartClock(0);
}

function beginGame(){
  if(playing && sessionMode===mode && sessionServerId===serverId && sessionMulti===currentMulti() &&
     toName($('nickname').value)===nickname && toTag($('team-tag').value)===tag){
    setLobbyState(false);$('lobby').classList.add('hidden');$('gameover').classList.add('hidden');
    setCameraControlsVisible();return;
  }
  leaveSession();sessionMode=mode;sessionServerId=serverId;sessionMulti=currentMulti();

  nickname = toName($('nickname').value); tag = toTag($('team-tag').value);
  voice.setContext({tagged:!!tag});
  $('nickname').value = nickname; $('team-tag').value = tag;
  if(!tag){chatChannel='all';updateChatTabs();}
  updateProfileName();
  feedHeld=false;macroFeedHeld=false;activeSlot=0; remoteSnapshot=null; showDeaths=false; spectating=false; spectateTargetId=''; playing=true;
  setLobbyState(false);
  setCameraControlsVisible();
  $('lobby').classList.add('hidden'); $('gameover').classList.add('hidden'); clearChat();
  $('toast-area').replaceChildren();
  const multi = sessionMulti;
  arena.reset(mode, nickname, tag, multi, settings);
  renderer.resetAnimations();
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
  }
}

class RemoteArena{
  constructor(url,opts){ this.url=url; this.opts=opts; this.sockets=[];this.multiKey=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''); this.myIds=[]; this.latest=null; this.connected=false;
    this.latencyMs=null;this.lastPingAt=0;this.pingStarted=0;this.pingId=0;this.pingTimer=null; }
  connect(){ const total=this.opts.spectator?1:(this.opts.multi?2:1); for(let n=0;n<total;n++) this.open(n);
    this.pingTimer=setInterval(()=>this.probe(),2500); }
  probe(){const ws=this.sockets[0];if(ws?.readyState!==WebSocket.OPEN)return;
    const nonce=++this.pingId;this.pingStarted=performance.now();this.lastPingAt=Date.now();
    this.send(0,{type:'ping',nonce});}
  open(slot){
    let ws; try{ ws=new WebSocket(this.url); }catch{ toast('Invalid WebSocket server URL'); return; }
    this.sockets[slot]=ws;
    ws.addEventListener('open',()=>{ const packet=this.opts.spectator?{type:'spectate',mode:this.opts.mode}:{type:'join',mode:this.opts.mode,name:this.opts.nickname,tag:this.opts.tag,multiKey:this.multiKey};ws.send(JSON.stringify(packet)); });
    ws.addEventListener('message',e=>{
      let payload; try{ payload=JSON.parse(e.data); }catch{ return; }
      if(payload.type==='spectator_welcome'){
        this.connected=true; $('connection-status').innerHTML='<i></i> LIVE SPECTATE'; $('connection-status').classList.add('online'); $('chat-online').textContent='LIVE';
      }
      if(payload.type==='welcome'){
        this.myIds[slot]=payload.playerId; this.connected=true;
        $('connection-status').innerHTML='<i></i> ONLINE'; $('connection-status').classList.add('online'); $('chat-online').textContent='LIVE';
        if(slot===0){this.probe();if(remote===this)voice.bind(this);}
      }
      if(payload.type==='state' && slot===0){ this.latest=payload; remoteSnapshot=payload; }
      if(payload.type==='server_schedule' && slot===0) setRestartClock(payload.nextRestartAt);
      if(payload.type==='server_notice' && slot===0) displayServerNotice(payload.message);
      if(payload.type==='server_restarted' && slot===0){
        this.restarting=true;
        displayServerNotice('Server restarted • Reconnecting all players...');
      }
      if(payload.type==='pong' && slot===0 && payload.nonce===this.pingId){this.latencyMs=Math.round(performance.now()-this.pingStarted);}
      if(slot===0&&remote===this&&String(payload.type||'').startsWith('voice_')){voice.handle(payload);return;}

      if(payload.type==='chat' && slot===0) addChat(payload.name,payload.text,payload.channel,payload.teamId);
      if(payload.type==='error' && slot===0) toast(payload.message || 'Server error');
    });
    ws.addEventListener('close',event=>{
      if(slot===0)voice.detach(this);
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
  setMovementStopped(slot,stopped){this.send(slot,{type:'stopMove',stopped});}
  sendAction(slot,action,count=1){ this.send(slot,{type:action,...(action==='split'?{count}:{} )}); }
  respawn(slot,position){this.send(slot,{type:'respawn',x:position.x,y:position.y});}
  disconnect(){voice.detach(this); clearInterval(this.pingTimer);this.pingTimer=null; for(const s of this.sockets){ if(s && [0,1].includes(s.readyState)){ try{s.close(1000,'Switch game');}catch{} } } this.connected=false; this.sockets=[];this.multiKey=Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''); }
}

function clearChat(){ chatHistory.length=0;$('chat-messages').replaceChildren(); }
const chatHistory=[];
function addChat(name,message,channel='all',messageTag=''){
  const row={name:String(name).slice(0,25), text:String(message).slice(0,180), channel, tag:messageTag||'',time:Date.now()};
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
      const time=document.createElement('time');time.dateTime=new Date(line.time).toISOString();time.textContent=new Date(line.time).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
      const n=document.createElement('span'); n.className='who'; n.textContent=line.name+': ';n.style.color=tagColor(line.tag);
      p.append(time,n,document.createTextNode(line.text));
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
function closeChat(){
  $('chat-input').blur();$('emoji-search').blur();setEmojiPicker(false);$('chat').classList.remove('chat-active');
}
function openChat(){
  releaseInputs();if(!hudVisible){hudVisible=true;applySettings();}
  if(!settings.showChat){settings.showChat=true;saveSettings();}
  $('chat').classList.add('chat-active');$('chat-input').focus();
}
function submitChat(){sendMessage($('chat-input').value);$('chat-input').value='';closeChat();}

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
  renderer.resetAnimations();
  renderer.cam={x:worldSizeFor(mode)/2,y:worldSizeFor(mode)/2};
  renderer.zoom=clampClient(settings.zoom,ZOOM_MIN,ZOOM_MAX);
  if(wsUrl && /^wss?:\/\//i.test(wsUrl)){
    remote=new RemoteArena(wsUrl,{mode,nickname:'Spectator',tag:'',multi:false,spectator:true});
    remote.connect(); $('connection-status').innerHTML='<i></i> CONNECTING'; $('chat-online').textContent='CONNECTING';
  }else{
    $('connection-status').innerHTML='<i></i> DEMO MODE'; $('chat-online').textContent='LOCAL';
  }
  setCameraControlsVisible();
}
function changeSlot(){
  if(!sessionMulti)return;
  const ids=remote?.connected?remote.myIds:arena.myIds;
  if(ids.length<2)return;
  const next=(activeSlot+1)%ids.length;
  const id=ids[next];
  if(!id)return;
  const snap=remote?.connected?remoteSnapshot:arena.snapshot;
  const target=snap?.players?.find(p=>p.id===id);
  activeSlot=next;
  if(!target?.cells?.length){
    const world=renderer.toWorld(pointer.x,pointer.y);
    const anchor=ids.filter(playerId=>playerId!==id)
      .flatMap(playerId=>snap?.players?.find(p=>p.id===playerId)?.cells||[])
      .sort((a,b)=>(Math.hypot(a.x-world.x,a.y-world.y)-radius(a.mass))-(Math.hypot(b.x-world.x,b.y-world.y)-radius(b.mass)))[0];
    const position=respawnPosition(anchor,world,MODES[mode].start,snap?.worldSize||worldSizeFor(mode));
    if(remote?.connected)remote.respawn(next,position);
    else arena.respawn(id,position.x,position.y);
  }
}

function doAction(action,count=1){
  if(!playing||spectating||isSettingsOpen||document.body.classList.contains('show-lobby'))return;
  const id=activeId(),world=renderer.toWorld(pointer.x,pointer.y);
  if(remote?.connected){remote.sendControl(activeSlot,world);remote.sendAction(activeSlot,action,count);}
  else{arena.setTarget(id,world.x,world.y);if(action==='split')arena.split(id,count);if(action==='feed')arena.feed(id);}
}
function repeatAction(action,count){doAction(action,count);}
function inputAction(action){
  const splits={split:1,doubleSplit:2,tripleSplit:3,split16:4,split32:5,split64:6};
  if(splits[action])repeatAction('split',splits[action]);
  else if(action==='feed'||action==='macroFeed')doAction('feed');
  else if(action==='switch')changeSlot();
}
function stopMovement(){
  const id=activeId();if(!id)return;
  const stopped=!stoppedConnections.has(id);
  if(stopped)stoppedConnections.add(id);else stoppedConnections.delete(id);
  if(remote?.connected)remote.setMovementStopped(activeSlot,stopped);
  else arena.setMovementStopped(id,stopped);
}
function setZoomLevel(level){ const values=[0.55,0.75,0.95,1.15,1.35]; settings.zoom = values[level-1] || 1; saveSettings(); setCameraControlsVisible(); }
function toggleSetting(key){ settings[key]=!settings[key]; saveSettings(); }
function triggerCommand(index){ const msg=settings.chatCommands[index]; if(msg) sendMessage(msg); }
function gameover(){ releaseInputs();showDeaths=true; playing=false; spectating=false; $('gameover').classList.remove('hidden'); $('death-score').textContent='Peak score: '+Math.floor(peakScore).toLocaleString('en-US'); if(settings.autoRespawn) setTimeout(()=>{ if(showDeaths && !$('gameover').classList.contains('hidden')) beginGame(); },1800); }
function updateHUD(snapshot){
  const focusId=selectedId(snapshot),me=snapshot?.players?.find(p=>p.id===focusId);
  $('top-mode').textContent=mode.toUpperCase()+' \u00b7 '+region+(me?.movementStopped?' \u00b7 STOP MOVE':'');
  const ownIds=remote?.connected?remote.myIds:arena.myIds;
  const ownPlayers=(snapshot?.players||[]).filter(p=>ownIds.includes(p.id));
  const ownMass=ownPlayers.reduce((sum,p)=>sum+totalMass(p),0);
  if(playing)peakScore=Math.max(peakScore,ownMass);
  const connections=$('own-connections');connections.replaceChildren();
  for(const id of ownIds){
    const p=ownPlayers.find(p=>p.id===id);if(!p?.cells?.length)continue;
    const row=document.createElement('div');row.className='connection-row';
    const mass=document.createElement('span'),name=document.createElement('span');
    mass.textContent=String(Math.floor(totalMass(p)));name.textContent=p.name||'Player';
    row.append(mass,name);connections.appendChild(row);
  }
  $('tag-voice').style.top=(document.body.classList.contains('show-lobby')?125:Math.max(100,connections.getBoundingClientRect().bottom+10))+'px';
  $('stat-fps').textContent=String(renderer.fps);
  $('stat-ping').textContent=remote?.connected ? (remote.latencyMs!==null && Date.now()-remote.lastPingAt<10000 ? remote.latencyMs+'ms':'\u2014') : (remote?'OFFLINE':'LOCAL');
  const rows=getVisibleAllies(snapshot,focusId).map(p=>({...p,total:totalMass(p)})).sort((a,b)=>b.total-a.total).slice(0,10);
  const container=$('board-entries');container.replaceChildren();
  for(const p of rows){
    const line=document.createElement('div');line.className='leader-entry';
    const name=document.createElement('span'),mass=document.createElement('span');
    name.className='leader-name';mass.className='leader-mass';name.textContent=p.name||'Player';
    mass.textContent=p.total>=1000?(p.total/1000).toFixed(1)+'k':String(Math.floor(p.total));
    line.append(name,mass);container.appendChild(line);
  }
}

let controlAt=0, hudAt=0;
function gameLoop(now){
  const dt=Math.min(.05,(now-frameTime)/1000||.016); frameTime=now;
  if(playing && (feedHeld||macroFeedHeld||mouseFeedButtons.size||mouseMacroButtons.size) && !isSettingsOpen && !document.body.classList.contains('show-lobby') && now>=nextMacroFeedAt){
    doAction('feed');nextMacroFeedAt=now+feedIntervalFor(mode,!!(macroFeedHeld||mouseMacroButtons.size))*1000;
  }
  if((playing || spectating) && !isSettingsOpen && !document.body.classList.contains('show-lobby')){
    if(spectating && !draggingCamera && pointerOverField){
      const edge=(pos,size)=>{const n=(pos/size-.5)*2,dead=.23;return Math.sign(n)*Math.pow(Math.max(0,Math.abs(n)-dead)/(1-dead),1.55)};
      const speed=780*dt/Math.max(renderer.zoom,.09);
      renderer.cam.x=clampClient(renderer.cam.x+edge(pointer.x,innerWidth)*speed,0,(remoteSnapshot?.worldSize||worldSizeFor(mode)));
      renderer.cam.y=clampClient(renderer.cam.y+edge(pointer.y,innerHeight)*speed,0,(remoteSnapshot?.worldSize||worldSizeFor(mode)));
    }
    const world=renderer.toWorld(renderer.screenW/2+(pointer.x-renderer.screenW/2)*settings.mouseSensitivity,renderer.screenH/2+(pointer.y-renderer.screenH/2)*settings.mouseSensitivity);
    const slot=(rightDown && settings.rightClickMove && (remote?.myIds.length || arena.myIds.length)>1)?1:activeSlot;
    if(playing){
      if(remote?.connected){ if(now-controlAt>60){ remote.sendControl(slot,world); controlAt=now; } }
      else { const id=arena.myIds[slot] || activeId(); arena.setTarget(id,world.x,world.y); }
    }
    }
  if(!remote && !showDeaths) arena.tick((playing||spectating)?dt:dt*.45,settings);
  const snap = remote ? (remoteSnapshot || {players:[],food:[],viruses:[],worldSize:worldSizeFor(mode)}) : arena.snapshot;
  const focusId=selectedId(snap);
  const visual=currentVisualSettings();
  const renderSettings=hudVisible?{...visual,showThemeArtwork:visual.showThemeArtwork&&!document.body.classList.contains('show-lobby')}:{...visual,showGrid:false,showSectors:false,showBorders:false,showMinimap:false};
  renderer.draw(snap, focusId, renderSettings, playing, dt, spectating, spectating?[]:(remote?remote.myIds:arena.myIds));
  if(isSettingsOpen&&!backgroundStudio&&now-settingsPreviewAt>32){settingsPreviewAt=now;drawSettingsArtwork(now);}
  if(document.body.classList.contains('show-lobby'))updateLobbyArtwork(visual);
  if(now-hudAt>280){ hudAt=now; updateHUD(snap); if(playing && (!remote || remote.connected) && snap.players?.length){const ids=remote?.connected?remote.myIds:arena.myIds;if(ids.length && ids.every(id=>id && !snap.players.find(p=>p.id===id)?.cells?.length)){gameover();}} }
  if(now-hudAt<20) updateRestartClock(Date.now());
  requestAnimationFrame(gameLoop);
}

const S = {
  game:{
    Render:[
      {key:'showGrid',label:'Background grid',type:'toggle'},
      {key:'showSectors',label:'Atlas sectors',type:'toggle'},
      {key:'showBorders',label:'World border',type:'toggle'},
    ],
    Cells:[
      {key:'showSkins',label:'Player skins',type:'toggle'},
      {key:'showNames',label:'Player names',type:'toggle'},
      {key:'showMass',label:'Cell mass values',type:'toggle'},

      {key:'cellOpacity',label:'Cell opacity',type:'range',min:0,max:100,step:1},
      {key:'animation',label:'Animation',type:'range',min:0,max:500,step:10},
    ],
    Elements:[
      {key:'showFood',label:'Show food',type:'toggle'},
      {key:'showViruses',label:'Show viruses',type:'toggle'},
      {key:'foodSize',label:'Food size',type:'range',min:.5,max:2,step:.1},
    ],
    Camera:[
      {key:'zoom',label:'Camera zoom',type:'range',min:ZOOM_MIN,max:ZOOM_MAX,step:.02},
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
    HUD:[
      {key:'accentColor',label:'Accent color',type:'color'},
      {key:'panelColor',label:'HUD / panel color',type:'color'},
      {key:'textColor',label:'Interface text color',type:'color'},
    ],
    Cells:[
      {key:'cellOpacity',label:'Cell opacity',type:'range',min:0,max:100,step:1,wide:true},
      {key:'nickSize',label:'Nick size',type:'range',min:.1,max:3,step:.1,wide:true},
      {key:'massSize',label:'Mass size',type:'range',min:.1,max:3,step:.1,wide:true},
      {key:'ownCellColoring',label:'Own cell coloring',type:'select',options:[['multibox','Multibox'],['server','Normal']],hint:'Multibox: active blue, other connection white. Normal keeps game colors and marks the active border.'},
      {key:'canvasCellEffects',label:'Canvas cell effects',type:'toggle',hint:'Use the shaded Vintage cell style instead of flat colors.'},
      {key:'shortMass',label:'Short mass values (34.9k)',type:'toggle'},
    ],
    Food:[
      {key:'rainbowFood',label:'Multicolor food',type:'toggle'},
      {key:'foodColor',label:'Custom food color',type:'color',hint:'Used when multicolor food is off.'},
      {key:'foodSize',label:'Food size',type:'range',min:.5,max:2,step:.1},
    ],
    Virus:[
      {key:'virusColor',label:'Virus color',type:'color'},
    ],
    ActiveCell:[
      {key:'activeCellIndicatorColor',label:'Inactive cell color',type:'fixed-color',hint:'Fixed white for the other connection: body in Multibox, indicator in Normal.'},
      {key:'activeCellIndicatorSize',label:'Inactive indicator size',type:'range',min:0,max:200,step:1,wide:true,unit:'%',hint:'Normal coloring only. 100% follows the cell edge; 0 hides the white indicator.'},
      {key:'activeCellBorderColor',label:'Active cell color / border',type:'color',hint:'Blue for the connection you control: body in Multibox, border in Normal. Tab switches connections.'},
      {key:'activeCellBorderWidth',label:'Active cell border width',type:'range',min:0,max:100,step:1,wide:true,unit:'%',hint:'Normal coloring only. Multibox always uses flat cell colors.'},
    ],
    Border:[
      {key:'showBorders',label:'World border',type:'toggle'},
      {key:'borderStyle',label:'Edge style',type:'select',options:[['solid','Solid'],['prism','Prism flow']]},
      {key:'prismSpeed',label:'Rainbow flow speed',type:'range',min:.2,max:3,step:.1,unit:'x'},
      {key:'borderColor',label:'Border color',type:'color'},
      {key:'borderWidth',label:'Border width',type:'range',min:1,max:24,step:1,unit:' px'},
      {key:'borderGlow',label:'Edge glow',type:'toggle'},
      {key:'borderGlowColor',label:'Glow color',type:'color'},
      {key:'borderGlowDistance',label:'Glow spread',type:'range',min:0,max:100,step:1,unit:' px'},
      {key:'borderGlowStrength',label:'Glow intensity',type:'range',min:0,max:100,step:1,unit:'%'},
    ],
    Sectors:[
      {key:'showSectors',label:'Atlas sectors',type:'toggle'},
      {key:'sectorScale',label:'Sector size',type:'range',min:50,max:250,step:5,unit:'%'},
      {key:'sectorRainbow',label:'Rainbow sector grid',type:'toggle'},
      {key:'prismSpeed',label:'Rainbow flow speed',type:'range',min:.2,max:3,step:.1,unit:'x'},
      {key:'sectorGridColor',label:'Sector grid color',type:'color'},
      {key:'sectorGridWidth',label:'Sector line width',type:'range',min:.5,max:12,step:.5,unit:' px'},
      {key:'sectorColor',label:'Sector label color',type:'color'},
      {key:'sectorLabelSize',label:'Coordinate size',type:'range',min:8,max:96,step:1,unit:' px'},
      {key:'sectorLabelPosition',label:'Coordinate placement',type:'select',options:[['corner','Atlas corners'],['center','Sector centers']]},
    ],
    Background:[
      {key:'showThemeArtwork',label:'Theme scene objects',type:'toggle'},
      {key:'useDrawnBackground',label:'Use my drawing',type:'toggle'},
      {key:'backgroundDesign',label:'Background Studio',type:'drawing',hint:'Draw a custom background with colors, shapes, stickers and symbols.'},
      {key:'bgColor',label:'Background color',type:'color'},
      {key:'backgroundImage',label:'Use background image',type:'toggle'},
      {key:'backgroundUrl',label:'Static background URL (inside server square)',type:'url'},
      {key:'worldLogoUrl',label:'Center logo URL (fit inside square)',type:'url'},
      {key:'showGrid',label:'Background grid',type:'toggle'},
      {key:'gridColor',label:'Background grid color',type:'color'},
    ],
    'Theme presets':[],
    'PUT UR THEME':[],
  },
  controls:{
    Keyboard:[
      {key:'keyMenu',label:'Toggle menu',type:'key'},
      {key:'keyHUD',label:'Toggle HUD',type:'key'},
      {key:'keyChat',label:'Open / send chat',type:'key'},
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
      {key:'keyStopMove',label:'Stop movement (toggle)',type:'key'},
      {key:'keyToggleNames',label:'Toggle cell nick',type:'key'},
      {key:'keyToggleMass',label:'Toggle cell mass',type:'key'},
      {key:'keyToggleSkin',label:'Toggle skins',type:'key'},
      {key:'keyToggleChat',label:'Toggle chat messages',type:'key'},
      {key:'keyToggleSectors',label:'Toggle background sectors',type:'key'},
    ],
    Mouse:[
      {key:'mouseLeft',label:'Left click',type:'select',options:INPUT_ACTIONS},
      {key:'mouseMiddle',label:'Middle click',type:'select',options:INPUT_ACTIONS},
      {key:'mouseRight',label:'Right click',type:'select',options:INPUT_ACTIONS},
      {key:'mouseSensitivity',label:'Mouse sensitivity',type:'range',min:.5,max:1.8,step:.1},
      {key:'rightClickMove',label:'Right-click movement',type:'toggle',hint:'Steer the second connection when Right click is set to None.'},
      {key:'invertWheel',label:'Invert wheel zoom',type:'toggle'},
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

S.graphics={World:S.game.Render,Cells:S.game.Cells,Elements:S.game.Elements};
S.chat={Display:S.game.Helpers.filter(item=>item.key==='showChat'),Messages:S.controls.Commands.filter(item=>item.type==='commands')};
S.hud={Panels:S.game.Helpers.filter(item=>['showLeaderboard','showMinimap'].includes(item.key))};
S.game={Camera:S.game.Camera,Respawn:S.game.Helpers.filter(item=>item.key==='autoRespawn')};

function showSettings(){
  releaseInputs();settingsTrigger=document.activeElement;settingsOpeningCopy=JSON.parse(JSON.stringify(settings));
  themeDraft=null;scenePreview?.reset();
  isSettingsOpen=true;$('settings-search').value='';$('settings-overlay').classList.remove('hidden');renderSettings();
  $('settings-search').focus({preventScroll:true});
}
function hideSettings(){backgroundStudio?.close();isSettingsOpen=false;themeDraft=null;applySettings();$('settings-overlay').classList.add('hidden');settingsTrigger?.focus?.({preventScroll:true});}
function openBackgroundStudio(){
  const trigger=document.activeElement,overlay=$('settings-overlay');overlay.classList.add('studio-open');
  backgroundStudio=mountBackgroundStudio(overlay,{
    design:settings.backgroundDesign,draw:drawBackgroundDesign,normalize:normalizeBackgroundDesign,maxElements:BACKGROUND_MAX_ELEMENTS,maxPoints:BACKGROUND_MAX_POINTS,
    onSave(design,use){
      const previous={backgroundDesign:settings.backgroundDesign,useDrawnBackground:settings.useDrawnBackground};
      settings.backgroundDesign=design;settings.useDrawnBackground=use||settings.useDrawnBackground;
      if(!saveSettings()){Object.assign(settings,previous);applySettings();return false;}
      renderSettings();toast(use?'Your drawing is now the arena background':'Background drawing saved');return true;
    },
    onClose(){backgroundStudio=null;overlay.classList.remove('studio-open');if(trigger?.isConnected)trigger.focus({preventScroll:true});else $('settings-search').focus({preventScroll:true});}
  });
}
function settingValue(item,values=settings){
  if(!item)return '—';const value=values[item.key];
  if(item.type==='toggle')return value?'ON':'OFF';
  if(item.key==='themePreset')return THEMES[value]?.label||String(value);
  if(item.key==='customTheme')return value?'Custom':'None';
  if(item.type==='drawing')return value?value.elements.length+' elements':'No drawing yet';
  if(item.type==='select')return item.options?.find(([key])=>key===value)?.[1]||String(value);
  if(item.key==='zoom')return Math.round(value*100)+'%';
  if(item.key==='animation')return value+' ms';
  if(['cellOpacity','activeCellIndicatorSize','activeCellBorderWidth','borderGlowStrength','sectorScale'].includes(item.key))return value+'%';
  if(['borderWidth','borderGlowDistance','sectorGridWidth','sectorLabelSize'].includes(item.key))return value+' px';
  if(['mouseSensitivity','wheelZoomSensitivity','prismSpeed'].includes(item.key))return Number(value).toFixed(1)+'x';
  if(item.type==='commands')return '10 messages';
  return value===''?'Not set':value==='NO KEY'?'Not assigned':String(value??'—');
}
function selectSetting(item){
  selectedSetting=item;
  document.querySelectorAll('#settings-content [data-setting]').forEach(row=>row.classList.toggle('is-selected',row.dataset.setting===item?.key));
  refreshSettingsDetail();
}
function refreshSettingsDetail(){
  const category=SETTINGS_CATEGORIES[settingsTab],item=selectedSetting;
  $('settings-detail-category').textContent=item?.section||category.label;
  $('settings-detail-title').textContent=item?.label||category.label;
  const fallback=item?.type==='key'?'Click the binding and press a key. Release Shift, Ctrl or Alt to bind it alone, or add another key for a combination. Use Clear to remove it.':category.description;
  $('settings-detail-description').textContent=item?(SETTING_HELP[item.key]||item.hint||fallback):category.description;
  $('settings-detail-value').textContent=settingValue(item);$('settings-detail-default').textContent=settingValue(item,DEFAULT_SETTINGS);
  $('settings-detail-note').textContent=isCustomThemeOpen()?'Live draft. Save & apply keeps colors and objects in the game and lobby. Back closes an unsaved draft.':'Changes apply immediately. Discard restores your setup from when this panel opened.';
  const saveState=document.querySelector('.settings-save-state');if(saveState?.lastChild)saveState.lastChild.textContent=isCustomThemeOpen()?' LIVE DRAFT / SAVE TO KEEP':' SAVED ON THIS DEVICE';
  const preview=$('settings-preview');
  preview.style.setProperty('--preview-cell',settings.activeCellBorderColor);preview.style.setProperty('--preview-opacity',settings.cellOpacity/100);
  preview.style.setProperty('--preview-food',settings.foodColor);preview.style.setProperty('--preview-grid',settings.showGrid?'.35':'.08');
  preview.style.setProperty('--preview-scale',Math.max(.65,Math.min(1.35,Math.pow(settings.zoom,.15))));
  preview.style.setProperty('--preview-border',settings.showBorders?settings.borderColor:'transparent');
  preview.style.setProperty('--preview-border-width',Math.min(settings.borderWidth,8)+'px');
  preview.style.setProperty('--preview-glow',settings.borderGlow?`0 0 ${settings.borderGlowDistance/2}px ${settings.borderGlowColor}`:'none');
  preview.classList.add('show-atlas-preview');drawSettingsArtwork(performance.now());
  preview.classList.toggle('hide-preview-names',!settings.showNames);preview.classList.toggle('hide-preview-mass',!settings.showMass);preview.classList.toggle('hide-preview-food',!settings.showFood);
}
function drawSettingsArtwork(now){
  const preview=$('settings-preview');
  if(!scenePreview)scenePreview=mountThemeScene(preview,{Renderer:ArenaRenderer,getSettings:currentVisualSettings,canEdit:isCustomThemeOpen,normalize:normalizeBackgroundDesign,maxElements:BACKGROUND_MAX_ELEMENTS,onArtworkChange(design){if(themeDraft){themeDraft.themeArtwork=design;themeDraft.showThemeArtwork=true;applySettings();}}});
  scenePreview.draw(now);
}

function renderSettings(){
  if(!(settingsPage in S[settingsTab])) settingsPage = Object.keys(S[settingsTab])[0];
  applySettings();
  document.querySelectorAll('#settings-tabs button').forEach(b=>{b.classList.toggle('active',b.dataset.tab===settingsTab);b.setAttribute('aria-pressed',String(b.dataset.tab===settingsTab));});
  const query=$('settings-search').value.trim().toLowerCase();$('settings-reset-tab').disabled=!!query||settingsTab==='import';
  const nav = $('settings-nav'); nav.replaceChildren();
  for(const name of Object.keys(S[settingsTab])){
    const b=document.createElement('button'); b.textContent=name==='PUT UR THEME'?'Scene Lab':name; b.className=name===settingsPage?'active':'';b.setAttribute('aria-pressed',String(name===settingsPage)); b.onclick=()=>{settingsPage=name;$('settings-search').value='';renderSettings();};nav.appendChild(b);
  }
  const area = $('settings-content'); area.replaceChildren();
  area.lang=settingsTab==='controls'?'en':'';area.dir='ltr';
  if(query){
    const seen=new Set(),matches=[];
    for(const [tab,pages]of Object.entries(S))for(const [page,items]of Object.entries(pages))for(const item of items){
      if(seen.has(item.key)||!`${item.label} ${item.hint||''} ${item.key}`.toLowerCase().includes(query))continue;
      seen.add(item.key);matches.push({...item,section:SETTINGS_CATEGORIES[tab].label+' / '+page});
    }
    const title=document.createElement('h3');title.className='settings-section-title';title.textContent=matches.length+' RESULTS';area.append(title);
    if(!matches.length){const empty=document.createElement('p');empty.className='hint';empty.textContent='No settings match. Try camera, grid, colors or split.';area.append(empty);}
    for(const item of matches)renderSettingRow(area,item);
    selectSetting(matches.find(item=>item.key===selectedSetting?.key)||matches[0]||null);return;
  }
  if(settingsTab === 'import'){selectedSetting=null;renderImport(area);refreshSettingsDetail();return;}
  const heading=document.createElement('h3');heading.className='settings-section-title';heading.textContent=settingsPage==='PUT UR THEME'?'SCENE LAB':settingsPage.toUpperCase();area.append(heading);
  if(settingsTab==='controls'){
    const tools=document.createElement('div');tools.className='controls-toolbar';
    const hint=document.createElement('p');hint.className='hint';hint.textContent='Any keyboard layout. Bind a key or combination; use Clear to unbind. Changes save immediately.';
    const reset=document.createElement('button');reset.type='button';reset.className='settings-action';reset.textContent='RESET CONTROLS';
    reset.onclick=()=>{settings=normalizeControlSettings({...settings,controlsVersion:0},true);releaseInputs();saveSettings();renderSettings();toast('Controls restored');};
    tools.append(hint,reset);area.append(tools);
  }
  if(settingsTab==='theme' && settingsPage==='Theme presets'){renderThemePresets(area);selectSetting({key:'themePreset',label:'Theme preset',type:'select'});return;}
  if(settingsTab==='theme' && settingsPage==='PUT UR THEME'){renderCustomTheme(area);selectSetting({key:'customTheme',label:'Live theme scene',type:'select'});return;}
  for(const item of S[settingsTab][settingsPage]) renderSettingRow(area,item);
  selectSetting(S[settingsTab][settingsPage].find(item=>item.key===selectedSetting?.key)||S[settingsTab][settingsPage][0]||null);
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
      themeDraft=null;scenePreview?.reset();
      for(const key of ['accentColor','bgColor','gridColor']) settings[key]=t[key];
      settings.themePreset=id;settings.panelColor=t.panel;settings.textColor='#f5f9ff';saveSettings();renderSettings();
    };grid.append(card);
  }
  const custom=document.createElement('button');custom.type='button';custom.className='theme-card custom-theme-card';
  const customTitle=document.createElement('strong');customTitle.textContent='SCENE LAB';
  const customDesc=document.createElement('span');customDesc.textContent='Create your own theme • Choose all colors, a background and a center logo • Save locally';
  const customPreview=document.createElement('div');customPreview.className='theme-preview';customPreview.innerHTML='<i></i><i></i><i></i>';
  custom.append(customPreview,customTitle,customDesc);custom.onclick=()=>{settingsPage='PUT UR THEME';renderSettings();};grid.append(custom);
  area.append(grid);
}
function renderCustomTheme(area){
  if(!themeDraft)themeDraft={...settings,name:settings.customTheme?.name||'My Vintage Theme',themePreset:'custom',themeArtwork:normalizeBackgroundDesign(settings.themeArtwork)};
  const draft=themeDraft;
  const intro=document.createElement('p');intro.className='theme-intro';intro.textContent='Build your Vintage scene. Colors update the live stage immediately. Add objects beside the stage and drag them into place; save to show your design in the arena and lobby.';
  area.append(intro);
  function makeInput(title,key,type){
    const wrap=document.createElement('label');wrap.className='theme-field';
    const text=document.createElement('span');text.textContent=title;
    const inp=document.createElement('input');inp.type=type;inp.value=draft[key]|| (type==='color'?'#ffffff':'');
    inp.setAttribute('aria-label','Theme '+title);
    if(type==='text')inp.maxLength=32;
    if(type==='url'){inp.placeholder='https://example.com/image.png';inp.maxLength=1200;}
    inp.addEventListener('input',()=>{
      if(type==='url'){
        const value=cleanAssetUrl(inp.value);if(inp.value.trim()&&!value){inp.setAttribute('aria-invalid','true');return;}inp.removeAttribute('aria-invalid');draft[key]=value;draft.backgroundImage=true;
      }else draft[key]=inp.value;
      if(key==='gridColor')draft.showGrid=true;if(key==='foodColor')draft.rainbowFood=false;
      applySettings();refreshSettingsDetail();
    });
    wrap.append(text,inp);return wrap;
  }
  const title=document.createElement('div');title.className='theme-name-field';title.append(makeInput('YOUR THEME NAME','name','text'));area.append(title);
  const controls=document.createElement('div');controls.className='custom-colors';
  const fields=[['Accent','accentColor'],['Panel / HUD','panelColor'],['Interface text','textColor'],['Field background','bgColor'],
    ['Grid','gridColor'],['Food','foodColor'],['Virus','virusColor'],['World border','borderColor'],['Sector lines','sectorGridColor'],['Sector labels','sectorColor']];
  for(const [name,key] of fields)controls.append(makeInput(name,key,'color'));
  area.append(controls);
  const assets=document.createElement('div');assets.className='theme-assets';assets.append(makeInput('BACKGROUND URL (fixed inside server square)','backgroundUrl','url'),makeInput('CENTER LOGO URL','worldLogoUrl','url'));area.append(assets);
  const artworkLabel=document.createElement('label');artworkLabel.className='scene-show-artwork';const artworkSwitch=document.createElement('input');artworkSwitch.type='checkbox';artworkSwitch.checked=draft.showThemeArtwork;artworkSwitch.setAttribute('aria-label','Show scene objects');artworkSwitch.onchange=()=>{draft.showThemeArtwork=artworkSwitch.checked;applySettings();};artworkLabel.append(artworkSwitch,document.createTextNode('Show objects in the game and lobby'));area.append(artworkLabel);
  const actions=document.createElement('div');actions.className='custom-theme-actions';
  const save=document.createElement('button');save.type='button';save.className='settings-action blue';save.textContent='SAVE & APPLY THEME';
  save.onclick=()=>{
    if(area.querySelector('[aria-invalid="true"]')){toast('Finish the image link or clear it before saving');return;}
    const preset={name:String(draft.name||'My Vintage Theme').trim().slice(0,32)||'My Vintage Theme',backgroundUrl:cleanAssetUrl(draft.backgroundUrl),worldLogoUrl:cleanAssetUrl(draft.worldLogoUrl),artwork:normalizeBackgroundDesign(draft.themeArtwork)};
    for(const [,key] of fields)preset[key]=cleanHex(draft[key],settings[key]);
    if(draft.backgroundUrl&&!preset.backgroundUrl||draft.worldLogoUrl&&!preset.worldLogoUrl){toast('Use a valid http(s) image URL');return;}
    const previous={...settings};settings.customTheme=preset;settings.themePreset='custom';
    for(const [,key] of fields)settings[key]=preset[key];
    settings.backgroundUrl=preset.backgroundUrl;settings.worldLogoUrl=preset.worldLogoUrl;
    settings.backgroundImage=draft.backgroundImage;settings.showGrid=draft.showGrid;settings.rainbowFood=draft.rainbowFood;
    settings.themeArtwork=preset.artwork;settings.showThemeArtwork=draft.showThemeArtwork;
    if(!saveSettings()){settings=previous;applySettings();return;}
    themeDraft=null;toast('Theme saved: '+preset.name);renderSettings();
  };
  actions.append(save);
  const reset=document.createElement('button');reset.type='button';reset.className='settings-action';reset.textContent='BACK TO PRESETS';
  reset.onclick=()=>{settingsPage='Theme presets';renderSettings();};actions.append(reset);area.append(actions);
  if(settings.themePreset==='custom' && settings.customTheme){const current=document.createElement('p');current.className='hint';current.textContent='ACTIVE: '+settings.customTheme.name;area.append(current);}
}
function renderSettingRow(area,item){
  const row=document.createElement('div'); row.className='setting-row';
  row.dataset.setting=item.key;row.addEventListener('pointerenter',()=>selectSetting(item));row.addEventListener('focusin',()=>selectSetting(item));
  const lab=document.createElement('div'); lab.className='setting-label'; lab.textContent=item.label;
  if(item.hint){const hint=document.createElement('small');hint.textContent=item.hint;lab.append(hint);}
  const box=document.createElement('div'); box.className='setting-control';
  if(item.type==='toggle'){
    row.classList.add('is-toggle');
    const labelWrap=document.createElement('label'); labelWrap.className='toggle-switch';
    const field=document.createElement('input'); field.type='checkbox'; field.checked=!!settings[item.key]; field.onchange=()=>{if(item.key==='useDrawnBackground'&&field.checked&&!settings.backgroundDesign){field.checked=false;openBackgroundStudio();return;}settings[item.key]=field.checked; status.textContent=field.checked?'ON':'OFF'; saveSettings(); };
    field.setAttribute('aria-label',item.label);
    const slider=document.createElement('span'); slider.className='toggle-slider';
    const status=document.createElement('span'); status.className='toggle-status'; status.textContent=field.checked?'ON':'OFF';
    labelWrap.append(field,slider,status); box.append(labelWrap);
  } else if(item.type==='drawing'){
    row.classList.add('background-design-row');
    const info=document.createElement('p');info.textContent=settings.backgroundDesign?'Your editable canvas is saved on this device.':'Create a world with your own colors, drawing, shapes, stickers and text.';
    const open=document.createElement('button');open.type='button';open.className='settings-action';open.textContent=settings.backgroundDesign?'EDIT DRAWING':'OPEN BACKGROUND STUDIO';open.onclick=openBackgroundStudio;
    if(settings.backgroundDesign){const thumbnail=document.createElement('canvas');thumbnail.width=192;thumbnail.height=192;drawBackgroundDesign(thumbnail.getContext('2d'),settings.backgroundDesign,192);box.appendChild(thumbnail);}
    box.append(info,open);
  } else if(item.type==='range'){
    const field=document.createElement('input'); field.type='range'; field.min=item.min; field.max=item.max; field.step=item.step; field.value=settings[item.key];
    const v=document.createElement('span'); v.className='setting-value'; v.textContent=settings[item.key];
    field.setAttribute('aria-label',item.label);
    const animation=item.key==='animation';
    const updateRange=()=>{
      v.textContent=animation?settings.animation+' ms':field.value+(item.unit||'');
      field.style.setProperty('--range-progress',((Number(field.value)-item.min)/(item.max-item.min)*100)+'%');
      if(animation){
        field.setAttribute('aria-valuetext',settings.animation===0?'Instant':settings.animation+' milliseconds');
      }
    };
    field.oninput=()=>{ settings[item.key]=animation?normalizeAnimation(Number(field.value)):Number(field.value); updateRange();saveSettings();if(item.key==='zoom')setCameraControlsVisible(); };
    if(animation){
      row.classList.add('animation-setting');field.id='setting-animation';
      lab.append(v);const hint=document.createElement('small');hint.className='animation-hint';hint.id='animation-hint';
      hint.textContent='0 = instant · Lower = faster · Higher = slower';field.setAttribute('aria-describedby',hint.id);
      box.append(field,hint);
    }else if(item.wide){row.classList.add('slider-setting');lab.append(v);box.append(field);}
    else box.append(field,v);
    updateRange();
  } else if(item.type==='color'||item.type==='fixed-color'){
    const editor=document.createElement('div');editor.className='color-editor';
    const field=document.createElement('input');field.type='color';field.value=cleanHex(settings[item.key],'#ffffff');field.setAttribute('aria-label',item.label);
    const hex=document.createElement('input');hex.type='text';hex.value=field.value.slice(1).toUpperCase();hex.maxLength=7;hex.spellcheck=false;hex.setAttribute('aria-label',item.label+' hex');
    field.oninput=()=>{settings[item.key]=field.value;hex.value=field.value.slice(1).toUpperCase();hex.removeAttribute('aria-invalid');saveSettings();};
    hex.oninput=()=>{const value='#'+hex.value.trim().replace(/^#/,'');if(HEX.test(value)){settings[item.key]=value;field.value=value;hex.removeAttribute('aria-invalid');saveSettings();}else hex.setAttribute('aria-invalid','true');};
    hex.onblur=()=>{hex.value=field.value.slice(1).toUpperCase();hex.removeAttribute('aria-invalid');};
    if(item.type==='fixed-color'){hex.readOnly=true;field.disabled=true;}
    editor.append(hex,field);box.append(editor);
  } else if(item.type==='select'){
    const field=document.createElement('select');field.setAttribute('aria-label',item.label);
    for(const [value,label] of item.options){const option=document.createElement('option');option.value=value;option.textContent=label;field.append(option);}
    field.value=settings[item.key];field.onchange=()=>{settings[item.key]=field.value;saveSettings();};box.append(field);
  } else if(item.type==='url'){
    const field=document.createElement('input'); field.type='url'; field.value=settings[item.key]; field.placeholder='https://...'; field.onchange=()=>{ const val=cleanAssetUrl(field.value);if(field.value.trim()&&!val){toast('Use an http(s) image link');field.value=settings[item.key];return;}settings[item.key]=val;saveSettings(); }; box.append(field);
  } else if(item.type==='key'){
    const field=document.createElement('input'); field.type='text'; field.className='keybind'; field.readOnly=true; field.value=settings[item.key]; field.title='Press any key or key combination. Use Clear to unbind.';field.setAttribute('aria-label',item.label);field.lang='en';field.dir='ltr';
    let pendingModifier=null;
    const bind=k=>{
      if(k==='NO KEY')return;
      for(const key of CONTROL_KEYS)if(key!==item.key&&settings[key]===k)settings[key]='NO KEY';
      pendingModifier=null;settings[item.key]=k;field.value=k;field.blur();saveSettings();renderSettings();
    };
    field.onfocus=()=>{ field.value='PRESS KEY...'; };
    field.onkeydown=e=>{
      e.preventDefault();e.stopPropagation();const k=normalizeKey(e);
      if(['SHIFT','CTRL','ALT','META','ALTGRAPH'].includes(k)){pendingModifier=k;field.value=k+'…';return;}
      bind(k);
    };
    field.onkeyup=e=>{e.preventDefault();e.stopPropagation();if(pendingModifier===normalizeKey(e))bind(pendingModifier);};
    field.onblur=()=>{pendingModifier=null;field.value=settings[item.key];};
    const clear=document.createElement('button');clear.type='button';clear.className='settings-action';clear.textContent='Clear';clear.setAttribute('aria-label','Clear '+item.label);
    clear.onclick=()=>{settings[item.key]='NO KEY';saveSettings();renderSettings();};
    box.append(field,clear);
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
  const imp=document.createElement('button'); imp.className='settings-action blue'; imp.textContent='↑ IMPORT JSON'; imp.onclick=()=>{ try{ const data=JSON.parse(text.value); if(!data || typeof data!=='object' || Array.isArray(data)) throw Error('Invalid'); settings=valueSafe(data);themeDraft=null;scenePreview?.reset(); saveSettings(); toast('Settings imported'); renderSettings(); }catch{ toast('Invalid settings JSON'); } };
  const reset=document.createElement('button'); reset.className='settings-action red'; reset.textContent='↺ RESET DEFAULTS'; reset.onclick=()=>{ if(confirm('Reset all Vintage settings to defaults?')){ settings=cloneDefaults();themeDraft=null;scenePreview?.reset();saveSettings(); renderSettings(); toast('Defaults restored'); } };
  actions.append(exp,imp,reset);
  const fileWrap=document.createElement('label'); fileWrap.className='file-pick'; fileWrap.textContent='Choose JSON file';
  const file=document.createElement('input'); file.type='file'; file.accept='.json,application/json'; file.onchange=async()=>{const chosen=file.files?.[0];if(chosen){if(chosen.size>2000000){toast('Choose a settings file smaller than 2 MB');return;}text.value=await chosen.text();fileWrap.dataset.filename=chosen.name;}};fileWrap.append(file);
  area.append(h,p,actions,fileWrap,text);
}

function normalizeKey(e){return physicalKey(e);}
function isEditing(){ return ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable||isSettingsOpen; }

window.addEventListener('keydown',e=>{
  if(isSettingsOpen){
    if(e.key==='Escape'){hideSettings();e.preventDefault();}
    else if(e.key==='Tab'){
      const fields=[...$('settings-overlay').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(field=>field.offsetParent!==null);
      const first=fields[0],last=fields.at(-1);
      if(e.shiftKey&&document.activeElement===first){last?.focus();e.preventDefault();}
      else if(!e.shiftKey&&document.activeElement===last){first?.focus();e.preventDefault();}
    }
    return;
  }
  let k=normalizeKey(e);
  // Holding a separately bound Shift/Ctrl/etc. must not block ordinary feed keys.
  const parts=k.split('+');
  if(parts.length>1&&!CONTROL_KEYS.some(key=>settings[key]===k)&&parts.slice(0,-1).some(mod=>CONTROL_KEYS.some(key=>settings[key]===mod)))k=parts.at(-1);
  if(k==='NO KEY')return;
  if(document.activeElement === $('chat-input')){
    if(e.isComposing)return;
    if(k==='ESCAPE'){closeChat();e.preventDefault();}
    else if(k==='ENTER'||k===settings.keyChat){e.preventDefault();if(!e.repeat)submitChat();}
    return;
  }
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable){ if(k==='ESCAPE') document.activeElement.blur(); return; }
  if(k===settings.keyMenu){ if(document.body.classList.contains('show-lobby') && playing) beginGame(); else enterLobby(); e.preventDefault(); return; }
  if(k===settings.keySettings){ showSettings(); e.preventDefault(); return; }
  if((!playing && !spectating) || isEditing() || document.body.classList.contains('show-lobby')) return;
  if(e.repeat&&k!==settings.keyFeed&&k!==settings.keyMacroFeed){e.preventDefault();return;}
  if(k===settings.keyChat){openChat();e.preventDefault();return;}
  if(k===settings.keyChatToggle){ chatChannel = chatChannel==='all'&&tag ? 'tag' : 'all'; updateChatTabs(); e.preventDefault(); return; }
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
  if(k===settings.keyFeed){
    if(!feedHeld){feedHeld=true;doAction('feed');nextMacroFeedAt=performance.now()+feedIntervalFor(mode)*1000;}
    e.preventDefault();return;
  }
  if(k===settings.keyMacroFeed){ if(!macroFeedHeld){macroFeedHeld=true;if(!feedHeld)nextMacroFeedAt=0;}e.preventDefault();return; }
  if(k===settings.keyStopMove && settings.keyStopMove!=='NO KEY'){ stopMovement(); e.preventDefault(); return; }
  if(k===settings.keyToggleNames){ toggleSetting('showNames','Names'); e.preventDefault(); return; }
  if(k===settings.keyToggleMass){ toggleSetting('showMass','Mass labels'); e.preventDefault(); return; }
  if(k===settings.keyToggleSkin){toggleSetting('showSkins','Skins');e.preventDefault();return;}
  if(k===settings.keyToggleChat && settings.keyToggleChat!=='NO KEY'){ toggleSetting('showChat','Chat'); e.preventDefault(); return; }
  if(k===settings.keyToggleSectors){ toggleSetting('showSectors','Sectors'); e.preventDefault(); return; }
  for(let i=1;i<=10;i++){ if(k===settings['keyCommand'+i]){ triggerCommand(i-1); e.preventDefault(); return; } }
  for(let i=1;i<=5;i++){ if(k===settings['keyZoom'+i]){ setZoomLevel(i); e.preventDefault(); return; } }
});

window.addEventListener('keyup',e=>{
  const k=normalizeKey(e);
  if(settings.keyFeed.split('+').includes(k.split('+').at(-1)))feedHeld=false;
  if(settings.keyMacroFeed.split('+').includes(k.split('+').at(-1)))macroFeedHeld=false;
});
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
$('chat-input').addEventListener('focus',()=>{releaseInputs();$('chat').classList.add('chat-active');});
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
$('chat-form').onsubmit=e=>{e.preventDefault();submitChat();};

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
$('close-settings').onclick=hideSettings;
$('settings-done').onclick=hideSettings;
$('settings-search').addEventListener('input',renderSettings);
$('settings-discard').onclick=()=>{
  if(settingsOpeningCopy){settings=valueSafe(settingsOpeningCopy);releaseInputs();saveSettings();}
  hideSettings();
};
$('settings-reset-tab').onclick=()=>{
  const keys=new Set(Object.values(S[settingsTab]).flatMap(items=>items.map(item=>item.key)));
  if(settingsTab==='theme'){keys.add('themePreset');keys.add('customTheme');keys.add('themeArtwork');themeDraft=null;scenePreview?.reset();}
  for(const key of keys)if(key in DEFAULT_SETTINGS)settings[key]=JSON.parse(JSON.stringify(DEFAULT_SETTINGS[key]));
  releaseInputs();saveSettings();renderSettings();
};
$('settings-overlay').addEventListener('click',e=>{ if(e.target===$('settings-overlay')) hideSettings(); });
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=(e)=>{ const btn=e.target.closest('[data-mode]'); if(!btn)return; if(playing) enterLobby(); if(btn.dataset.mode) updateMode(btn.dataset.mode); });
document.querySelectorAll('.chat-tab').forEach(b=>b.onclick=()=>{ chatChannel=b.dataset.channel; updateChatTabs(); });
document.querySelectorAll('#settings-tabs button').forEach(b=>b.onclick=()=>{settingsTab=b.dataset.tab;settingsPage=Object.keys(S[settingsTab])[0];$('settings-search').value='';renderSettings();});
document.querySelectorAll('.soon-btn').forEach(btn=>btn.addEventListener('click',e=>{ const msg=btn.dataset.soon; if(msg){ e.preventDefault(); toast(msg); } }));
document.querySelectorAll('.region-tab').forEach(btn=>btn.addEventListener('click',()=>{ if(btn.classList.contains('soon-btn')) return; document.querySelectorAll('.region-tab').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); }));
$('nickname').addEventListener('input', updateProfileName);
window.addEventListener('pointermove',e=>{
  pointer={x:e.clientX,y:e.clientY}; pointerOverField=e.target===$('arena');
  if(draggingCamera && spectating && dragPointer){
    renderer.cam.x=clampClient(renderer.cam.x+(dragPointer.x-e.clientX)/Math.max(renderer.zoom,.07),0,(remoteSnapshot?.worldSize||worldSizeFor(mode)));
    renderer.cam.y=clampClient(renderer.cam.y+(dragPointer.y-e.clientY)/Math.max(renderer.zoom,.07),0,(remoteSnapshot?.worldSize||worldSizeFor(mode)));
    dragPointer={x:e.clientX,y:e.clientY};
  }
});
window.addEventListener('wheel',e=>{
  if(!settings.wheelZoom || !(playing||spectating) || isSettingsOpen||e.target!==$('arena')) return;
  e.preventDefault();
  const delta=(e.deltaMode===1?e.deltaY*16:e.deltaMode===2?e.deltaY*innerHeight:e.deltaY);
  adjustZoom(Math.exp(-Math.max(-320,Math.min(320,delta))*.0023*(settings.wheelZoomSensitivity||1)*(settings.invertWheel?-1:1)),e.clientX,e.clientY);
},{passive:false});
$('arena').addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('contextmenu',e=>{ if(e.target===$('arena'))e.preventDefault(); });
window.addEventListener('pointerdown',e=>{
  if(e.target!==$('arena'))return;
  if(spectating && e.button===2){ enterLobby(); e.preventDefault(); return; }
  if(spectating && e.button===0){draggingCamera=true;dragPointer={x:e.clientX,y:e.clientY};document.body.classList.add('dragging-camera');e.preventDefault();return;}
  if(!playing||isSettingsOpen||document.body.classList.contains('show-lobby'))return;
  const action=settings[['mouseLeft','mouseMiddle','mouseRight'][e.button]]||'none';
  if(action!=='none'){
    e.preventDefault();$('arena').setPointerCapture?.(e.pointerId);pointer={x:e.clientX,y:e.clientY};
    if(action==='feed')mouseFeedButtons.add(e.button);
    if(action==='macroFeed')mouseMacroButtons.add(e.button);
    inputAction(action);nextMacroFeedAt=performance.now()+feedIntervalFor(mode,action==='macroFeed')*1000;
  }else if(e.button===2&&settings.rightClickMove){rightDown=true;e.preventDefault();}
});
window.addEventListener('pointerup',e=>{
  mouseFeedButtons.delete(e.button);mouseMacroButtons.delete(e.button);
  if(e.button===2)rightDown=false;
  if(e.button===0){draggingCamera=false;dragPointer=null;document.body.classList.remove('dragging-camera');}
});
window.addEventListener('pointercancel',()=>releaseInputs());
window.addEventListener('blur',()=>{releaseInputs();draggingCamera=false;dragPointer=null;document.body.classList.remove('dragging-camera');});
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








