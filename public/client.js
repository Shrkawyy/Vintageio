import {MODES, DEFAULT_SETTINGS, LocalArena, ArenaRenderer, AUTO_SPLIT_MASS, WORLD_SIZE} from './game.js';

const $ = id => document.getElementById(id);
const SETTINGS_KEY = 'vintage-settings-v2';
const cloneDefaults = () => ({...DEFAULT_SETTINGS, chatCommands:[...DEFAULT_SETTINGS.chatCommands]});
const valueSafe = (saved={}) => {
  const next = cloneDefaults();
  for (const [key, val] of Object.entries(saved || {})) {
    if (!(key in next)) continue;
    if (Array.isArray(next[key]) && Array.isArray(val)) next[key] = [...val].slice(0, 10);
    else if (typeof val === typeof next[key]) next[key] = val;
  }
  return next;
};

let settings = (()=>{ try { return valueSafe(JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')); } catch { return cloneDefaults(); }})();
let mode='ffa', playing=false, spectating=false, spectateTargetId='', activeSlot=0, remote=null, hudVisible=true, chatChannel='all', isSettingsOpen=false, frameTime=performance.now();
let nickname='Vintage Player', tag='';
let showDeaths=false, remoteSnapshot=null;
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
  document.documentElement.style.setProperty('--accent', settings.accentColor);
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
  $('top-mode').textContent = mode.toUpperCase() + ' · EUROPE';
  $('mode-label').textContent = MODES[mode].title + ' MODE';
  const label=$('lobby-mode-name'),mass=$('lobby-mode-mass');
  if(label)label.textContent=MODES[mode].title;
  if(mass)mass.textContent='STARTS AT '+MODES[mode].start.toLocaleString('en-US')+' MASS';
  if(!playing && !spectating) arena.reset(mode, nickname, tag, true, settings);
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
}

function enterLobby(){
  macroFeedHeld=false;playing=false; spectating=false; spectateTargetId=''; remote?.disconnect(); remote=null; remoteSnapshot=null;
  setLobbyState(true);
  $('lobby').classList.remove('hidden'); $('gameover').classList.add('hidden');
  $('top-mode').textContent = mode.toUpperCase() + ' · EUROPE';
  $('connection-status').innerHTML = '<i></i> DEMO MODE';
  $('connection-status').classList.remove('online');
  $('chat-online').textContent = 'LOCAL';
  setCameraControlsVisible();
}

function beginGame(){
  nickname = toName($('nickname').value); tag = toTag($('team-tag').value);
  $('nickname').value = nickname; $('team-tag').value = tag;
  $('chat-tag-label').textContent = tag ? ('#'+tag.toUpperCase()) : 'NO TAG';
  updateProfileName();
  macroFeedHeld=false;activeSlot=0; remoteSnapshot=null; showDeaths=false; spectating=false; spectateTargetId=''; playing=true;
  setLobbyState(false);
  setCameraControlsVisible();
  $('lobby').classList.add('hidden'); $('gameover').classList.add('hidden'); clearChat();
  const multi = true;
  arena.reset(mode, nickname, tag, multi, settings);
  remote?.disconnect(); remote=null;
  const wsUrl = String(window.VINTAGE_CONFIG?.wsUrl || '').trim();
  if(wsUrl && /^wss?:\/\//i.test(wsUrl)){
    remote = new RemoteArena(wsUrl,{mode,nickname,tag,multi});
    remote.connect();
    $('connection-status').innerHTML = '<i></i> CONNECTING';
    $('chat-online').textContent = 'CONNECTING';
  }else{
    $('connection-status').innerHTML = '<i></i> DEMO MODE';
    $('chat-online').textContent = 'LOCAL';
    addChat('system','You are playing against local AI. Configure /config.js for online multiplayer.','all');
  }
}

class RemoteArena{
  constructor(url,opts){ this.url=url; this.opts=opts; this.sockets=[]; this.myIds=[]; this.latest=null; this.connected=false; }
  connect(){ const total=this.opts.spectator?1:(this.opts.multi?2:1); for(let n=0;n<total;n++) this.open(n); }
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
        if(slot===0) addChat('system','Connected to the '+MODES[mode].title+' room.','all');
      }
      if(payload.type==='state' && slot===0){ this.latest=payload; remoteSnapshot=payload; }
      if(payload.type==='respawned' && slot===0) toast('Multi respawned at cursor');
      if(payload.type==='chat' && slot===0) addChat(payload.name,payload.text,payload.channel,payload.tag);
      if(payload.type==='error' && slot===0) toast(payload.message || 'Server error');
    });
    ws.addEventListener('close',()=>{
      if(slot===0 && (playing||spectating) && remote===this){
        this.connected=false; $('connection-status').innerHTML='<i></i> OFFLINE'; $('connection-status').classList.remove('online'); $('chat-online').textContent='OFFLINE';
        toast('Connection lost — switched to local preview'); remote?.disconnect(); remote=null; remoteSnapshot=null; arena.reset(mode,nickname,tag,this.opts.multi,settings,this.opts.spectator); 
      }
    });
    ws.addEventListener('error',()=>{ if(slot===0) toast('WebSocket connection failed'); });
  }
  send(slot,msg){ const socket=this.sockets[slot]; if(socket?.readyState===WebSocket.OPEN) socket.send(JSON.stringify(msg)); }
  sendChat(text,channel){ this.send(0,{type:'chat',channel,text}); }
  sendControl(slot,world){ this.send(slot,{type:'move',x:world.x,y:world.y}); }
  sendAction(slot,action){ this.send(slot,{type:action}); }
  respawn(slot,position){this.send(slot,{type:'respawn',x:position.x,y:position.y});}
  disconnect(){ for(const s of this.sockets){ if(s && [0,1].includes(s.readyState)){ try{s.close(1000,'Switch game');}catch{} } } this.connected=false; this.sockets=[]; }
}

