'use strict';
const {randomUUID}=require('node:crypto');
const DEFAULT_ICE=[{urls:'stun:stun.l.google.com:19302'}];
function iceServersFromEnv(value){
  if(!value)return DEFAULT_ICE;
  let servers;try{servers=JSON.parse(value);}catch{throw Error('VOICE_ICE_SERVERS_JSON must be a JSON array');}
  if(!Array.isArray(servers)||servers.length>8)throw Error('VOICE_ICE_SERVERS_JSON supports up to 8 ICE servers');
  return servers.map(server=>{
    const urls=typeof server?.urls==='string'?[server.urls]:server?.urls;
    if(!Array.isArray(urls)||!urls.length||urls.length>4||urls.some(url=>typeof url!=='string'||url.length>500||!/^(stun|stuns|turn|turns):[^\s]+$/i.test(url)))throw Error('Invalid voice ICE server URL');
    const clean={urls:[...urls]};
    for(const key of ['username','credential'])if(typeof server[key]==='string')clean[key]=server[key].slice(0,500);
    return clean;
  });
}
function cleanSignal(signal){
  if(!signal||typeof signal!=='object')return null;
  const description=signal.description;
  if(description&&['offer','answer'].includes(description.type)&&typeof description.sdp==='string'&&description.sdp.length<=12000&&/^m=audio /m.test(description.sdp)&&!/^m=(video|application) /m.test(description.sdp))return{description:{type:description.type,sdp:description.sdp}};
  if(Object.hasOwn(signal,'candidate')){
    if(signal.candidate===null)return{candidate:null};
    const c=signal.candidate;
    if(!c||typeof c.candidate!=='string'||c.candidate.length>1800)return null;
    if(c.sdpMid!=null&&(typeof c.sdpMid!=='string'||c.sdpMid.length>64))return null;
    if(c.sdpMLineIndex!=null&&(!Number.isInteger(c.sdpMLineIndex)||c.sdpMLineIndex<0||c.sdpMLineIndex>16))return null;
    return{candidate:{candidate:c.candidate,sdpMid:c.sdpMid??null,sdpMLineIndex:c.sdpMLineIndex??null,...(typeof c.usernameFragment==='string'?{usernameFragment:c.usernameFragment.slice(0,256)}:{})}};
  }
  return null;
}
/** The game server relays audio-only WebRTC signaling, never audio or the private tag. */
function createVoiceHub({send,iceServers=DEFAULT_ICE,limit=12,now=Date.now}={}){
  const members=new Map(),sockets=new Map(),rates=new WeakMap();
  const same=(a,b)=>a.room===b.room&&a.tag===b.tag;
  const publicPeer=m=>({id:m.id,name:m.name,muted:m.muted,talking:m.talking});
  const peers=m=>[...members.values()].filter(other=>other!==m&&same(m,other));
  const error=(ws,code,message)=>send(ws,{type:'voice_error',code,message});
  const leave=ws=>{const m=sockets.get(ws);if(!m)return;sockets.delete(ws);members.delete(m.id);for(const other of peers(m))send(other.ws,{type:'voice_peer_left',id:m.id});send(ws,{type:'voice_left'});};
  const allowed=ws=>{const time=now(),r=rates.get(ws)||{tokens:180,at:time};r.tokens=Math.min(180,r.tokens+(time-r.at)*.06);r.at=time;rates.set(ws,r);if(r.tokens<1)return false;r.tokens--;return true;};
  function handle(ws,current,msg){
    if(!String(msg.type||'').startsWith('voice_'))return false;
    if(!allowed(ws))return true;
    if(msg.type==='voice_leave'){leave(ws);return true;}
    if(!current?.player||!current.room||current.player.npc||!current.player.tag){error(ws,'tag_required','Join a live game with a team tag to use voice');return true;}
    const {room,player}=current;
    if(!room.players.has(player.id)){leave(ws);error(ws,'session_ended','Your game session has ended');return true;}
    if(msg.type==='voice_join'){
      const existing=sockets.get(ws);
      if(existing){send(ws,{type:'voice_welcome',id:existing.id,peers:peers(existing).map(publicPeer),iceServers,limit});return true;}
      const group=[...members.values()].filter(m=>m.room===room&&m.tag===player.tag);
      if(group.length>=limit){error(ws,'room_full','This tag voice room is full');return true;}
      if(player.multiKey&&[...members.values()].some(m=>m.room===room&&m.multiKey===player.multiKey)){error(ws,'duplicate_connection','Voice is already active on your other controlled connection');return true;}
      const member={id:randomUUID(),ws,room,tag:player.tag,playerId:player.id,multiKey:player.multiKey,name:player.name,muted:true,talking:false};
      sockets.set(ws,member);members.set(member.id,member);
      send(ws,{type:'voice_welcome',id:member.id,peers:peers(member).map(publicPeer),iceServers,limit});
      for(const other of peers(member))send(other.ws,{type:'voice_peer_joined',peer:publicPeer(member)});
      return true;
    }
    const member=sockets.get(ws);
    if(!member||member.playerId!==player.id||member.room!==room||member.tag!==player.tag){leave(ws);return true;}
    if(msg.type==='voice_state'){
      if(typeof msg.muted!=='boolean'||typeof msg.talking!=='boolean')return true;
      const talking=!msg.muted&&msg.talking;if(member.muted===msg.muted&&member.talking===talking)return true;
      member.muted=msg.muted;member.talking=talking;
      for(const other of peers(member))send(other.ws,{type:'voice_peer_state',peer:publicPeer(member)});
    }else if(msg.type==='voice_signal'){
      const target=typeof msg.to==='string'?members.get(msg.to):null,signal=cleanSignal(msg.signal);
      if(target&&target!==member&&same(member,target)&&signal)send(target.ws,{type:'voice_signal',from:member.id,signal});
    }
    return true;
  }
  return{handle,leave,clear(){for(const ws of [...sockets.keys()])leave(ws);},get size(){return members.size;}};
}
module.exports={createVoiceHub,iceServersFromEnv,cleanSignal};
