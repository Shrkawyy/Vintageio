'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const EventEmitter=require('node:events');
const core=require('../server/core.cjs');

function harness(env={}){
  const intervals=[];let wss;
  class FakeWSS extends EventEmitter{constructor(opts){super();wss=this;this.opts=opts;} close(){}}
  class FakeSocket extends EventEmitter{constructor(){super();this.readyState=1;this.messages=[];}send(p){this.messages.push(JSON.parse(p));}receive(m){this.emit('message',Buffer.from(JSON.stringify(m)));}}
  const http={createServer(){return {listen(_p,_h,cb){cb();},close(fn){fn?.();}};}};
  const source=fs.readFileSync(path.join(__dirname,'../server/index.js'),'utf8');
  vm.runInNewContext(source,{
    require(mod){if(mod==='ws')return {WebSocketServer:FakeWSS,WebSocket:{OPEN:1}};if(mod==='node:http')return http;if(mod==='./core.cjs')return core;if(mod==='./voice.cjs')return require('../server/voice.cjs');if(mod==='./restart.cjs')return require('../server/restart.cjs');if(mod==='./auth.cjs')return require('../server/auth.cjs');if(mod==='node:fs')return fs;if(mod==='node:path')return path;throw new Error(mod);},
    __dirname:path.resolve(__dirname,'../server'),
    process:{env:{PORT:'3328',...env},on(){}},setInterval(fn){intervals.push(fn);return intervals.length;},clearInterval(){},
    setTimeout(){return {unref(){}};},JSON,Date,URL,Number,String,console,Map,Set,Object,Buffer,
  },{filename:'server/index.js'});
  return {wss,FakeSocket};
}

test('split throttle: burst of 6 for macro splits, then refills over time',()=>{
  const r=core.createRoom('ffa'),p=core.join(r,'Big','A');p.cells[0].mass=65536;
  for(let i=0;i<6;i++)assert.notEqual(core.trySplit(r,p),null,'burst '+i);
  assert.equal(core.trySplit(r,p),null,'7th instant split is throttled');
  r.time+=0.5;
  assert.notEqual(core.trySplit(r,p),null,'refilled after 0.5s');
});
test('server origin allow-list rejects other websites, accepts the listed one',()=>{
  const h=harness({ALLOWED_ORIGINS:'https://game.example.com, https://b.example.com'});
  const verify=h.wss.opts.verifyClient;
  assert.equal(verify({origin:'https://game.example.com',req:{socket:{remoteAddress:'1.1.1.1'},headers:{}}}),true);
  assert.equal(verify({origin:'https://evil.example',req:{socket:{remoteAddress:'1.1.1.1'},headers:{}}}),false);
  assert.equal(verify({origin:undefined,req:{socket:{remoteAddress:'1.1.1.1'},headers:{}}}),false);
});
test('no ALLOWED_ORIGINS keeps the server open (backwards compatible)',()=>{
  const h=harness();
  assert.equal(h.wss.opts.verifyClient({origin:'https://anything.example',req:{socket:{remoteAddress:'2.2.2.2'},headers:{}}}),true);
});
test('per-IP connection cap blocks the 3rd socket, and frees slots on close',()=>{
  const h=harness({MAX_CONN_PER_IP:'2'});
  const req={socket:{remoteAddress:'9.9.9.9'},headers:{}};const socks=[];
  for(let i=0;i<2;i++){assert.equal(h.wss.opts.verifyClient({origin:'x',req}),true);const s=new h.FakeSocket();h.wss.emit('connection',s,req);socks.push(s);}
  assert.equal(h.wss.opts.verifyClient({origin:'x',req}),false);
  socks[0].emit('close');
  assert.equal(h.wss.opts.verifyClient({origin:'x',req}),true);
});
test('typing in a text field never fires hotkeys (S used to open Settings)',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../public/client.js'),'utf8');
  const guard=src.indexOf("['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||document.activeElement?.isContentEditable){ if(k==='ESCAPE')");
  assert.ok(guard>0,'input guard exists');
  assert.ok(guard<src.indexOf('if(k===settings.keySettings)'),'guard precedes settings hotkey');
  assert.ok(guard<src.indexOf('if(k===settings.keyMenu)'),'guard precedes menu hotkey');
});
test('default hotkeys do not collide on S',async()=>{
  const g=fs.readFileSync(path.join(__dirname,'../public/game.js'),'utf8');
  assert.ok(g.includes("keySettings:'NO KEY'"));assert.ok(g.includes("keyToggleSkin:'S'"));
});






