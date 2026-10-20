import {MODES, DEFAULT_SETTINGS, LocalArena, ArenaRenderer, AUTO_SPLIT_MASS, MAX_CELLS, WORLD_SIZE} from './game.js';

const $=id=>document.getElementById(id);
const SETTINGS_KEY='vintage-arena-settings-v1';
const valueSafe=(saved)=>{const next={...DEFAULT_SETTINGS};for(const [key,val] of Object.entries(saved||{})){if(key in next && typeof val===typeof next[key])next[key]=val;}return next;};
let settings=(()=>{try{return valueSafe(JSON.parse(localStorage.getItem(SETTINGS_KEY)));}catch{return {...DEFAULT_SETTINGS};}})();
let mode='ffa', playing=false, activeSlot=0, remote=null, hudVisible=true, chatChannel='all', currentGame=null, isSettingsOpen=false, frameTime=performance.now();
let nickname='Vintage Player',tag='';
let showDeaths=false;let remoteSnapshot=null;
const arena=new LocalArena();arena.reset('ffa',nickname,tag,true,settings);
const renderer=new ArenaRenderer($('arena'),$('minimap-canvas'));renderer.resize();
let pointer={x:innerWidth/2+100,y:innerHeight/2},rightDown=false;
const toName=(s,max=18)=>String(s||'').trim().slice(0,max).replace(/[<>\u0000-\u001f]/g,'')||'Vintage Player';
function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{} applySettings();}
function applySettings(){document.documentElement.style.setProperty('--accent',settings.accentColor);$('leaderboard').classList.toggle('hidden',!settings.showLeaderboard||!hudVisible);$('minimap').classList.toggle('hidden',!settings.showMinimap||!hudVisible);$('chat').classList.toggle('hidden',!settings.showChat||!hudVisible);$('help-panel').classList.toggle('hidden',!settings.showHelp||!hudVisible);}
function updateMode(next){if(!MODES[next])return;mode=next;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));$('top-mode').textContent=mode.toUpperCase()+' · EUROPE';$('mode-label').textContent=MODES[mode].title;$('multi-toggle').disabled=mode==='mega';$('multi-toggle').closest('label').style.opacity=mode==='mega'?.5:1;if(!playing)arena.reset(mode,nickname,tag,mode!=='mega'&&$('multi-toggle').checked,settings);}
function toast(msg){const d=document.createElement('div');d.className='toast';d.textContent=msg;$('toast-area').appendChild(d);setTimeout(()=>d.remove(),3200);}
function enterLobby(){playing=false;remote?.disconnect();remote=null;remoteSnapshot=null;$('lobby').classList.remove('hidden');$('gameover').classList.add('hidden');$('top-mode').textContent=mode.toUpperCase()+' · EUROPE';$('connection-status').innerHTML='<i></i> DEMO MODE';$('connection-status').classList.remove('online');$('chat-online').textContent='LOCAL';}
function beginGame(){nickname=toName($('nickname').value);tag=String($('team-tag').value||'').trim().slice(0,8).replace(/[<>\u0000-\u001f]/g,'');$('nickname').value=nickname;$('team-tag').value=tag;$('chat-tag-label').textContent=tag?('#'+tag.toUpperCase()):'NO TAG';
  activeSlot=0;remoteSnapshot=null;showDeaths=false;playing=true;$('lobby').classList.add('hidden');$('gameover').classList.add('hidden');clearChat();
  const multi=$('multi-toggle').checked&&mode!=='mega';arena.reset(mode,nickname,tag,multi,settings);
  remote?.disconnect();remote=null;
  const wsUrl=String(window.VINTAGE_CONFIG?.wsUrl||'').trim();
  if(wsUrl&&/^wss?:\/\//i.test(wsUrl)){
    remote=new RemoteArena(wsUrl,{mode,nickname,tag,multi});remote.connect();
    $('connection-status').innerHTML='<i></i> CONNECTING';$('chat-online').textContent='CONNECTING';
  }else{$('connection-status').innerHTML='<i></i> DEMO MODE';$('chat-online').textContent='LOCAL';addChat('system','You are playing against local AI. Configure /config.js for online multiplayer.','all');}
}
class RemoteArena{
  constructor(url,opts){this.url=url;this.opts=opts;this.sockets=[];this.myIds=[];this.latest=null;this.connected=false;this.lastMessageAt=0;}
  connect(){const total=this.opts.multi?2:1;for(let n=0;n<total;n++)this.open(n);}
  open(slot){let ws;try{ws=new WebSocket(this.url);}catch{toast('Invalid WebSocket server URL');return;}this.sockets[slot]=ws;
    ws.addEventListener('open',()=>{ws.send(JSON.stringify({type:'join',mode:this.opts.mode,name:slot?this.opts.nickname+' II':this.opts.nickname,tag:this.opts.tag}));});
    ws.addEventListener('message',e=>{let payload;try{payload=JSON.parse(e.data);}catch{return;}
      if(payload.type==='welcome'){this.myIds[slot]=payload.playerId;this.connected=true;$('connection-status').innerHTML='<i></i> ONLINE';$('connection-status').classList.add('online');$('chat-online').textContent='LIVE';if(slot===0)addChat('system','Connected to the '+MODES[mode].title+' room.','all');}
      if(payload.type==='state'&&slot===0){this.latest=payload;remoteSnapshot=payload;}
      if(payload.type==='chat'&&slot===0){addChat(payload.name,payload.text,payload.channel,payload.tag);}
      if(payload.type==='error'&&slot===0)toast(payload.message||'Server error');
    });
    ws.addEventListener('close',()=>{if(slot===0&&playing&&remote===this){this.connected=false;$('connection-status').innerHTML='<i></i> OFFLINE';$('connection-status').classList.remove('online');$('chat-online').textContent='OFFLINE';toast('Connection lost — returning to local demo');remote?.disconnect();remote=null;remoteSnapshot=null;arena.reset(mode,nickname,tag,this.opts.multi,settings);}});
    ws.addEventListener('error',()=>{if(slot===0)toast('WebSocket connection failed');});
  }
  send(slot,msg){const socket=this.sockets[slot];if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(msg));}
  sendChat(text,channel){this.send(0,{type:'chat',channel,text});}
  sendControl(slot,world){this.send(slot,{type:'move',x:world.x,y:world.y});}
  sendAction(slot,action){this.send(slot,{type:action});}
  disconnect(){for(const s of this.sockets){if(s&&[0,1].includes(s.readyState)){try{s.close(1000,'Switch arena');}catch{}}}this.connected=false;this.sockets=[];}
}
function clearChat(){$('chat-messages').replaceChildren();}
const chatHistory=[];
function addChat(name,message,channel='all',messageTag=''){const row={name:String(name).slice(0,25),text:String(message).slice(0,180),channel,tag:messageTag||''};chatHistory.push(row);if(chatHistory.length>100)chatHistory.shift();renderChat();}
function renderChat(){const list=$('chat-messages');list.replaceChildren();for(const line of chatHistory.slice(-40)){
  if(chatChannel==='tag'&&line.channel!=='tag'&&line.name!=='system')continue;
  if(chatChannel==='all'&&line.channel==='tag')continue;
  const p=document.createElement('div');p.className='msg';if(line.name==='system'){p.className+=' system';p.textContent=line.text;}else{const n=document.createElement('span');n.className='who';n.textContent=(line.tag?'['+line.tag+'] ':'')+line.name+': ';p.append(n,document.createTextNode(line.text));}list.appendChild(p);}
  list.scrollTop=list.scrollHeight;
}
function sendMessage(text){text=String(text).trim().slice(0,180);if(!text)return;
  if(chatChannel==='tag'&&!tag){toast('Enter a team tag to use Tag chat');return;}
  if(remote?.connected){remote.sendChat(text,chatChannel);}else{addChat(nickname,text,chatChannel,tag);} }
