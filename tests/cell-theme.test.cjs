'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
async function game(){
  const base=path.resolve(__dirname,'../public');
  const encode=file=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,file),'utf8'));
  const source=fs.readFileSync(path.join(base,'game.js'),'utf8')
    .replace("'./virus-rules.js?v=5-smooth-launch'",JSON.stringify(encode('virus-rules.js')))
    .replace("'./physics.js?v=16-multi-fixes'",JSON.stringify(encode('physics.js')));
  return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
}
function canvas(){
  const operations=[],state={globalAlpha:1},context=new Proxy(state,{
    get:(target,key)=>{
      if(key==='arc')return(x,y,r)=>{target.circle={x,y,r};};
      if(['fill','stroke','fillText','strokeText','drawImage'].includes(key))return(...args)=>operations.push({method:key,args,...target});
      return target[key]||(()=>{});
    },set:(target,key,value)=>{target[key]=value;return true;}
  });
  return{canvas:{getContext:()=>context,style:{}},operations};
}
async function scene(){
  const g=await game(),main=canvas(),radar=canvas();
  const renderer=new g.ArenaRenderer(main.canvas,radar.canvas);renderer.screenW=1200;renderer.screenH=800;renderer.cam={x:2400,y:2400};
  const settings={...g.DEFAULT_SETTINGS,backgroundImage:false,showGrid:false,showSectors:false,showBorders:false,showMinimap:false,showFood:false,showViruses:false,animation:0};
  const snapshot={players:[
    {id:'one',name:'Main',color:'#00ffff',cells:[{id:'a',x:2200,y:2400,mass:34900}]},
    {id:'two',name:'Multi',color:'#ff88b0',cells:[{id:'b',x:2700,y:2400,mass:4900}]},
    {id:'enemy',name:'Other',color:'#654321',cells:[{id:'c',x:2000,y:2300,mass:1000}]}
  ],food:[],viruses:[]};
  return{g,main,renderer,settings,snapshot};
}

test('multibox fills are white and blue and follow the active connection, including split fragments',async()=>{
  const original={innerWidth:global.innerWidth,innerHeight:global.innerHeight};global.innerWidth=1200;global.innerHeight=800;
  try{
    const {main,renderer,settings,snapshot}=await scene();
    snapshot.players[0].cells.push({id:'split',x:2201,y:2400,mass:500});
    const before=JSON.stringify(snapshot);
    renderer.draw(snapshot,'one',settings,false,0,false,['one','two']);
    const fills=main.operations.filter(x=>x.method==='fill');
    assert.equal(fills.find(x=>x.circle.x===2200).fillStyle,'#09759d');
    assert.equal(fills.find(x=>x.circle.x===2201).fillStyle,'#09759d');
    assert.equal(fills.find(x=>x.circle.x===2700).fillStyle,'#ffffff');
    assert.equal(fills.find(x=>x.circle.x===2000).fillStyle,'#654321');
    assert.equal(fills.filter(x=>x.circle.x===2200).length,1,'flat fill has no shaded inner disc');
    assert.equal(main.operations.filter(x=>x.method==='stroke').length,0,'flat bodies have no thick border');
    main.operations.length=0;
    renderer.draw(snapshot,'two',settings,false,0,false,['one','two']);
    const switched=main.operations.filter(x=>x.method==='fill');
    assert.equal(switched.find(x=>x.circle.x===2700).fillStyle,'#09759d');
    assert.equal(switched.find(x=>x.circle.x===2200).fillStyle,'#ffffff');
    assert.equal(switched.find(x=>x.circle.x===2201).fillStyle,'#ffffff');
    assert.equal(JSON.stringify(snapshot),before,'theme leaves masses, coordinates and server colors untouched');
  }finally{Object.assign(global,original);}
});

