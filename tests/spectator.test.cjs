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
    require(mod){if(mod==='ws')return {WebSocketServer:FakeWSS,WebSocket:{OPEN:1}};if(mod==='node:http')return http;if(mod==='./core.cjs')return core;if(mod==='./restart.cjs')return require('../server/restart.cjs');if(mod==='./auth.cjs')return require('../server/auth.cjs');if(mod==='node:fs')return fs;if(mod==='node:path')return path;throw new Error(mod);},
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
