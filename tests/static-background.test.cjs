'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'../public');
async function loadGame(){
  const encode=p=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,p),'utf8'));
  const src=fs.readFileSync(path.join(base,'game.js'),'utf8')
    .replace("'./virus-rules.js'",JSON.stringify(encode('virus-rules.js')))
    .replace("'./physics.js'",JSON.stringify(encode('physics.js')));
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
    assert.equal(initial.length,2);
    assert.equal(initial[0][0],0);
    assert.equal(initial[0][1],800);
    assert.equal(initial[0][2],WORLD_SIZE);
    assert.equal(initial[0][3],3200);
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