test('natural colors stay independent of multibox in solo play, spectators and natural-color mode',async()=>{
  const {cellAppearance,DEFAULT_SETTINGS:s}=await game();
  const p={id:'one',color:'#a938ff'};
  assert.equal(cellAppearance(p,'one',['one'],s).fill,p.color);
  assert.equal(cellAppearance(p,'one',['one',undefined],s).fill,p.color);
  assert.equal(cellAppearance(p,'one',['one','one'],s).fill,p.color);
  assert.equal(cellAppearance(p,'one',[],s).fill,p.color);
  assert.equal(cellAppearance(p,'one',['one','two'],{...s,ownCellColoring:'server'}).fill,p.color);
  assert.equal(cellAppearance(p,'one',['one','two'],{...s,activeCellBorderColor:'#123456'}).fill,'#123456');
  assert.equal(cellAppearance(p,'two',['one','two'],{...s,activeCellIndicatorColor:'#123456'}).fill,'#ffffff','inactive white is fixed');
});

test('feed keeps its stored food color when Tab changes the active multibox connection',async()=>{
  const original={innerWidth:global.innerWidth,innerHeight:global.innerHeight};global.innerWidth=1200;global.innerHeight=800;
  try{
    const {main,renderer,settings,snapshot}=await scene();settings.showFood=true;settings.rainbowFood=true;
    snapshot.mode='ffa';snapshot.food=[{feedId:1,ejected:true,ownerId:'one',x:2450,y:2400,mass:25,radius:9.5,color:'#d991ff'}];
    for(const active of ['one','two']){
      main.operations.length=0;renderer.draw(snapshot,active,settings,false,1/60,false,['one','two']);
      assert.equal(main.operations.find(x=>x.method==='fill'&&x.circle.r===9.5).fillStyle,'#d991ff');
    }
    settings.rainbowFood=false;settings.foodColor='#123456';main.operations.length=0;
    renderer.draw(snapshot,'two',settings,false,1/60,false,['one','two']);
    assert.equal(main.operations.find(x=>x.method==='fill'&&x.circle.r===9.5).fillStyle,'#123456');
  }finally{Object.assign(global,original);}
});

