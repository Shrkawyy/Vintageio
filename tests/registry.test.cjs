'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path');
const {WebSocket}=require('../server/node_modules/ws');
const core=require('../server/core.cjs'),physics=require('../server/physics.cjs');

test('registry: categories, unique ids, valid presets, competitive servers are bot/macro free',()=>{
  const reg=core.loadRegistry();
  const cats=new Set(reg.categories.map(c=>c.id));
  for(const c of ['ffa','dual','mega','macro','classic','competitive'])assert.ok(cats.has(c),c);
  assert.equal(new Set(reg.servers.map(s=>s.id)).size,reg.servers.length);
  assert.equal(reg.servers.filter(s=>s.category==='mega').length,5,'Mega Split is its own category');
  assert.ok(reg.servers.filter(s=>s.category==='dual').some(s=>s.id==='aster-domination'),'Domination lives inside Dual');
  for(const s of reg.servers){assert.ok(physics.PHYSICS_PRESETS[s.physics],s.id);if(s.competitive){assert.equal(s.bots,0);assert.ok(!s.macro);}}
});
test('registry loader rejects bad configs',()=>{
  const fs=require('node:fs'),os=require('node:os'),f=path.join(os.tmpdir(),'bad-servers.json');
  const base=JSON.parse(fs.readFileSync(path.join(__dirname,'../server/servers.config.json'),'utf8'));
  const bad=(mut)=>{const c=structuredClone(base);mut(c);fs.writeFileSync(f,JSON.stringify(c));return ()=>core.loadRegistry(f);};
  assert.throws(bad(c=>c.servers.push({...c.servers[0]})),/Duplicate/);
  assert.throws(bad(c=>c.servers[0].physics='nope'),/unknown physics/);
  assert.throws(bad(c=>c.servers[0].category='zzz'),/unknown category/);
  assert.throws(bad(c=>{const s=c.servers.find(x=>x.competitive);s.bots=5;}),/bot-free/);
});
test('rooms have independent physics, bots and mass',()=>{
  const reg=core.loadRegistry(),get=id=>core.createRoom(reg.servers.find(s=>s.id===id));
  const mega=get('senpa-mega'),comp=get('comp-ffa'),ffa=get('senpa-ffa');
  assert.equal(comp.players.size,0,'competitive room has zero bots');
  assert.equal(ffa.players.size,10);
  assert.equal(mega.initialMass,5000);assert.notEqual(physics.physicsFor(mega.physics),physics.physicsFor(ffa.physics));
});
test('live WebSocket: join by serverId, legacy mode join, spectate, macro feed rate, bot-free count, isolation',async()=>{
  const port=39000+Math.floor(Math.random()*500);
  const child=spawn(process.execPath,[path.join(__dirname,'../server/index.js')],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
  const get=p=>fetch(`http://127.0.0.1:${port}${p}`).then(r=>r.json());
  try{
    for(let i=0;i<40;i++){try{await get('/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
    const open=()=>new Promise((res,rej)=>{const ws=new WebSocket(`ws://127.0.0.1:${port}`);ws.msgs=[];ws.on('message',d=>ws.msgs.push(JSON.parse(d)));ws.on('open',()=>res(ws));ws.on('error',rej);});
    const wait=(ws,type)=>new Promise((res,rej)=>{const t=setTimeout(()=>rej(Error('timeout '+type)),3000);const iv=setInterval(()=>{const m=ws.msgs.find(x=>x.type===type);if(m){clearTimeout(t);clearInterval(iv);res(m);}},20);});
    const a=await open();a.send(JSON.stringify({type:'join',serverId:'senpa-mega',name:'A'}));
    const wa=await wait(a,'welcome');assert.equal(wa.serverId,'senpa-mega');assert.equal(wa.mode,'mega');assert.equal(wa.initialMass,5000);
    const b=await open();b.send(JSON.stringify({type:'join',serverId:'comp-ffa',name:'B'}));await wait(b,'welcome');
    const legacy=await open();legacy.send(JSON.stringify({type:'join',mode:'ffa',name:'L'}));assert.equal((await wait(legacy,'welcome')).serverId,'vintage-ffa');
    const bad=await open();bad.send(JSON.stringify({type:'join',serverId:'nope',name:'X'}));assert.equal((await wait(bad,'error')).message,'Unknown server');
    const sp=await open();sp.send(JSON.stringify({type:'spectate',serverId:'aster-mega'}));assert.equal((await wait(sp,'spectator_welcome')).serverId,'aster-mega');
    await new Promise(r=>setTimeout(r,300));
    const stateB=b.msgs.filter(m=>m.type==='state').pop();
    assert.equal(stateB.players.filter(p=>p.npc).length,0,'bot-free server snapshot contains no bots');
    const stateA=a.msgs.filter(m=>m.type==='state').pop();
    assert.equal(stateA.players.filter(p=>p.npc).length,10);
    assert.ok(!stateA.players.some(p=>p.name==='B'),'players in other servers are never visible');
    const h=await get('/health');
    assert.equal(h.rooms['senpa-mega'].players,1);assert.equal(h.rooms['comp-ffa'].players,1);assert.equal(h.rooms['aster-mega'].spectators,1);assert.equal(h.rooms['og-vanilla'].players,0);
    const srv=await get('/servers');assert.equal(srv.servers.length,17);assert.ok(srv.servers.every(s=>s.status==='online'));
    // Feed throttling: macro server accepts ~3x more feeds than a normal server over the same window.
    const feeds=async(id)=>{const w=await open();w.send(JSON.stringify({type:'join',serverId:id,name:'F'}));await wait(w,'welcome');w.send(JSON.stringify({type:'move',x:2400,y:2400}));
      const before=(await get('/health')); const t0=Date.now();while(Date.now()-t0<1000){w.send(JSON.stringify({type:'feed'}));await new Promise(r=>setTimeout(r,5));}
      await new Promise(r=>setTimeout(r,150));const st=w.msgs.filter(m=>m.type==='state').pop();w.close();return st.food.filter(f=>f.ejected).length;};
    const normal=await feeds('senpa-ffa'),macro=await feeds('vintage-macro');
    assert.ok(macro>normal*1.5,`macro ejected ${macro} vs normal ${normal}`);
    for(const w of [a,b,legacy,bad,sp])w.close();
  }finally{child.kill();}
});
