'use strict';
/** Deploy as an always-on Node server, NEVER as a Vercel serverless function. */
const http=require('node:http');
const {WebSocketServer,WebSocket}=require('ws');
const core=require('./core.cjs');
const {RestartCycle}=require('./restart.cjs');
const auth=require('./auth.cjs').createAuth();
const fs=require('node:fs'),pathModule=require('node:path');
const publicRoot=pathModule.resolve(__dirname,'../public');
const registry=core.loadRegistry();
const rooms=Object.fromEntries(registry.servers.map(cfg=>[cfg.id,core.createRoom(cfg)]));
// Legacy clients send {mode:'ffa'|'dual'|'mega'}; map them to the default server of that mode.
const LEGACY={ffa:'vintage-ffa',dual:'senpa-dual',mega:'senpa-mega'};
const resolveRoom=msg=>Object.hasOwn(rooms,msg.serverId)?msg.serverId:(Object.hasOwn(LEGACY,msg.mode)?LEGACY[msg.mode]:null);
const publicInfo=()=>registry.servers.map(cfg=>{const room=rooms[cfg.id];return{id:cfg.id,name:cfg.name,category:cfg.category,mode:cfg.engineMode,physics:cfg.physics,region:cfg.region,maxPlayers:cfg.maxPlayers,botFree:cfg.bots===0,macro:!!cfg.macro,competitive:!!cfg.competitive,players:[...room.players.values()].filter(p=>!p.npc).length,bots:cfg.bots,spectators:spectators[cfg.id].size,status:room.crashed?'error':'online'};});
const host='0.0.0.0',port=Number(process.env.PORT||3001);
const clients=new Map();
const restartCycle=new RestartCycle();
const spectators=Object.fromEntries(Object.keys(rooms).map(id=>[id,new Set()]));
const server=http.createServer(async (req,res)=>{
  try{if(await auth(req,res))return;}catch{res.writeHead(500);res.end('Request failed');return;}
  const path=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).pathname;
  if(path==='/health'||path==='/servers'){res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});const info=publicInfo();res.end(JSON.stringify(path==='/servers'?{categories:registry.categories,servers:info}:{status:'ok',uptime:Math.round(process.uptime()),memoryMB:Math.round(process.memoryUsage().rss/1048576),rooms:Object.fromEntries(info.map(r=>[r.id,{players:r.players,bots:r.bots,spectators:r.spectators,status:r.status}]))}));return;}
  const file=pathModule.resolve(publicRoot,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(publicRoot+pathModule.sep)){res.writeHead(403);res.end();return;}
  const ext=pathModule.extname(file),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
  if(!types[ext]||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[ext],'X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);

});
const allowedOrigins=String(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
const maxPerIp=Number(process.env.MAX_CONN_PER_IP||8),trustProxy=process.env.TRUST_PROXY==='1';
const ipCounts=new Map();
const clientIp=req=>trustProxy&&req?.headers?.['x-forwarded-for']?String(req.headers['x-forwarded-for']).split(',')[0].trim():(req?.socket?.remoteAddress||'unknown');
/** ALLOWED_ORIGINS (comma list) restricts which websites may connect; MAX_CONN_PER_IP caps sockets per address. */
const wss=new WebSocketServer({server,maxPayload:4096,perMessageDeflate:false,verifyClient:({origin,req})=>{
  if(allowedOrigins.length&&!allowedOrigins.includes(origin))return false;
  return (ipCounts.get(clientIp(req))||0)<maxPerIp;
}});
function reply(ws,data){if(ws.readyState===WebSocket.OPEN){try{ws.send(JSON.stringify(data));}catch{}}}
wss.on('connection',(ws,req)=>{reply(ws,restartCycle.schedule());const ip=clientIp(req);ipCounts.set(ip,(ipCounts.get(ip)||0)+1);let current=null,watching=null;
  const detach=()=>{if(current){current.room.players.delete(current.player.id);clients.delete(current.player.id);current=null;}if(watching){spectators[watching.id].delete(ws);watching=null;}};
  ws.on('message',data=>{let msg;try{msg=JSON.parse(data.toString());}catch{return;}if(!msg||typeof msg!=='object')return;
    if(msg.type==='spectate'){
      const rid=resolveRoom(msg);if(!rid){reply(ws,{type:'error',message:'Unknown server'});return;}
      detach();watching=rooms[rid];spectators[rid].add(ws);reply(ws,{type:'spectator_welcome',mode:watching.mode,serverId:rid});reply(ws,core.snapshot(watching));return;
    }
    if(msg.type==='join'){
      const rid=resolveRoom(msg);
      if(current && rid && current.room.id===rid){reply(ws,{type:'welcome',mode:current.room.mode,serverId:rid,playerId:current.player.id});return;}
      detach();
      if(!rid){reply(ws,{type:'error',message:'Unknown server'});return;}
      const room=rooms[rid];
      if(room.crashed){reply(ws,{type:'error',message:'Server temporarily unavailable'});return;}
      if(room.config&&[...room.players.values()].filter(p=>!p.npc).length>=room.config.maxPlayers){reply(ws,{type:'error',message:'Server full'});return;}const tag=core.cleanTag(msg.tag),name=core.cleanText(msg.name,18)||'Vintage Player';const player=core.join(room,name,tag,0);
      current={room,player};clients.set(player.id,ws);reply(ws,{type:'welcome',mode:room.mode,serverId:room.id,playerId:player.id,initialMass:room.initialMass,autoSplitMass:core.AUTO_SPLIT_MASS});return;
    }
    if(msg.type==='ping'){reply(ws,{type:'pong',nonce:msg.nonce});return;}
    if(!current)return;
    const {room,player}=current;
    if(msg.type==='move'){core.point(room,player,Number(msg.x),Number(msg.y));return;}
    if(msg.type==='respawn'){
      const x=Number(msg.x),y=Number(msg.y);
      if(core.respawn(room,player,x,y))reply(ws,{type:'respawned',playerId:player.id});
      return;
    }
    if(msg.type==='split'){core.trySplit(room,player);return;}
    if(msg.type==='feed'){
      if(room.time-(player.lastFeedAt??-100)<(room.config?.feedInterval??.075))return;
      player.lastFeedAt=room.time;core.feed(room,player);return;
    }
    if(msg.type==='chat'){
      const now=Date.now();if(player.lastChat>now-350)return;
      player.lastChat=now;const text=core.cleanText(msg.text,180),channel=msg.channel==='tag'?'tag':'all';if(!text)return;
      if(channel==='tag'&&!player.tag){reply(ws,{type:'error',message:'Set a team tag to use private Tag chat'});return;}
      const packet={type:'chat',mode:room.mode,channel,playerId:player.id,name:player.name,tag:player.tag,text};
      for(const target of core.chatRecipients(room,player,channel))reply(clients.get(target.id),packet);return;
    }
  });
  ws.on('close',()=>{detach();const n=(ipCounts.get(ip)||1)-1;if(n>0)ipCounts.set(ip,n);else ipCounts.delete(ip);});
  ws.on('error',()=>{});
});
let last=Date.now();const tick=setInterval(()=>{const now=Date.now(),dt=Math.min(.1,(now-last)/1000);last=now;for(const room of Object.values(rooms)){if(room.crashed)continue;try{core.step(room,dt);}catch(err){room.crashed=true;console.error(JSON.stringify({level:'error',room:room.id,msg:'room crashed, isolated',err:String(err&&err.stack||err)}));}}},50);
const restartWorker=setInterval(()=>{
  for(const event of restartCycle.poll(Date.now())){
    if(event.kind==='warning'){
      for(const ws of wss.clients)reply(ws,{type:'server_notice',message:`Server will restart in ${event.minutes} minutes`,minutes:event.minutes});
    }else if(event.kind==='restart'){
      for(const ws of wss.clients){reply(ws,{type:'server_restarted',message:'Server restarted • Match reset'});}
      for(const name of Object.keys(rooms)){
        // Keep each room object so existing WebSocket handlers cannot act on a stale room reference.
        const replacement=core.createRoom(registry.servers.find(c=>c.id===name));
        Object.assign(rooms[name],replacement);
        spectators[name].clear();
      }
      clients.clear();
      for(const ws of wss.clients){try{ws.close(4001,'Scheduled arena restart');}catch{}}
    }
  }
},1000);
const updates=setInterval(()=>{for(const room of Object.values(rooms)){if(room.crashed)continue;const state=JSON.stringify(core.snapshot(room));for(const p of room.players.values()){if(p.npc)continue;const ws=clients.get(p.id);if(ws?.readyState===WebSocket.OPEN)try{ws.send(state);}catch{}}for(const ws of spectators[room.id]){if(ws.readyState===WebSocket.OPEN)try{ws.send(state);}catch{}}}},50);
server.listen(port,host,()=>console.log(`Vintage game server listening on http://${host}:${port}; servers: ${Object.keys(rooms).length}`));
function shutDown(){clearInterval(tick);clearInterval(updates);clearInterval(restartWorker);wss.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),3000).unref();}
process.on('SIGTERM',shutDown);process.on('SIGINT',shutDown);