test('single-connection configuration creates one naturally colored player in every current mode',async()=>{
  const {LocalArena,MODES,DEFAULT_SETTINGS,supportsMultibox,cellAppearance}=await game();
  const arena=new LocalArena();
  for(const mode of Object.keys(MODES)){
    assert.equal(supportsMultibox(mode),true);
    assert.equal(supportsMultibox(mode,{multi:false}),false);
    arena.reset(mode,'Solo','',supportsMultibox(mode,{multi:false}),DEFAULT_SETTINGS);
    assert.equal(arena.myIds.length,1);
    const me=arena.getById(arena.myIds[0]);assert.match(me.color,/^#[0-9a-f]{6}$/);
    assert.equal(cellAppearance(me,me.id,arena.myIds,DEFAULT_SETTINGS).fill,me.color);
    arena.reset(mode,'Multi','',supportsMultibox(mode),DEFAULT_SETTINGS);
    assert.equal(arena.myIds.length,2);
  }
});

test('online players receive natural server colors independently of multibox connection slots',async()=>{
  const {createRoom,join,snapshot}=require('../server/core.cjs');
  const {cellAppearance,DEFAULT_SETTINGS}=await game();
  const room=createRoom('ffa');
  for(const slot of [0,1]){
    const p=join(room,'Natural','',slot);
    assert.ok(['#ffb388','#b595fc','#86f6cd','#fa9dd7','#7cc3ed'].includes(p.color));
    assert.equal(p.cells[0].color,p.color);
    const state=snapshot(room).players.find(x=>x.id===p.id);
    assert.equal(cellAppearance(state,p.id,[p.id],DEFAULT_SETTINGS).fill,p.color);
  }
});

test('Normal coloring uses a blue active border and an independently sized white inactive indicator',async()=>{
  const original={innerWidth:global.innerWidth,innerHeight:global.innerHeight};global.innerWidth=1200;global.innerHeight=800;
  try{
    const {g,main,renderer,settings,snapshot}=await scene();
    renderer.draw(snapshot,'one',{...settings,cellOpacity:0},false,0,false,['one','two']);
    assert.equal(main.operations.find(x=>x.method==='fill'&&x.circle.x===2200).globalAlpha,0);
    const massFont=main.operations.find(x=>x.method==='fillText'&&x.args[0]==='34.9k').font;
    const oldNameFont=main.operations.find(x=>x.method==='fillText'&&x.args[0]==='Main').font;
    main.operations.length=0;
    renderer.draw(snapshot,'one',{...settings,ownCellColoring:'server',nickSize:2,activeCellIndicatorSize:150,activeCellBorderWidth:20},false,0,false,['one','two']);
    assert.equal(main.operations.find(x=>x.method==='fillText'&&x.args[0]==='34.9k').font,massFont);
    assert.notEqual(main.operations.find(x=>x.method==='fillText'&&x.args[0]==='Main').font,oldNameFont);
    const indicator=main.operations.find(x=>x.method==='stroke'&&x.circle.x===2700&&x.strokeStyle==='#ffffff'),r=g.radius(34900),otherRadius=g.radius(4900);
    assert.ok(Math.abs(indicator.circle.r-(otherRadius*1.5-otherRadius*.2/2))<1e-8);
    assert.equal(main.operations.find(x=>x.method==='fill'&&x.circle.x===2200).fillStyle,'#00ffff','Normal preserves the natural body color');
    const border=main.operations.find(x=>x.method==='stroke'&&x.circle.x===2200);
    assert.equal(border.strokeStyle,settings.activeCellBorderColor);
    assert.ok(Math.abs(border.circle.r-(r-r*.2/2))<1e-8);
    main.operations.length=0;
    renderer.draw(snapshot,'one',{...settings,activeCellBorderWidth:0},false,0,false,['one','two']);
    assert.equal(main.operations.filter(x=>x.method==='stroke').length,0);
  }finally{Object.assign(global,original);}
});

test('multibox camera centers both connections and does not jump when switching active cells',async()=>{
  const original={innerWidth:global.innerWidth,innerHeight:global.innerHeight};global.innerWidth=1200;global.innerHeight=800;
  try{
    const {renderer,settings,snapshot}=await scene();renderer.cam={x:2450,y:2400};
    renderer.draw(snapshot,'one',settings,true,1/60,false,['one','two']);
    const initial={...renderer.cam},zoom=renderer.zoom;
    renderer.draw(snapshot,'two',settings,true,1/60,false,['one','two']);
    assert.deepEqual(renderer.cam,initial);assert.equal(renderer.cam.x,2450);
    const {renderer:single}=await scene();single.cam={x:2450,y:2400};single.zoom=zoom;
    single.draw(snapshot,'one',settings,true,1/60,false,['one']);
    assert.ok(single.cam.x<2450,'single connection still follows its own cells');
  }finally{Object.assign(global,original);}
});

test('cell names and mass labels ignore deprecated user colors and interface colors',async()=>{
  const original={innerWidth:global.innerWidth,innerHeight:global.innerHeight};global.innerWidth=1200;global.innerHeight=800;
  try{
    const {g,main,renderer,settings,snapshot}=await scene();snapshot.players[0].tag='Team';
    renderer.draw(snapshot,'one',{...settings,nickColor:'#123456',massColor:'#654321',textColor:'#ff0000',accentColor:'#0000ff'},false,0,false,['one','two']);
    const text=main.operations.filter(x=>x.method==='fillText');
    assert.equal(text.find(x=>x.args[0]==='Main').fillStyle,g.tagColor('Team'));
    assert.ok(!text.some(x=>String(x.args[0]).includes('Team')),'private tag is never drawn above the name');
    assert.equal(text.find(x=>x.args[0]==='34.9k').fillStyle,g.tagColor('Team'));
    assert.equal(text.find(x=>x.args[0]==='Other').fillStyle,'#ffffff');
  }finally{Object.assign(global,original);}
});

test('Canvas cell effects are optional and independent of arena background settings',async()=>{
  const original={innerWidth:global.innerWidth,innerHeight:global.innerHeight};global.innerWidth=1200;global.innerHeight=800;
  try{
    const {main,renderer,settings,snapshot}=await scene();
    renderer.draw(snapshot,'one',{...settings,canvasCellEffects:true},false,0,false,['one','two']);
    assert.equal(main.operations.filter(x=>x.method==='fill'&&x.circle.x===2200).length,2);
    assert.ok(main.operations.some(x=>x.method==='fill'&&x.fillStyle==='#08131d'&&x.globalAlpha===.18));
    main.operations.length=0;
    renderer.draw(snapshot,'one',settings,false,0,false,['one','two']);
    assert.equal(main.operations.filter(x=>x.method==='fill'&&x.circle.x===2200).length,1);
    assert.equal(settings.backgroundImage,false);
  }finally{Object.assign(global,original);}
});

test('compact mass formatting keeps the true mass and supports switching to full numbers',async()=>{
  const {formatCellMass}=await game();
  assert.equal(formatCellMass(34900),'34.9k');assert.equal(formatCellMass(4900),'4.9k');
  assert.equal(formatCellMass(23300),'23.3k');assert.equal(formatCellMass(1000),'1k');
  assert.equal(formatCellMass(34900,false),'34,900');assert.equal(formatCellMass(NaN),'0');
});

test('saved/imported settings discard deprecated colors and preserve arena preferences',async()=>{
  const {DEFAULT_SETTINGS,normalizeVisualSettings}=await game();
  const old={...DEFAULT_SETTINGS,visualStyleVersion:undefined,ownColor:'#70e0ff',secondColor:'#ff88b0',cellOpacity:100,nickSize:1,massSize:1,backgroundImage:false,bgColor:'#010203',backgroundUrl:'https://example.com/bg.png'};
  const migrated=normalizeVisualSettings(old,true);
  assert.ok(!('ownColor' in migrated));assert.ok(!('secondColor' in migrated));assert.equal(migrated.nickSize,1.1);
  assert.equal(migrated.backgroundImage,false);assert.equal(migrated.bgColor,'#010203');assert.equal(migrated.backgroundUrl,old.backgroundUrl);
  const custom=normalizeVisualSettings({...old,ownColor:'#123456',cellOpacity:30},true);
  assert.ok(!('ownColor' in custom));assert.equal(custom.cellOpacity,30);
  const imported=normalizeVisualSettings({...old,activeCellBorderWidth:999,nickSize:-1,activeCellIndicatorColor:'#123456',ownCellColoring:'bad',nickColor:'#abcdef',massColor:'#fedcba',customTheme:{ownColor:'#123456',secondColor:'#654321',nickColor:'#abcdef',massColor:'#fedcba',bgColor:'#010203'}});
  assert.equal(imported.activeCellBorderWidth,100);assert.equal(imported.nickSize,.1);
  assert.equal(imported.activeCellIndicatorColor,DEFAULT_SETTINGS.activeCellIndicatorColor);
  assert.equal(imported.ownCellColoring,'multibox');
  for(const key of ['ownColor','secondColor','nickColor','massColor']){assert.ok(!(key in imported));assert.ok(!(key in imported.customTheme));}
  assert.equal(imported.customTheme.bgColor,'#010203');
  const v1=normalizeVisualSettings({...DEFAULT_SETTINGS,visualStyleVersion:1,activeCellBorderWidth:10,cellOpacity:100},true);
  assert.equal(v1.activeCellBorderWidth,10);assert.equal(v1.cellOpacity,100);
  const v2=normalizeVisualSettings({...DEFAULT_SETTINGS,visualStyleVersion:2,activeCellIndicatorSize:50,activeCellBorderWidth:0,cellOpacity:70},true);
  assert.equal(v2.activeCellIndicatorSize,100);assert.equal(v2.activeCellBorderWidth,10);assert.equal(v2.cellOpacity,100);
  assert.equal(normalizeVisualSettings({...old,ownCellColoring:'uniform'}).ownCellColoring,'server');
});






