'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const core=require('../server/core.cjs');

async function game(){
  const base=path.resolve(__dirname,'../public');
  const encode=file=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,file),'utf8'));
  const source=fs.readFileSync(path.join(base,'game.js'),'utf8')
    .replace("'./virus-rules.js?v=3-full-burst'",JSON.stringify(encode('virus-rules.js')))
    .replace("'./physics.js?v=11-world-ui'",JSON.stringify(encode('physics.js')));
  return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
}
const player=(cells,id='p')=>({id,cells});
const cell=(x=2000,mass=1000,id='c')=>({id,x,y:2000,mass});

test('animation changes presentation without modifying the source state or mass',async()=>{
  const {CellAnimator,radius}=await game(),animator=new CellAnimator();
  animator.sample([player([cell()])]);
  const source=Object.freeze(cell(2100,2000)),snapshot=Object.freeze([Object.freeze(player(Object.freeze([source])))]);
  const rendered=animator.sample(snapshot,120,1/60)[0].cells[0];
  assert.ok(rendered.x>2000&&rendered.x<2100);
  assert.ok(rendered.renderRadius>radius(1000)&&rendered.renderRadius<radius(2000));
  assert.equal(source.x,2100);assert.equal(source.mass,2000);assert.equal(rendered.mass,2000);
  assert.equal(source.renderRadius,undefined);
});

test('animation duration controls speed, zero is immediate, and smoothing is frame-rate independent',async()=>{
  const {CellAnimator}=await game();
  const run=(duration,hz)=>{
    const animator=new CellAnimator();animator.sample([player([cell()])],duration);
    for(let n=0;n<hz/5;n++)animator.sample([player([cell(2200)])],duration,1/hz);
    return [...animator.cells.values()][0].x;
  };
  assert.equal(run(0,60),2200);
  assert.ok(run(40,60)>run(120,60));assert.ok(run(120,60)>run(500,60));
  assert.ok(Math.abs(run(120,30)-run(120,60))<1e-8);
});

test('stable cell identities survive new network objects and removal of earlier array entries',async()=>{
  const {CellAnimator}=await game(),animator=new CellAnimator();
  animator.sample([player([cell(2000,1000,'a'),cell(2400,1000,'b')])]);
  const rendered=animator.sample([player([cell(2420,1200,'b')])],120,1/60)[0].cells[0];
  assert.ok(rendered.x>2400&&rendered.x<2420);
  assert.equal(animator.cells.size,1);
  animator.reset();assert.equal(animator.sample([player([cell(3000)])])[0].cells[0].x,3000);
});

test('local cell identities survive reordering and split daughters start at their actual size',async()=>{
  const {CellAnimator,radius}=await game(),animator=new CellAnimator();
  const a=cell(2000),b=cell(2300);delete a.id;delete b.id;
  animator.sample([player([a,b])]);b.x=2320;
  const reordered=animator.sample([player([b])],120,1/60)[0].cells[0];
  assert.ok(reordered.x>2300&&reordered.x<2320);
  const child=cell(2350,500);delete child.id;
  const split=animator.sample([player([b,child])],120,1/60)[0].cells[1];
  assert.equal(split.renderRadius,radius(500));
  assert.equal(child.mass,500);
  animator.sample([]);assert.equal(animator.cells.size,0);
});

test('invalid animation settings fall back or clamp, and large respawn corrections display immediately',async()=>{
  const {normalizeAnimation,DEFAULT_SETTINGS,CellAnimator}=await game();
  for(const value of [undefined,null,'120',NaN,Infinity])assert.equal(normalizeAnimation(value),DEFAULT_SETTINGS.animation);
  assert.equal(normalizeAnimation(-100),0);assert.equal(normalizeAnimation(9999),500);assert.equal(normalizeAnimation(123),120);
  const animator=new CellAnimator();animator.sample([player([cell()])]);
  assert.equal(animator.sample([player([cell(4000)])],500,1/60)[0].cells[0].x,4000);
});

test('server snapshots keep unique stable cell IDs through movement, split and removal',()=>{
  const room=core.createRoom('ffa'),p=core.join(room,'Animation','');
  const cells=()=>core.snapshot(room).players.find(x=>x.id===p.id).cells;
  const first=cells()[0].id;
  p.cells[0].x+=10;p.cells[0].mass+=100;
  assert.equal(cells()[0].id,first);
  core.point(room,p,3500,2000);core.split(room,p);
  const split=cells();assert.equal(split[0].id,first);assert.notEqual(split[0].id,split[1].id);
  p.cells.splice(0,1);assert.equal(cells()[0].id,split[1].id);
});






