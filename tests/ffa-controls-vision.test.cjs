'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const rules=require('../server/physics.cjs'),core=require('../server/core.cjs');
async function game(){
  const base=path.resolve(__dirname,'../public'),encode=file=>'data:text/javascript;charset=utf-8,'+encodeURIComponent(fs.readFileSync(path.join(base,file),'utf8'));
  const s=fs.readFileSync(path.join(base,'game.js'),'utf8').replace(/'\.\/virus-rules\.js\?[^']*'/,JSON.stringify(encode('virus-rules.js'))).replace(/'\.\/physics\.js\?[^']*'/,JSON.stringify(encode('physics.js')));
  return import('data:text/javascript;charset=utf-8,'+encodeURIComponent(s));
}
const player=(id,x,y=6000,mass=1000)=>({id,name:id,tag:'SAME',cells:[{x,y,mass}],target:{x,y}});

test('FFA x16, x32 and x64 schedule identical split rounds and stop at 16 without losing mass',()=>{
  const run=count=>{
    const p=player('p',6000,6000,16000);rules.startSplitMacro(p,count,0,12000,64,'ffa');
    const pending=[...p.pendingSplits];
    for(let i=1;i<=20;i++)rules.stepSplitMacro(p,i/60,12000,64,'ffa');
    assert.equal(p.cells.length,16);assert.equal(p.cells.reduce((s,c)=>s+c.mass,0),16000);
    return {pending,cells:p.cells};
  };
  assert.deepEqual(run(5),run(4));assert.deepEqual(run(6),run(4));
  for(const cfg of core.loadRegistry().servers.filter(s=>s.engineMode==='ffa'))assert.equal(core.createRoom(cfg).maxCells,16);
});

test('standalone modifiers, navigation, numpad, punctuation and F13-F24 can be saved and reloaded',async()=>{
  const {physicalKey,normalizeControlSettings,DEFAULT_SETTINGS}=await game();
  for(const [code,key,extra,expected] of [
    ['ShiftLeft','Shift',{shiftKey:true},'SHIFT'],['ShiftRight','Shift',{shiftKey:true},'SHIFT'],
    ['ControlLeft','Control',{ctrlKey:true},'CTRL'],['AltRight','Alt',{altKey:true},'ALT'],['MetaLeft','Meta',{metaKey:true},'META'],
    ['CapsLock','CapsLock',{},'CAPSLOCK'],['Insert','Insert',{},'INSERT'],['Home','Home',{},'HOME'],['End','End',{},'END'],
    ['PageUp','PageUp',{},'PAGEUP'],['PageDown','PageDown',{},'PAGEDOWN'],['Backspace','Backspace',{},'BACKSPACE'],['Delete','Delete',{},'DELETE'],
    ['NumpadMultiply','*',{},'NUMPADMULTIPLY'],['Numpad0','0',{},'NUMPAD0'],['NumpadEnter','Enter',{},'NUMPADENTER'],
    ['F24','F24',{},'F24'],['Semicolon',';',{},'SEMICOLON'],['KeyD','ي',{shiftKey:true},'SHIFT+D'],
  ]){
    const binding=physicalKey({code,key,...extra});assert.equal(binding,expected,code);
    assert.equal(normalizeControlSettings({...DEFAULT_SETTINGS,keySplit:binding}).keySplit,expected,code+' survives saved settings');
  }
});

test('sight is the current sector plus eight neighbors, including corners and map edges',()=>{
  const p=player('me',6000),state={mode:'ffa',worldSize:12000,players:[p],food:[],viruses:[]};
  assert.deepEqual(rules.limitVisibility(state,['me']).vision,[{left:2400,top:2400,right:9600,bottom:9600}]);
  p.cells[0].x=1200;p.cells[0].y=1200;
  assert.deepEqual(rules.limitVisibility(state,['me']).vision,[{left:0,top:0,right:4800,bottom:4800}]);
  p.cells[0].x=10800;p.cells[0].y=10800;
  assert.deepEqual(rules.limitVisibility(state,['me']).vision,[{left:7200,top:7200,right:12000,bottom:12000}]);
});

test('server hides far player fragments, food and viruses even when the viewer zooms out',()=>{
  const room=core.createRoom('ffa'),me=player('me',6000),enemy=player('near',3000),far=player('hidden-name',11000);
  far.tag='OTHER';
  enemy.cells.push({x:11500,y:6000,mass:1000});
  room.players=new Map([me,enemy,far].map(p=>[p.id,p]));room.food=[{x:6000,y:6000,mass:10},{x:11000,y:11000,mass:10}];
  room.viruses=[{x:6000,y:6000,mass:100},{x:11000,y:11000,mass:100}];
  const view=core.viewSnapshot(room,me);
  assert.deepEqual(view.players.map(p=>p.id),['me','near']);assert.equal(view.players[1].cells.length,1);
  assert.equal(view.food.length,1);assert.equal(view.viruses.length,1);assert.ok(!JSON.stringify(view).includes('hidden-name'));
  me.zoom=.0001;assert.deepEqual(core.viewSnapshot(room,me),view);
  assert.equal(core.snapshot(room).players.length,3,'spectators retain the full world');
});

test('only controlled multibox connections share sight; matching team tags do not grant distant sight',()=>{
  const room=core.createRoom('ffa'),a=player('a',1200,1200),b=player('b',10800,10800),teammate=player('team',6000);
  a.multiKey=b.multiKey='a'.repeat(32);room.players=new Map([a,b,teammate].map(p=>[p.id,p]));
  room.food=[];room.viruses=[];
  const view=core.viewSnapshot(room,a);
  assert.equal(view.vision.length,2);assert.deepEqual(view.players.map(p=>p.id),['a','b']);
  assert.ok(!JSON.stringify(view).includes(a.multiKey));
  b.multiKey='b'.repeat(32);assert.equal(core.viewSnapshot(room,a).vision.length,1);
});

test('local FFA applies the same sectors, keeps dead owned connections and does not expose stale entities',async()=>{
  const {LocalArena,DEFAULT_SETTINGS,ZOOM_MIN,ZOOM_MAX}=await game(),a=new LocalArena();a.reset('ffa','Me','',true,DEFAULT_SETTINGS);
  assert.equal(a.worldSize,12000);assert.ok(a.food.length>=1500);assert.equal(a.viruses.length,32);assert.ok(ZOOM_MIN<.1&&ZOOM_MAX>10);
  const own=a.myIds.map(id=>a.getById(id));own.forEach(p=>p.cells=[{x:1200,y:1200,mass:1000}]);
  a.players=[...own,player('hidden',11000,11000)];a.food=[{x:11000,y:11000,mass:10}];a.viruses=[];
  assert.equal(a.snapshot.players.length,2);assert.equal(a.snapshot.food.length,0);
  own.forEach(p=>p.cells=[]);assert.equal(a.snapshot.players.length,2);assert.deepEqual(a.snapshot.vision,[]);
});
