'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../server/core.cjs'),physics=require('../server/physics.cjs'),virus=require('../server/virus.cjs');
const {createAuth}=require('../server/auth.cjs');
test('Mega has its own launch while FFA and Dual retain their calibrations',()=>{
  const run=key=>{const p={target:{x:4400,y:2400},cells:[{x:2400,y:2400,mass:2000}]};physics.splitCells(p,0,4800,64,key);for(let i=1;i<=60;i++)physics.moveCells(p,1/30,i/30,4800,key);return p.cells.map(c=>Math.round(c.x)).join(',');};
  assert.notEqual(run('ffa'),run('dual'),'FFA has its own video calibration');
  assert.notEqual(run('mega'),run('ffa'),'Mega has a stronger launch for large cells');
  for(const id of Object.keys(physics.PHYSICS_PRESETS))assert.ok(physics.physicsFor(id).baseSpeed>0,id);
  assert.equal(physics.physicsFor('nonexistent'),physics.FFA_PHYSICS);
});
test('auto split splits only oversized cells',()=>{const r=core.createRoom('ffa'),p=core.join(r,'Test','');p.cells=[{x:2400,y:2400,mass:30000},{x:1000,y:1000,mass:200}];r.players=new Map([[p.id,p]]);r.food=[];r.viruses=[];core.step(r,.01);assert.equal(p.cells.length,3);assert.ok(p.cells.some(c=>Math.abs(c.mass-200*Math.exp(-.006*.01))<1e-6));});
test('one consumed virus schedules exactly one replacement; cap permits consumption',()=>{
 const viruses=[virus.makeVirus(2000,2000)],p={cells:Array.from({length:64},(_,i)=>({x:i?4000:2000,y:i?4000:2000,mass:i?80:1000}))};let job;
 virus.stepViruses({viruses,food:[],players:[p],width:4800,maxCells:64,time:1,dt:0,addRespawn:(time,count)=>job={time,count}});
 assert.equal(viruses.length,0);assert.equal(p.cells.length,64);assert.equal(p.cells[0].mass,1100);assert.deepEqual(job,{time:21,count:1});
});
test('pending virus replacements cannot exceed cap',()=>{const r=core.createRoom('ffa');r.players.clear();r.viruses=Array.from({length:31},()=>virus.makeVirus(300,300));r.virusRespawns=[{time:0,count:8}];core.step(r,.01);assert.equal(r.viruses.length,32);});
function response(){return{headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(code,h){this.status=code;Object.assign(this.headers,h)},end(body){this.body=body;}}}
const env={PUBLIC_ORIGIN:'https://api.example.com',FRONTEND_ORIGIN:'https://game.example.com',SESSION_SECRET:'x'.repeat(40),DISCORD_CLIENT_ID:'id',DISCORD_CLIENT_SECRET:'secret'};
test('OAuth verifies state and browser cookie, exchanges code server-side and signs session',async()=>{
 const calls=[];const auth=createAuth(env,async(url,opts)=>{calls.push({url,opts});return{ok:true,json:async()=>url.includes('token')?{access_token:'private-token'}:{id:'42',username:'Tester'}}});
 const start=response();await auth({url:'/auth/discord',method:'GET',headers:{}},start);assert.equal(start.status,302);
 const state=new URL(start.headers.Location).searchParams.get('state');
 const invalid=response();await auth({url:'/auth/discord/callback?code=abc&state='+state,method:'GET',headers:{}},invalid);assert.equal(invalid.status,400);assert.equal(calls.length,0);
 const done=response();await auth({url:'/auth/discord/callback?code=abc&state='+state,method:'GET',headers:{cookie:'vintage_oauth='+state}},done);assert.equal(done.status,200);assert.equal(calls.length,2);assert.ok(!done.body.includes('private-token'));
 const cookie=done.headers['Set-Cookie'][1].split(';')[0];assert.match(done.headers['Set-Cookie'][1],/HttpOnly; SameSite=Lax/);
 const me=response();await auth({url:'/auth/me',method:'GET',headers:{cookie}},me);assert.equal(JSON.parse(me.body).user.name,'Tester');
 const replay=response();await auth({url:'/auth/discord/callback?code=abc&state='+state,method:'GET',headers:{cookie:'vintage_oauth='+state}},replay);assert.equal(replay.status,400);
 const forged=response();await auth({url:'/auth/me',method:'GET',headers:{cookie:cookie+'bad'}},forged);assert.equal(JSON.parse(forged.body).user,null);
});
test('unconfigured OAuth providers are reported honestly',async()=>{const auth=createAuth({});const r=response();await auth({url:'/auth/providers',headers:{}},r);assert.deepEqual(JSON.parse(r.body),{discord:false,facebook:false});});