function activeId(){return remote?remote.myIds[Math.min(activeSlot,remote.myIds.length-1)]||remote.myIds[0]:arena.myIds[Math.min(activeSlot,arena.myIds.length-1)]||arena.myIds[0];}
function changeSlot(){const max=remote?remote.myIds.length:arena.myIds.length;if(max<2){toast('Enable multi in FFA or Dual to switch cells');return;}activeSlot=(activeSlot+1)%max;toast('Controlling '+(activeSlot===0?'Connect 1':'Connect 2'));}
function doAction(action){if(!playing||isSettingsOpen)return;const id=activeId();if(remote?.connected){remote.sendAction(activeSlot,action);}else{if(action==='split')arena.split(id,settings);if(action==='feed')arena.feed(id);}}
function gameover(){showDeaths=true;playing=false;$('gameover').classList.remove('hidden');$('death-score').textContent='Better luck next time. Return stronger.';if(settings.autoRespawn)setTimeout(()=>{if(showDeaths&&$('gameover').classList.contains('hidden')===false)beginGame();},1800);}
function updateHUD(snapshot){const me=snapshot?.players?.find(p=>p.id===activeId());const score=(me?.cells||[]).reduce((s,c)=>s+c.mass,0);$('mass-label').textContent=Math.floor(score).toLocaleString('en-US');$('cell-label').textContent=(me?.cells?.length||0)+' CELL'+((me?.cells?.length||0)===1?'':'S');$('mass-progress').style.width=Math.min(100,score/AUTO_SPLIT_MASS*100)+'%';$('fps-label').textContent=renderer.fps+' FPS';const rows=[...(snapshot?.players||[])].filter(p=>p.cells?.length).map(p=>({...p,total:p.cells.reduce((a,c)=>a+c.mass,0)})).sort((a,b)=>b.total-a.total).slice(0,8);$('player-count').textContent=(snapshot?.players?.filter(p=>p.cells?.length)?.length||0)+' PLAYERS';const container=$('board-entries');container.replaceChildren();for(let i=0;i<rows.length;i++){const p=rows[i],line=document.createElement('div');line.className='leader-entry'+(p.id===activeId()?' is-me':'');const place=document.createElement('span'),n=document.createElement('b'),m=document.createElement('em');place.textContent=String(i+1).padStart(2,'0');n.textContent=p.name;m.textContent=p.total>=1000?(p.total/1000).toFixed(1)+'k':Math.floor(p.total).toString();line.append(place,n,m);container.appendChild(line);}}
let controlAt=0,hudAt=0;function gameLoop(now){const dt=Math.min(.05,(now-frameTime)/1000||.016);frameTime=now;
  if(playing&&!isSettingsOpen){const world=renderer.toWorld(pointer.x,pointer.y);const slot=(rightDown&&settings.rightClickMove&&(remote?.myIds.length||arena.myIds.length)>1)?1:activeSlot;if(remote?.connected){if(now-controlAt>60){remote.sendControl(slot,world);controlAt=now;}}else{const id=arena.myIds[slot]||activeId();arena.setTarget(id,world.x,world.y);arena.tick(dt,settings);}}
  else if(!playing&&!showDeaths){arena.tick(dt*.45,settings);}
  const snap=remote?.connected?(remoteSnapshot||{players:[],food:[],viruses:[],worldSize:WORLD_SIZE}):arena.snapshot;
  renderer.draw(snap,activeId(),settings,playing,dt);
  if(now-hudAt>280){hudAt=now;updateHUD(snap);if(playing&&snap.players&&snap.players.length&&!(snap.players.find(p=>p.id===activeId())?.cells?.length)){gameover();}}
  requestAnimationFrame(gameLoop);
}
// Settings panel: every exposed setting is consumed by the UI, renderer or controls.
const D={
  game:{Render:[['showGrid','Background grid','toggle'],['showSectors','Sector labels','toggle'],['showBorders','Arena boundary','toggle'],['borderWidth','Border width','range',1,12,1]],
    Cells:[['showNames','Player names','toggle'],['showMass','Cell mass values','toggle'],['autoSplit','Auto split at 25,500 mass','toggle'],['cellOpacity','Cell opacity','range',30,100,5]],
    Elements:[['showFood','Show food','toggle'],['showViruses','Show viruses','toggle'],['foodSize','Food size','range',.5,2,.1]],
    Camera:[['zoom','Camera zoom','range',.5,1.6,.1],['cameraSmoothing','Camera smoothing','range',.02,.6,.02],['mouseSensitivity','Mouse movement speed','range',.5,1.8,.1]],
    Helpers:[['showLeaderboard','Leaderboard','toggle'],['showMinimap','Minimap','toggle'],['showChat','Arena chat','toggle'],['showHelp','Hotkey helper','toggle'],['autoRespawn','Automatic respawn after death','toggle']]},
  theme:{HUD:[['accentColor','Accent color','color'],['showHelp','Show help bar','toggle']],Cells:[['ownColor','Primary cell color','color'],['secondColor','Secondary cell color','color'],['nickSize','Nickname size','range',.6,1.8,.1],['massSize','Mass label size','range',.6,1.8,.1],['cellOpacity','Cell opacity','range',30,100,5]],Food:[['foodSize','Food size','range',.5,2,.1],['showFood','Show food','toggle']],Virus:[['showViruses','Show viruses','toggle']],ActiveCell:[['ownColor','Active color','color']],Border:[['gridColor','Grid / sector color','color'],['borderWidth','Border width','range',1,12,1]],Background:[['bgColor','Background color','color'],['showGrid','Background grid','toggle'],['showSectors','Sector labels','toggle'],['backgroundImage','Use background image','toggle'],['backgroundUrl','Background image URL','url']]},
  controls:{Keyboard:[['keyMenu','Toggle lobby','key'],['keySettings','Toggle settings','key'],['keyHUD','Toggle HUD','key'],['keyChat','Open chat','key'],['keyChatToggle','Toggle chat channel','key'],['keySplit','Split','key'],['keyFeed','Feed','key'],['keySwitch','Switch active multi','key']],Mouse:[['mouseSensitivity','Mouse sensitivity','range',.5,1.8,.1],['rightClickMove','Right-click movement','toggle']],Commands:[['chatCommands','Quick chat messages','commands']]},
  import:{'Import / Export':[]}
};
let settingsTab='game',settingsPage='Render';
function showSettings(){isSettingsOpen=true;$('settings-overlay').classList.remove('hidden');renderSettings();}
function hideSettings(){isSettingsOpen=false;$('settings-overlay').classList.add('hidden');}
function renderSettings(){if(!(settingsPage in D[settingsTab]))settingsPage=Object.keys(D[settingsTab])[0];document.querySelectorAll('#settings-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===settingsTab));const nav=$('settings-nav');nav.replaceChildren();for(const name of Object.keys(D[settingsTab])){const b=document.createElement('button');b.textContent=name;b.className=name===settingsPage?'active':'';b.onclick=()=>{settingsPage=name;renderSettings();};nav.appendChild(b);}const area=$('settings-content');area.replaceChildren();
  if(settingsTab==='import'){renderImport(area);return;}
  for(const [key,title,type,min,max,step] of D[settingsTab][settingsPage]){
    const row=document.createElement('div');row.className='setting-row';const lab=document.createElement('div');lab.className='setting-label';lab.textContent=title;const box=document.createElement('div');box.className='setting-control';let field;
    if(type==='toggle'){
      row.classList.add('is-toggle');
      const labelWrap=document.createElement('label');
      labelWrap.className='toggle-switch';
      field=document.createElement('input');field.type='checkbox';field.checked=!!settings[key];field.onchange=()=>{settings[key]=field.checked;saveSettings();};
      const slider=document.createElement('span');slider.className='toggle-slider';
      const status=document.createElement('span');status.className='toggle-status';status.textContent=field.checked?'ON':'OFF';
      field.addEventListener('change',()=>{status.textContent=field.checked?'ON':'OFF';});
      labelWrap.append(field,slider,status);box.append(labelWrap);row.append(lab,box);area.appendChild(row);continue;}
    else if(type==='range'){field=document.createElement('input');field.type='range';field.min=min;field.max=max;field.step=step;field.value=settings[key];const v=document.createElement('span');v.className='setting-value';v.textContent=settings[key];field.oninput=()=>{settings[key]=Number(field.value);v.textContent=field.value;saveSettings();};box.append(field,v);row.append(lab,box);area.appendChild(row);continue;}
    else if(type==='color'){field=document.createElement('input');field.type='color';field.value=settings[key];field.oninput=()=>{settings[key]=field.value;saveSettings();};}
    else if(type==='url'){field=document.createElement('input');field.type='url';field.value=settings[key];field.placeholder='https://...';field.onchange=()=>{settings[key]=field.value.trim();saveSettings();};}
    else if(type==='key'){field=document.createElement('input');field.type='text';field.className='keybind';field.readOnly=true;field.value=settings[key];field.title='Click, then press a key';field.onfocus=()=>{field.value='PRESS KEY...';};field.onkeydown=e=>{e.preventDefault();e.stopPropagation();const k=normalizeKey(e);settings[key]=k;field.value=k;field.blur();saveSettings();};field.onblur=()=>{field.value=settings[key]};}
    else if(type==='commands'){const grid=document.createElement('div');grid.className='command-list';settings.chatCommands.forEach((s,i)=>{const sub=document.createElement('div');sub.className='setting-row';const lbl=document.createElement('label');lbl.className='setting-label';lbl.textContent='Command '+(i+1);const input=document.createElement('input');input.type='text';input.value=s;input.maxLength=80;input.onchange=()=>{settings.chatCommands[i]=input.value;saveSettings()};const wr=document.createElement('div');wr.className='setting-control';wr.append(input);sub.append(lbl,wr);grid.append(sub)});area.append(grid);continue;}
    box.appendChild(field);row.append(lab,box);area.appendChild(row);
  }
}
function renderImport(area){const h=document.createElement('h3');h.textContent='Save your setup';const p=document.createElement('p');p.className='hint';p.textContent='Export your saved theme, controls and gameplay settings as JSON. Importing applies the selected values immediately. No account required.';const text=document.createElement('textarea');text.id='settings-json';text.placeholder='Paste an exported JSON file here, or click Export to display the current configuration.';
  const actions=document.createElement('div');actions.className='import-actions';
  const exp=document.createElement('button');exp.className='settings-action pink';exp.textContent='↓ EXPORT JSON';exp.onclick=()=>{const json=JSON.stringify(settings,null,2);text.value=json;const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='vintage-settings.json';a.click();URL.revokeObjectURL(url);toast('Settings exported');};
  const imp=document.createElement('button');imp.className='settings-action blue';imp.textContent='↑ IMPORT JSON';imp.onclick=()=>{try{const data=JSON.parse(text.value);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid format');settings=valueSafe(data);saveSettings();toast('Settings imported');renderSettings();}catch{toast('Invalid settings JSON');}};
  const reset=document.createElement('button');reset.className='settings-action red';reset.textContent='↺ RESET DEFAULTS';reset.onclick=()=>{if(confirm('Reset all Vintage settings to defaults?')){settings={...DEFAULT_SETTINGS,chatCommands:[...DEFAULT_SETTINGS.chatCommands]};saveSettings();renderSettings();toast('Defaults restored');}};
  actions.append(exp,imp,reset);
  const fileWrap=document.createElement('label');fileWrap.className='file-pick';fileWrap.textContent='Choose JSON file';
  const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.onchange=async()=>{const chosen=file.files?.[0];if(chosen){text.value=(await chosen.text()).slice(0,100000);fileWrap.dataset.filename=chosen.name;}};fileWrap.append(file);
  area.append(h,p,actions,fileWrap,text);
}
const normalizeKey=e=>e.code==='Space'?'SPACE':e.key==='Escape'?'ESCAPE':e.key==='Enter'?'ENTER':e.key.toUpperCase();
function isEditing(){return ['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)||isSettingsOpen;}
window.addEventListener('keydown',e=>{if(isSettingsOpen){if(e.key==='Escape'){hideSettings();e.preventDefault();}return;}
  const k=normalizeKey(e);if(document.activeElement===$('chat-input')){if(k==='ESCAPE'){document.activeElement.blur();e.preventDefault();}return;}
  if(k===settings.keyMenu){enterLobby();e.preventDefault();return;}if(k===settings.keySettings){showSettings();e.preventDefault();return;}
  if(!playing||isEditing())return;
  if(e.altKey&&/^[1-5]$/.test(e.key)){const t=settings.chatCommands[Number(e.key)-1];if(t)sendMessage(t);e.preventDefault();return;}
  if(k===settings.keyChat){$('chat-input').focus();e.preventDefault();return;}
  if(k===settings.keyChatToggle){chatChannel=chatChannel==='all'?'tag':'all';updateChatTabs();e.preventDefault();return;}
  if(k===settings.keyHUD){hudVisible=!hudVisible;applySettings();e.preventDefault();return;}
  if(k===settings.keySwitch){changeSlot();e.preventDefault();return;}
  if(k===settings.keySplit){doAction('split');e.preventDefault();return;}
  if(k===settings.keyFeed){doAction('feed');e.preventDefault();}
});
function updateChatTabs(){document.querySelectorAll('.chat-tab').forEach(b=>b.classList.toggle('active',b.dataset.channel===chatChannel));renderChat();}
$('chat-form').onsubmit=e=>{e.preventDefault();sendMessage($('chat-input').value);$('chat-input').value='';$('chat-input').blur();};
$('play-btn').onclick=beginGame;$('respawn-btn').onclick=beginGame;$('back-to-lobby').onclick=enterLobby;
$('menu-btn').onclick=enterLobby;$('settings-btn').onclick=showSettings;$('close-settings').onclick=hideSettings;$('settings-done').onclick=hideSettings;
$('settings-overlay').addEventListener('click',e=>{if(e.target===$('settings-overlay'))hideSettings();});
document.querySelectorAll('.mode-card').forEach(b=>b.onclick=()=>{if(playing)enterLobby();updateMode(b.dataset.mode);});
document.querySelectorAll('.chat-tab').forEach(b=>b.onclick=()=>{chatChannel=b.dataset.channel;updateChatTabs();});
document.querySelectorAll('#settings-tabs button').forEach(b=>b.onclick=()=>{settingsTab=b.dataset.tab;settingsPage=Object.keys(D[settingsTab])[0];renderSettings();});
$('multi-toggle').addEventListener('change',()=>{if(!playing)arena.reset(mode,nickname,tag,$('multi-toggle').checked,settings);});
window.addEventListener('pointermove',e=>{pointer={x:e.clientX,y:e.clientY};});
$('arena').addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('contextmenu',e=>{if(playing&&settings.rightClickMove)e.preventDefault();});
window.addEventListener('pointerdown',e=>{if(e.target===$('arena')&&e.button===2&&playing&&settings.rightClickMove){rightDown=true;e.preventDefault();}});
window.addEventListener('pointerup',e=>{if(e.button===2)rightDown=false;});
window.addEventListener('blur',()=>{rightDown=false;});
window.addEventListener('resize',()=>renderer.resize());
// Online mode is opt-in. By default Vercel serves a complete local game without a backend.
applySettings();updateMode('ffa');requestAnimationFrame(gameLoop);
