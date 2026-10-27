'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=require('../server/core.cjs'),{cleanSkinUrl,setCosmetics}=require('../server/cosmetics.cjs');
const frontend=import(require('./helpers/game-module.cjs').url('skins.js'));

test('frontend and backend agree on safe cosmetic URLs and reject scripts, credentials and oversized input',async()=>{
 const client=await frontend;
 for(const value of ['/assets/skins/jax/featured-01.png','https://i.imgur.com/abc.png','http://localhost:3002/image.gif','javascript:alert(1)','data:image/png;base64,AAAA','https://user:password@example.com/image.png','/private/file.png','/assets/skins/../private.png','https://example.com/'+'a'.repeat(1201),null,{}]){
  assert.equal(client.cleanSkinUrl(value),cleanSkinUrl(value),String(value));
 }
 assert.equal(cleanSkinUrl('javascript:alert(1)'),'');assert.equal(cleanSkinUrl('data:image/png;base64,AAAA'),'');
});

test('connection appearances are independent and the remaining 12 shields are available in guest preview',async()=>{
 const {normalizeCosmetics,SHIELDS}=await frontend;
 assert.equal(SHIELDS.length,12);assert.equal(new Set(SHIELDS.map(item=>item.id)).size,12);
 assert.ok(!SHIELDS.some(item=>item.id==='shield5'));
 assert.equal(normalizeCosmetics({slots:[{shieldId:'shield5'}]}).slots[0].shieldId,'');
 const removed={};setCosmetics(removed,{shieldId:'shield5'});assert.equal(removed.shieldId,'');
 const input={slots:[{skinUrl:'/assets/skins/jax/featured-01.png',shieldId:'shield7'},{skinUrl:'',shieldId:'shield13'}],saved:[]};
 const profile=normalizeCosmetics(input);input.slots[0].shieldId='shield3';
 assert.equal(profile.slots[0].shieldId,'shield7');assert.equal(profile.slots[1].skinUrl,'');assert.equal(profile.slots[1].shieldId,'shield13');
 const bad=normalizeCosmetics({slots:[{skinUrl:'javascript:bad',shieldId:'../../file'}],saved:[{url:'data:image/png;base64,x'},{url:'https://example.com/a.png',name:'A'},{url:'https://example.com/a.png',name:'A'}]});
 const empty=()=>({skinUrl:'',shieldId:'',flagId:'',titlePosition:{x:0,y:-.48}});
 assert.deepEqual(bad.slots,[empty(),empty()]);assert.equal(bad.saved.length,1);
 assert.deepEqual(normalizeCosmetics(null).slots,[empty(),empty()]);
});

test('server snapshots carry guest skins and shields through splits and respawns; clearing a skin preserves its shield',()=>{
 const room=core.createRoom('ffa');room.players.clear();const player=core.join(room,'Guest','');
 setCosmetics(player,{skinUrl:'/assets/skins/jax/featured-03.png',shieldId:'shield2'});
 core.split(room,player);
 let state=core.snapshot(room).players.find(p=>p.id===player.id);
 assert.equal(state.skinUrl,player.skinUrl);assert.equal(state.shieldId,'shield2');assert.ok(state.cells.length>1);
 player.cells=[];core.respawn(room,player,3600,3600);
 state=core.snapshot(room).players.find(p=>p.id===player.id);assert.equal(state.shieldId,'shield2');assert.ok(state.cells.length);
 setCosmetics(player,{skinUrl:'',shieldId:'shield2'});state=core.snapshot(room).players.find(p=>p.id===player.id);
 assert.equal(state.skinUrl,undefined);assert.equal(state.shieldId,'shield2');
 setCosmetics(player,{skinUrl:'javascript:bad',shieldId:'shield14'});assert.equal(player.skinUrl,'');assert.equal(player.shieldId,'');
});

test('shield assets are present and public pages provide the same five-tab chooser and two connection slots',()=>{
 const root=path.join(__dirname,'../public');
 for(let number=1;number<=13;number++)if(number!==5)assert.ok(fs.statSync(path.join(root,'assets/shields/shield'+number+'.webp')).size>0);
 assert.ok(!fs.existsSync(path.join(root,'assets/shields/shield5.webp')));
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8'),game=fs.readFileSync(path.join(root,'game.html'),'utf8');
 assert.equal(index,game);
 for(const id of ['skin-lobby-0','skin-lobby-1','skins-tab-level','skins-tab-free','skins-tab-my','skins-tab-flags','skins-tab-titles'])assert.ok(index.includes('id="'+id+'"'));
 assert.ok(!index.includes('id="btnOpenSkins"'));assert.ok(!index.includes('Vintage skin 01 is coming soon'));
});

test('all 263 included flags have assets and matching client/server validation; the excluded flag is unavailable',async()=>{
 const {FLAGS,normalizeCosmetics}=await frontend,root=path.join(__dirname,'../public/assets/flags');
 const files=fs.readdirSync(root).filter(file=>file.endsWith('.svg'));
 assert.equal(FLAGS.length,263);assert.equal(files.length,263);
 assert.equal(new Set(FLAGS.map(flag=>flag.id)).size,263);
 assert.ok(!FLAGS.some(flag=>flag.code==='IL'||flag.id==='1f1ee-1f1f1'));
 assert.ok(!files.includes('1f1ee-1f1f1.svg'));
 for(const flag of FLAGS){
  assert.ok(flag.name&&flag.englishName&&!flag.name.includes('?'));assert.ok(files.includes(flag.id+'.svg'));
  const player={};setCosmetics(player,{flagId:flag.id});assert.equal(player.flagId,flag.id);
  assert.equal(normalizeCosmetics({slots:[{flagId:flag.id}]}).slots[0].flagId,flag.id);
 }
 for(const flagId of ['1f1ee-1f1f1','../../private','missing','https://example.com/a.svg']){
  const player={};setCosmetics(player,{flagId});assert.equal(player.flagId,'');
  assert.equal(normalizeCosmetics({slots:[{flagId}]}).slots[0].flagId,'');
 }
});

test('a flag is independent of skins and shields and survives snapshot, split, and respawn',()=>{
 const room=core.createRoom('ffa');room.players.clear();const player=core.join(room,'FlagTester','');
 setCosmetics(player,{skinUrl:'/assets/skins/jax/featured-01.png',shieldId:'shield7',flagId:'1f1ea-1f1ec'});
 core.split(room,player);assert.equal(core.snapshot(room).players[0].flagId,'1f1ea-1f1ec');
 player.cells=[];core.respawn(room,player,6000,6000);assert.equal(core.snapshot(room).players[0].flagId,'1f1ea-1f1ec');
 setCosmetics(player,{skinUrl:player.skinUrl,shieldId:player.shieldId,flagId:''});
 assert.equal(player.shieldId,'shield7');assert.equal(player.skinUrl,'/assets/skins/jax/featured-01.png');
 assert.equal(core.snapshot(room).players[0].flagId,undefined);
});
