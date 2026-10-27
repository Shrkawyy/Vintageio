'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/replays.js'), 'utf8');
const modulePromise = import('data:text/javascript;charset=utf-8,' + encodeURIComponent(source));
const snapshot = () => ({mode:'ffa', worldSize:7200, vision:[{left:0,top:0,right:7200,bottom:7200}],
  players:[{id:'self',name:'Tester',skinUrl:'/assets/skins/jax/featured-01.png',shieldId:'shield7',flagId:'1f1ea-1f1ec',multiKey:'private-key',target:{x:20,y:30},cells:[{x:200,y:300,mass:1000,vx:10}]}],
  food:[{x:30,y:40,mass:1,color:'#ffffff'}],viruses:[{id:1,x:500,y:500,mass:200,feedMass:100}]});
const view = () => ({camera:{x:200,y:300},width:1280,height:720,zoom:1,focusId:'self',ownedIds:['self']});

test('replay captures immutable visible state without private input or session keys', async () => {
  const {ReplayBuffer} = await modulePromise, buffer = new ReplayBuffer();
  const state = snapshot(), camera = view();
  buffer.capture(0,state,camera);state.players[0].cells[0].x = 400;camera.camera.x = 400;
  buffer.capture(1000,state,camera);
  const settings = {bgColor:'#000000'}, clip = buffer.clip(settings);
  settings.bgColor = '#ffffff';state.players[0].cells[0].x = 900;
  assert.equal(clip.frames[0].state.players[0].cells[0].x,200);
  assert.equal(clip.frames[0].camera.x,200);
  assert.equal(clip.frames[1].state.players[0].cells[0].x,400);
  assert.equal(clip.settings.bgColor,'#000000');
  assert.equal(clip.frames[0].state.players[0].multiKey,undefined);
  assert.equal(clip.frames[0].state.players[0].target,undefined);
  assert.equal(clip.frames[0].state.viruses[0].feedMass,100);
  assert.equal(clip.frames[0].state.players[0].shieldId,'shield7');
  assert.equal(clip.frames[0].state.players[0].flagId,'1f1ea-1f1ec');
  assert.equal(clip.frames[0].state.players[0].skinUrl,'/assets/skins/jax/featured-01.png');
  assert.equal(clip.frames[0].state.players[0].cells[0].id,clip.frames[1].state.players[0].cells[0].id);
});

test('rolling buffer keeps the last 30 seconds, rate limits frames, and rebases saved time', async () => {
  const {ReplayBuffer} = await modulePromise, buffer = new ReplayBuffer(), state = snapshot();
  for (let now=0;now<=60000;now+=10) buffer.capture(now,state,view());
  const clip = buffer.clip({});
  assert.ok(clip.duration<=30000&&clip.duration>=29800);
  assert.equal(clip.frames[0].at,0);
  assert.equal(clip.frames.at(-1).at,clip.duration);
  assert.ok(clip.frames.length<=451);
  assert.ok(buffer.frames[0].at>=30000);
  buffer.reset();assert.equal(buffer.clip({}),null);assert.equal(buffer.bytes,0);
});

test('busy worlds cannot grow the rolling replay buffer beyond its memory limit', async () => {
  const {ReplayBuffer} = await modulePromise, state = snapshot(), camera = view();
  const measured = new ReplayBuffer();measured.capture(0,state,camera);
  const buffer = new ReplayBuffer({maxBytes:measured.bytes*3});
  for (let now=0;now<=10000;now+=100) buffer.capture(now,state,camera);
  assert.ok(buffer.frames.length<101);assert.ok(buffer.bytes<=buffer.maxBytes);
  const tooSmall = new ReplayBuffer({maxBytes:1});tooSmall.capture(0,state,camera);
  assert.equal(tooSmall.frames.length,0);
});

test('static food is shared across frames while consumed and moving food keeps its history', async () => {
  const {ReplayBuffer, expandReplay} = await modulePromise, buffer = new ReplayBuffer(), state = snapshot();
  buffer.capture(0,state,view());buffer.capture(100,state,view());
  assert.equal(buffer.foodValues.size,1);
  state.food.push({x:50,y:50,mass:20,ejected:true});buffer.capture(200,state,view());
  state.food[1].x=60;buffer.capture(400,state,view());
  state.food.shift();buffer.capture(600,state,view());
  const clip = buffer.clip({}), expanded = expandReplay(clip);
  assert.equal(Object.keys(clip.foodPool).length,3);
  assert.equal(expanded.frames[0].state.food.length,1);
  assert.equal(expanded.frames[2].state.food[1].x,50);
  assert.equal(expanded.frames[3].state.food[1].x,60);
  assert.equal(expanded.frames[4].state.food.length,1);
  buffer.capture(31000,state,view());
  assert.equal(buffer.foodValues.size,1);
  assert.ok(buffer.bytes>0);buffer.reset();assert.equal(buffer.bytes,0);assert.equal(buffer.foodValues.size,0);
});

test('frame selection supports seeking, exact boundaries and the end of a replay', async () => {
  const {framePair} = await modulePromise;
  const clip = {frames:[{at:0},{at:100},{at:200}]};
  assert.equal(framePair(clip,50).ratio,.5);
  assert.equal(framePair(clip,100).first.at,100);
  assert.equal(framePair(clip,200).first.at,200);
  assert.equal(framePair(clip,900).ratio,0);
  assert.equal(framePair(clip,-100).ratio,0);
});
