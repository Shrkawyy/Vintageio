'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'../public');
async function loadGame(){
  const encode=p=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,p),'utf8'));
  const src=fs.readFileSync(path.join(base,'game.js'),'utf8')
    .replace("'./virus-rules.js?v=5-smooth-launch'",JSON.stringify(encode('virus-rules.js')))
    .replace("'./physics.js?v=16-multi-fixes'",JSON.stringify(encode('physics.js')));
  return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(src));
}
function mockCanvas(){
  const operations=[];
  const ctx=new Proxy({}, {get:(target,key)=>{
    if(key==='drawImage')return(...args)=>operations.push({method:key,args});
    if(key==='rect')return(...args)=>operations.push({method:key,args});
    return target[key]||(()=>{});
  },set:(target,key,val)=>{target[key]=val;return true;}});
  return{canvas:{getContext:()=>ctx,style:{}},operations};
}
test('background and center logo are world-fixed and clipped to the square',async()=>{
  const {ArenaRenderer,DEFAULT_SETTINGS,WORLD_SIZE}=await loadGame();
  const original={Image:global.Image,innerWidth:global.innerWidth,innerHeight:global.innerHeight,devicePixelRatio:global.devicePixelRatio};
  try{
    global.innerWidth=1200;global.innerHeight=800;global.devicePixelRatio=1;
    global.Image=class{complete=true;naturalWidth=1536;naturalHeight=1024;set src(v){this.url=v;}};
    const main=mockCanvas(),minimap=mockCanvas();
    const r=new ArenaRenderer(main.canvas,minimap.canvas);
    const s={...DEFAULT_SETTINGS,showGrid:false,showSectors:false,showBorders:false,worldLogoUrl:'https://example.com/brand.png'};
    r.draw(null,null,s,false);
    const initial=main.operations.filter(x=>x.method==='drawImage').map(x=>x.args.slice(1));
    assert.equal(initial.length,3);
    assert.equal(initial[0][0],-WORLD_SIZE/4); // cover crop, full square
    assert.equal(initial[0][1],0);
    assert.equal(initial[0][2],WORLD_SIZE*1.5);
    assert.equal(initial[0][3],WORLD_SIZE);
    assert.equal(initial[1][0],0); // contain pass preserves full brand wordmark
    assert.equal(initial[1][1],WORLD_SIZE/6);
    assert.equal(initial[1][2],WORLD_SIZE);
    assert.equal(initial[1][3],WORLD_SIZE*2/3);
    assert.ok(main.operations.some(x=>x.method==='rect'&&x.args[0]===0&&x.args[2]===WORLD_SIZE));
    main.operations.length=0;
    r.cam.x=3900;r.cam.y=4100;
    r.draw(null,null,s,false);
    const moved=main.operations.filter(x=>x.method==='drawImage').map(x=>x.args.slice(1));
    assert.deepEqual(moved,initial,'camera panning must not shift either image relative to the arena');
  } finally {
    for(const [key,value] of Object.entries(original)){
      if(value===undefined)delete global[key]; else global[key]=value;
    }
  }
});

test('sector visibility clips entities after the full background, grid and border are drawn',async()=>{
  const {ArenaRenderer,DEFAULT_SETTINGS}=await loadGame(),original={Image:global.Image,innerWidth:global.innerWidth,innerHeight:global.innerHeight,devicePixelRatio:global.devicePixelRatio};
  try{
    Object.assign(global,{innerWidth:1200,innerHeight:800,devicePixelRatio:1,Image:class{complete=true;naturalWidth=1536;naturalHeight=1024;set src(v){}}});
    const calls=[],ctx=new Proxy({},{get:(target,key)=>target[key]||((...args)=>calls.push({method:key,args})),set:(target,key,val)=>(target[key]=val,true)}),canvas={getContext:()=>ctx,style:{}};
    const r=new ArenaRenderer(canvas,canvas);r.cam={x:7200,y:7200};r.zoom=.04;
    const state={mode:'ffa',worldSize:12000,vision:[{left:2400,top:2400,right:9600,bottom:9600},{left:4800,top:4800,right:12000,bottom:12000}],players:[],food:[{x:7200,y:7200,mass:10}],viruses:[]};
    r.draw(state,null,{...DEFAULT_SETTINGS,zoom:.04,showGrid:true,showBorders:true,showMinimap:false},false,0);
    const sight=calls.findIndex(c=>c.method==='rect'&&c.args[0]===2400);
    assert.ok(sight>calls.findLastIndex(c=>c.method==='drawImage'),'artwork is drawn before the visibility mask');
    assert.ok(sight>calls.findLastIndex(c=>c.method==='strokeRect'),'the complete square border is drawn before the visibility mask');
    assert.ok(sight<calls.findIndex(c=>c.method==='arc'),'live food is drawn after the visibility mask');
    const lines=calls.filter(c=>c.method==='lineTo');assert.ok(lines.length>10&&lines.length<40,'wide zoom uses a readable grid density');
    assert.ok(lines.every(c=>c.args.every(v=>v>=0&&v<=12000)),'grid lines stay inside the square');
  }finally{for(const [key,value]of Object.entries(original)){if(value===undefined)delete global[key];else global[key]=value;}}
});