function clearChat(){ $('chat-messages').replaceChildren(); }
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
  if(remote?.connected) remote.sendChat(text,chatChannel); else addChat(nickname,text,chatChannel,tag);
}

function activeId(){ return remote ? (remote.myIds[Math.min(activeSlot,remote.myIds.length-1)]||remote.myIds[0]) : (arena.myIds[Math.min(activeSlot,arena.myIds.length-1)]||arena.myIds[0]); }
function selectedId(snapshot){ return spectating ? null : activeId(); }
function beginSpectate(){
  spectating=true; playing=false; showDeaths=false; spectateTargetId=''; rightDown=false; draggingCamera=false;
  setLobbyState(false); $('lobby').classList.add('hidden'); $('gameover').classList.add('hidden');
  const wsUrl=String(window.VINTAGE_CONFIG?.wsUrl || '').trim();
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

function doAction(action){ if(!playing||spectating||isSettingsOpen) return; const id=activeId(); if(remote?.connected){ remote.sendAction(activeSlot,action); } else { if(action==='split') arena.split(id,settings); if(action==='feed') arena.feed(id); } }
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
  const rows=[...(snapshot?.players||[])].filter(p=>p.cells?.length).map(p=>({...p,total:p.cells.reduce((a,c)=>a+c.mass,0)})).sort((a,b)=>b.total-a.total).slice(0,8);
  $('player-count').textContent=(snapshot?.players?.filter(p=>p.cells?.length)?.length||0)+' PLAYERS';
  const container=$('board-entries'); container.replaceChildren();
  for(let i=0;i<rows.length;i++){
    const p=rows[i],line=document.createElement('div'); line.className='leader-entry'+(p.id===focusId?' is-me':'');
    const place=document.createElement('span'),n=document.createElement('b'),m=document.createElement('em');
    place.textContent=String(i+1).padStart(2,'0'); n.textContent=p.name; m.textContent=p.total>=1000?(p.total/1000).toFixed(1)+'k':Math.floor(p.total).toString();
    line.append(place,n,m); container.appendChild(line);
  }
}

let controlAt=0, hudAt=0;
function gameLoop(now){
  const dt=Math.min(.05,(now-frameTime)/1000||.016); frameTime=now;
  if(playing && macroFeedHeld && !isSettingsOpen && now>=nextMacroFeedAt){
    doAction('feed');nextMacroFeedAt=now+85;
  }
  if((playing || spectating) && !isSettingsOpen){
    if(spectating && !draggingCamera && pointerOverField){
      const edge=(pos,size)=>{const n=(pos/size-.5)*2,dead=.23;return Math.sign(n)*Math.pow(Math.max(0,Math.abs(n)-dead)/(1-dead),1.55)};
      const speed=780*dt/Math.max(renderer.zoom,.09);
      renderer.cam.x=clampClient(renderer.cam.x+edge(pointer.x,innerWidth)*speed,0,WORLD_SIZE);
      renderer.cam.y=clampClient(renderer.cam.y+edge(pointer.y,innerHeight)*speed,0,WORLD_SIZE);
    }
    const world=renderer.toWorld(pointer.x,pointer.y);
    const slot=(rightDown && settings.rightClickMove && (remote?.myIds.length || arena.myIds.length)>1)?1:activeSlot;
    if(playing){
      if(remote?.connected){ if(now-controlAt>60){ remote.sendControl(slot,world); controlAt=now; } }
      else { const id=arena.myIds[slot] || activeId(); arena.setTarget(id,world.x,world.y); }
    }
    if(!remote?.connected) arena.tick(dt,settings);
  }else if(!showDeaths){ arena.tick(dt*.45,settings); }
  const snap = remote?.connected ? (remoteSnapshot || {players:[],food:[],viruses:[],worldSize:WORLD_SIZE}) : arena.snapshot;
  const focusId=selectedId(snap);
  renderer.draw(snap, focusId, settings, playing, dt, spectating);
  if(now-hudAt>280){ hudAt=now; updateHUD(snap); if(playing && snap.players?.length){const ids=remote?.connected?remote.myIds:arena.myIds;if(ids.length && ids.every(id=>id && !snap.players.find(p=>p.id===id)?.cells?.length)){gameover();}} }
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
      {key:'autoSplit',label:'Auto split at 25,500 mass',type:'toggle'},
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
      {key:'mouseSensitivity',label:'Mouse movement speed',type:'range',min:.5,max:1.8,step:.1},
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
      {key:'backgroundUrl',label:'Background image URL',type:'url'},
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
  for(const item of S[settingsTab][settingsPage]) renderSettingRow(area,item);
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
    const field=document.createElement('input'); field.type='url'; field.value=settings[item.key]; field.placeholder='https://...'; field.onchange=()=>{ settings[item.key]=field.value.trim(); saveSettings(); }; box.append(field);
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
  if(k===settings.keyMenu){ enterLobby(); e.preventDefault(); return; }
  if(k===settings.keySettings){ showSettings(); e.preventDefault(); return; }
  if((!playing && !spectating) || isEditing()) return;
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

$('chat-form').onsubmit=e=>{ e.preventDefault(); sendMessage($('chat-input').value); $('chat-input').value=''; $('chat-input').blur(); };
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
updateMode('ffa');
setCameraControlsVisible();
requestAnimationFrame(gameLoop);
