'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const game=require('./helpers/game-module.cjs').game;
const bounds={left:0,top:0,right:1000,bottom:1000};
function canvas(){
  const circles=[];let strokes=0;
  return {circles,get strokes(){return strokes},beginPath(){},arc(x,y,r){this.pending={x,y,r}},
    fill(){circles.push({...this.pending,color:this.fillStyle,alpha:this.globalAlpha})},stroke(){strokes++}};
}
test('FFA and Dual use the received radius without changing mass or adding cosmetic enlargement',async()=>{
  const {drawFoodLayer,DEFAULT_SETTINGS,radius}=await game();
  for(const mode of ['ffa','dual']){
    const pellet=Object.freeze({x:400,y:400,radius:14.7,mass:36,ejected:true,color:'#09759d'}),ctx=canvas();
    drawFoodLayer(ctx,[pellet],bounds,DEFAULT_SETTINGS,mode);
    const cellScreenRadius=95,screenRadius=ctx.circles[0].r/radius(21900)*cellScreenRadius;
    assert.equal(ctx.circles[0].r,pellet.radius);assert.ok(screenRadius>3.8&&screenRadius<3.9);
    assert.equal(pellet.mass,36);assert.equal(pellet.radius,14.7);
    assert.equal(ctx.strokes,0);assert.equal(ctx.circles[0].alpha,1);
  }
});
test('food size is separate and FFA/Dual ignore legacy cosmetic feed enlargement',async()=>{
  const {drawFoodLayer,DEFAULT_SETTINGS}=await game();
  const food={x:200,y:200,mass:100,radius:30},feed={...food,ejected:true};
  for(const mode of ['ffa','dual']){
    const normal=canvas(),large=canvas(),smallFood=canvas();
    drawFoodLayer(normal,[food,feed],bounds,DEFAULT_SETTINGS,mode);
    drawFoodLayer(large,[food,feed],bounds,{...DEFAULT_SETTINGS,feedSize:2},mode);
    drawFoodLayer(smallFood,[food,feed],bounds,{...DEFAULT_SETTINGS,foodSize:.5},mode);
    assert.equal(normal.circles[0].r,15);assert.equal(large.circles[0].r,15);
    assert.equal(large.circles[1].r,normal.circles[1].r);
    assert.equal(smallFood.circles[1].r,normal.circles[1].r);
  }
  const legacy=canvas();drawFoodLayer(legacy,[feed],bounds,DEFAULT_SETTINGS,'legacy');
  assert.equal(legacy.circles[0].r,15);assert.equal(legacy.strokes,1);
});
test('feed follows visible owner colors, honors custom food color and remains visible across the viewport edge',async()=>{
  const {drawFoodLayer,DEFAULT_SETTINGS}=await game();
  const pellets=[{x:-12,y:100,mass:36,radius:14.7,ejected:true,ownerId:'inactive',color:'#ff0000'},
    {x:-80,y:100,mass:36,radius:14.7,ejected:true,color:'#ff0000'}];
  const source=JSON.stringify(pellets),ctx=canvas(),owners=new Map([['inactive','#ffffff']]);
  drawFoodLayer(ctx,pellets,bounds,DEFAULT_SETTINGS,'ffa',owners);
  assert.equal(ctx.circles.length,1);assert.equal(ctx.circles[0].color,'#ffffff');
  const custom=canvas();drawFoodLayer(custom,pellets,bounds,{...DEFAULT_SETTINGS,rainbowFood:false,foodColor:'#123456'},'dual',owners);
  assert.equal(custom.circles[0].color,'#123456');assert.equal(JSON.stringify(pellets),source);
});
test('saved settings and replay captures preserve feed presentation and public ownership',async()=>{
  const {normalizeVisualSettings}=await game();
  assert.equal(normalizeVisualSettings({}).feedSize,1);
  assert.equal(normalizeVisualSettings({feedSize:1.4}).feedSize,1.4);
  assert.equal(normalizeVisualSettings({feedSize:Infinity}).feedSize,1);
  const {url}=require('./helpers/game-module.cjs'),{ReplayBuffer}=await import(url('replays.js'));
  const buffer=new ReplayBuffer(),pellet={x:200,y:200,mass:36,radius:14.7,ejected:true,ownerId:'self',sourceId:4,sourceCollectAt:50};
  const snapshot={mode:'ffa',players:[{id:'self',cells:[{x:200,y:200,mass:1000}]}],food:[pellet]};
  buffer.capture(0,snapshot,{});buffer.capture(1000,snapshot,{});
  const clip=buffer.clip({feedSize:1.4}),saved=Object.values(clip.foodPool)[0];
  assert.equal(saved.ownerId,'self');assert.equal(saved.sourceId,undefined);assert.equal(saved.sourceCollectAt,undefined);
  assert.equal(clip.settings.feedSize,1.4);
});

test('FFA feed uses a linear animation delay without shrinking, fading, or changing authoritative data',async()=>{
  const {FeedAnimator}=await game(),anim=new FeedAnimator();
  const first=Object.freeze({feedId:8,x:100,y:200,mass:36,radius:14.7,ejected:true});
  const moved=Object.freeze({...first,x:200});
  const sample=(food,dt,delay=100)=>anim.sample(food,dt,true,5880,false,delay)[0];
  assert.equal(sample([first],0).renderAlpha,1);sample([moved],0);
  const half=sample([moved],.05);assert.equal(half.x,150);assert.equal(half.radius,14.7);assert.equal(half.renderAlpha,1);
  assert.equal(sample([moved],.05).x,200);assert.equal(moved.x,200);assert.equal(moved.mass,36);
  assert.equal(sample([{...moved,x:300}],.01,0).x,300);
  assert.equal(sample([{...moved,x:5000}],.01).x,5000);
  assert.deepEqual(anim.sample([],1/60,true,5880,false,100),[]);assert.equal(anim.pellets.size,0);
});

test('FFA retargeting keeps its current visible position and its tween is independent of render rate',async()=>{
  const {FeedAnimator}=await game();
  const run=hz=>{const anim=new FeedAnimator(),f=x=>({feedId:9,x,y:200,mass:36,radius:14.7,ejected:true}),sample=(x,dt)=>anim.sample([f(x)],dt,true,5880,false,100)[0];sample(100,0);sample(200,0);let out;for(let n=0;n<hz/10;n++)out=sample(200,1/hz);return out.x;};
  for(const hz of [30,60,120])assert.ok(Math.abs(run(hz)-200)<1e-8);
  const anim=new FeedAnimator(),f=x=>({feedId:9,x,y:200,mass:36,radius:14.7,ejected:true}),sample=(x,dt)=>anim.sample([f(x)],dt,true,5880,false,100)[0];
  sample(100,0);sample(200,0);assert.equal(sample(200,.05).x,150);assert.equal(sample(300,0).x,150);assert.equal(sample(300,.05).x,225);
});
