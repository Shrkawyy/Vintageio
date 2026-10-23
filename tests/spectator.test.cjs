'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const EventEmitter=require('node:events');
const core=require('../server/core.cjs');

// In-process WebSocket protocol test, without downloading dependencies.
function makeServerHarness(){
  const intervals=[];let wss,handleHttp;
  class FakeWSS extends EventEmitter{constructor(){super();wss=this;} close(){}}
  class FakeSocket extends EventEmitter{
    constructor(){super();this.readyState=1;this.messages=[];}
    send(packet){this.messages.push(JSON.parse(packet));}
    receive(payload){this.emit('message',Buffer.from(JSON.stringify(payload)));}
  }
  const http={createServer(fn){handleHttp=fn;return {listen(_port,_host,callback){callback();},close(fn){fn?.();}};}};
  const source=fs.readFileSync(path.join(__dirname,'../server/index.js'),'utf8');
  vm.runInNewContext(source,{
    require(mod){if(mod==='ws')return {WebSocketServer:FakeWSS,WebSocket:{OPEN:1}};if(mod==='node:http')return http;if(mod==='./core.cjs')return core;if(mod==='./voice.cjs')return require('../server/voice.cjs');if(mod==='./restart.cjs')return require('../server/restart.cjs');if(mod==='./auth.cjs')return require('../server/auth.cjs');if(mod==='node:fs')return fs;if(mod==='node:path')return path;throw new Error(mod);},
    __dirname:path.resolve(__dirname,'../server'),
    process:{env:{PORT:'3327'},on(){}},setInterval(fn){intervals.push(fn);return intervals.length;},clearInterval(){},
    setTimeout(){return {unref(){}};},JSON,Date,URL,Number,console,Map,Set,Object,Buffer,
  },{filename:'server/index.js'});
  return {FakeSocket,wss,intervals,httpRequest:handleHttp};
}
test('spectate uses an observer socket, without spawning an extra player',()=>{
  const h=makeServerHarness();const ws=new h.FakeSocket();h.wss.emit('connection',ws);
  ws.receive({type:'spectate',mode:'mega'});
  assert.equal(ws.messages[0].type,'server_schedule');
  assert.equal(ws.messages[1].type,'spectator_welcome');
  assert.equal(ws.messages[2].type,'state');
  assert.equal(ws.messages[2].players.filter(p=>!p.npc).length,0);
  assert.equal(ws.messages[2].players.filter(p=>p.npc).length,10);
  h.intervals[2]();
  assert.equal(ws.messages.at(-1).type,'state');
  ws.receive({type:'feed'});
  assert.equal(ws.messages.length,4,'observer cannot feed, move or split');
});
test('joining after spectating removes observer and creates one player',()=>{
  const h=makeServerHarness();const ws=new h.FakeSocket();h.wss.emit('connection',ws);
  ws.receive({type:'spectate',mode:'ffa'});
  ws.receive({type:'join',mode:'ffa',name:'Test player',tag:''});
  assert.equal(ws.messages.at(-1).type,'welcome');
  h.intervals[2]();
  const states=ws.messages.filter(m=>m.type==='state');
  assert.equal(states.at(-1).players.filter(p=>!p.npc).length,1);
  ws.emit('close');
});

test('public and private chat and spectator snapshots never distribute private join tags',()=>{
  const h=makeServerHarness(),sockets=Array.from({length:4},()=>new h.FakeSocket());
  for(const ws of sockets)h.wss.emit('connection',ws);
  const [a,b,outsider,observer]=sockets;
  a.receive({type:'join',mode:'ffa',name:'Alice',tag:'SECRET42'});
  b.receive({type:'join',mode:'ffa',name:'Bob',tag:'SECRET42'});
  outsider.receive({type:'join',mode:'ffa',name:'Charlie',tag:'OTHER789'});
  observer.receive({type:'spectate',mode:'ffa'});
  h.intervals[2]();
  a.receive({type:'chat',channel:'all',text:'Public hello'});
  const packet=outsider.messages.find(m=>m.type==='chat');
  assert.equal(packet.text,'Public hello');assert.ok(packet.teamId);assert.ok(!Object.hasOwn(packet,'tag'));
  b.receive({type:'chat',channel:'tag',text:'Private hello'});
  assert.ok(a.messages.some(m=>m.type==='chat'&&m.text==='Private hello'));
  assert.ok(!outsider.messages.some(m=>m.text==='Private hello'));
  assert.ok(!observer.messages.some(m=>m.text==='Private hello'));
  for(const ws of sockets){
    const wire=JSON.stringify(ws.messages);assert.ok(!wire.includes('SECRET42'));assert.ok(!wire.includes('OTHER789'));
    ws.emit('close');
  }
});






