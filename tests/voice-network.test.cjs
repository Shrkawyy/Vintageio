'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path');
const {WebSocket}=require('../server/node_modules/ws');
test('live voice signaling isolates tags/servers, excludes spectators, deduplicates multi and detaches on game switch',async()=>{
 const port=40200+Math.floor(Math.random()*600),child=spawn(process.execPath,[path.join(__dirname,'../server/index.js')],{env:{...process.env,PORT:String(port),MAX_CONN_PER_IP:'32',VOICE_ICE_SERVERS_JSON:'[]'},stdio:'ignore'}),sockets=[];
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(ws,type)=>{for(let i=0;i<150;i++){const item=ws.messages.findLast(m=>m.type===type);if(item)return item;await sleep(20);}throw Error('Timeout '+type);};
 const open=()=>new Promise((resolve,reject)=>{const ws=new WebSocket('ws://127.0.0.1:'+port);ws.messages=[];sockets.push(ws);ws.on('message',d=>{const m=JSON.parse(d);if(m.type!=='state')ws.messages.push(m);});ws.on('open',()=>resolve(ws));ws.on('error',reject);});
 const send=(ws,msg)=>ws.send(JSON.stringify(msg));
 const join=async(tag,serverId='comp-ffa',multiKey)=>{const ws=await open();send(ws,{type:'join',serverId,name:'Guest',tag,multiKey});await wait(ws,'welcome');return ws;};
 try{
  for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:'+port+'/health')).ok)break;}catch{}await sleep(50);}
  const a=await join('secret','comp-ffa','a'.repeat(32)),b=await join('SECRET'),other=await join('OTHER'),another=await join('SECRET','comp-mega'),second=await join('secret','comp-ffa','a'.repeat(32)),untagged=await join('');
  for(const ws of [a,b,other,another])send(ws,{type:'voice_join'});
  const wa=await wait(a,'voice_welcome'),wb=await wait(b,'voice_welcome'),wo=await wait(other,'voice_welcome'),wr=await wait(another,'voice_welcome');
  assert.equal(wb.peers.length,1);assert.equal(wb.peers[0].id,wa.id);assert.equal(wo.peers.length,0);assert.equal(wr.peers.length,0);assert.deepEqual(wa.iceServers,[]);
  send(second,{type:'voice_join'});assert.equal((await wait(second,'voice_error')).code,'duplicate_connection');
  send(untagged,{type:'voice_join'});assert.equal((await wait(untagged,'voice_error')).code,'tag_required');
  const watcher=await open();send(watcher,{type:'spectate',serverId:'comp-ffa'});await wait(watcher,'spectator_welcome');send(watcher,{type:'voice_join'});assert.equal((await wait(watcher,'voice_error')).code,'tag_required');
  const signal={description:{type:'offer',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'}};
  send(a,{type:'voice_signal',to:wb.id,signal});assert.equal((await wait(b,'voice_signal')).from,wa.id);
  send(a,{type:'voice_signal',to:wo.id,signal});send(a,{type:'voice_signal',to:wr.id,signal});await sleep(100);assert.ok(!other.messages.some(m=>m.type==='voice_signal'));assert.ok(!another.messages.some(m=>m.type==='voice_signal'));
  assert.ok(!JSON.stringify(wa).includes('secret'));assert.ok(!JSON.stringify(wb).includes('SECRET'));assert.ok(!JSON.stringify(wb).includes('a'.repeat(32)));
  send(a,{type:'join',serverId:'comp-mega',name:'Guest',tag:'OTHER'});assert.equal((await wait(b,'voice_peer_left')).id,wa.id);await sleep(100);
  a.messages.length=0;send(a,{type:'voice_join'});const next=await wait(a,'voice_welcome');assert.notEqual(next.id,wa.id);assert.equal(next.peers.length,0);
 }finally{for(const ws of sockets)ws.terminate();child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve);});}
});
