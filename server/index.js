'use strict';
/** Deploy as an always-on Node server, NEVER as a Vercel serverless function. */
const http=require('node:http');
const {WebSocketServer,WebSocket}=require('ws');
const core=require('./core.cjs');
const rooms=Object.fromEntries(Object.keys(core.MODES).map(m=>[m,core.createRoom(m)]));
const host='0.0.0.0',port=Number(process.env.PORT||3001);
const clients=new Map();
const spectators=Object.fromEntries(Object.keys(rooms).map(mode=>[mode,new Set()]));
const server=http.createServer((req,res)=>{const path=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).pathname;
  if(path==='/health'){res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify({status:'ok',rooms:Object.fromEntries(Object.entries(rooms).map(([key,room])=>[key,{players:[...room.players.values()].filter(p=>!p.npc).length,bots:core.MODES[key].bots,spectators:spectators[key].size}]))}));return;}
  res.writeHead(200,{'Content-Type':'text/plain'});res.end('Vintage game WebSocket server. Health: /health\n');
});
const wss=new WebSocketServer({server,maxPayload:4096,perMessageDeflate:false});
function reply(ws,data){if(ws.readyState===WebSocket.OPEN){try{ws.send(JSON.stringify(data));}catch{}}}
wss.on('connection',(ws)=>{let current=null,watching=null;
  const detach=()=>{if(current){current.room.players.delete(current.player.id);clients.delete(current.player.id);current=null;}if(watching){spectators[watching.mode].delete(ws);watching=null;}};
  ws.on('message',data=>{let msg;try{msg=JSON.parse(data.toString());}catch{return;}if(!msg||typeof msg!=='object')return;
    if(msg.type==='spectate'){
      if(!Object.hasOwn(rooms,msg.mode)){reply(ws,{type:'error',message:'Unknown game mode'});return;}
      detach();watching=rooms[msg.mode];spectators[msg.mode].add(ws);reply(ws,{type:'spectator_welcome',mode:msg.mode});reply(ws,core.snapshot(watching));return;
    }
    if(msg.type==='join'){
      detach();
      if(!Object.hasOwn(rooms,msg.mode)){reply(ws,{type:'error',message:'Unknown game mode'});return;}
      const room=rooms[msg.mode];const tag=core.cleanTag(msg.tag),name=core.cleanText(msg.name,18)||'Vintage Player';const player=core.join(room,name,tag,0);
      current={room,player};clients.set(player.id,ws);reply(ws,{type:'welcome',mode:msg.mode,playerId:player.id,initialMass:core.MODES[msg.mode].initialMass,autoSplitMass:core.AUTO_SPLIT_MASS});return;
    }
    if(!current)return;
    const {room,player}=current;
    if(msg.type==='move'){core.point(room,player,Number(msg.x),Number(msg.y));return;}
    if(msg.type==='split'){core.split(room,player);return;}
    if(msg.type==='feed'){core.feed(room,player);return;}
    if(msg.type==='chat'){
      const now=Date.now();if(player.lastChat>now-350)return;
      player.lastChat=now;const text=core.cleanText(msg.text,180),channel=msg.channel==='tag'?'tag':'all';if(!text)return;
      if(channel==='tag'&&!player.tag){reply(ws,{type:'error',message:'Set a team tag to use private Tag chat'});return;}
      const packet={type:'chat',mode:room.mode,channel,playerId:player.id,name:player.name,tag:player.tag,text};
      for(const target of core.chatRecipients(room,player,channel))reply(clients.get(target.id),packet);return;
    }
  });
  ws.on('close',detach);
  ws.on('error',()=>{});
});
let last=Date.now();const tick=setInterval(()=>{const now=Date.now(),dt=Math.min(.1,(now-last)/1000);last=now;for(const room of Object.values(rooms))core.step(room,dt);},50);
const updates=setInterval(()=>{for(const room of Object.values(rooms)){const state=JSON.stringify(core.snapshot(room));for(const p of room.players.values()){if(p.npc)continue;const ws=clients.get(p.id);if(ws?.readyState===WebSocket.OPEN)try{ws.send(state);}catch{}}for(const ws of spectators[room.mode]){if(ws.readyState===WebSocket.OPEN)try{ws.send(state);}catch{}}}},100);
server.listen(port,host,()=>console.log(`Vintage game server listening on http://${host}:${port}; modes: ${Object.keys(rooms).join(', ')}`));
function shutDown(){clearInterval(tick);clearInterval(updates);wss.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),3000).unref();}
process.on('SIGTERM',shutDown);process.on('SIGINT',shutDown);
