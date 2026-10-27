'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {createCollection}=require('../server/collection.cjs'),{TITLE_CATALOG,normalizeTitlePosition,titleBadgeSvg}=require('../server/titles.cjs'),{normalizeNameStyle,namePaint}=require('../server/identity.cjs'),{setCosmetics}=require('../server/cosmetics.cjs'),core=require('../server/core.cjs');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vintage-identity-')),file=path.join(dir,'profiles.json'),store=createCollection({file,freeTrial:false});t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {store,file};}
async function browser(store){let cookie='';const req={headers:{},socket:{}},res={setHeader(k,v){cookie=v.split(';')[0]},writeHead(){},end(){}};await store.handle({...req,url:'/collection/profile',method:'GET'},res);req.headers.cookie=cookie;return {req,id:store.identity(req)};}
test('twenty original title designs have unique IDs, trusted SVGs and existing VIP/GOAT prices',()=>{
 assert.equal(TITLE_CATALOG.length,20);assert.equal(new Set(TITLE_CATALOG.map(t=>t.id)).size,20);assert.equal(new Set(TITLE_CATALOG.map(titleBadgeSvg)).size,20);
 assert.equal(TITLE_CATALOG.find(t=>t.id==='vip').price,75000);assert.equal(TITLE_CATALOG.find(t=>t.id==='goat').price,100000);
 for(const t of TITLE_CATALOG){assert.match(titleBadgeSvg(t),/^<svg /);assert.ok(!/https?:\/\/(?!www.w3.org)|<script|onload=/i.test(titleBadgeSvg(t)));}
 assert.equal(titleBadgeSvg({id:'killer',label:'<script>'}),'');
});
test('static and animated name colors are bounded and canvas animation changes with time',()=>{
 const style=normalizeNameStyle({mode:'animated',colors:['#112233','url(evil)','#aabbcc','#ffffff','#000000']});
 assert.equal(style.colors.length,4);assert.equal(style.colors[0],'#112233');assert.equal(style.colors[2],'#AABBCC');assert.ok(style.colors.every(c=>/^#[0-9A-F]{6}$/.test(c)));
 const samples=[],ctx={createLinearGradient(){const stops=[];samples.push(stops);return {addColorStop:(n,c)=>stops.push([n,c])}}};
 namePaint(ctx,style,'#ffffff',0,0,100,0);namePaint(ctx,style,'#ffffff',0,0,100,.8);assert.notDeepEqual(samples[0],samples[1]);assert.equal(namePaint(ctx,{mode:'static',colors:['#123456']},'#fff',0,0,100,.8),'#123456');
});
test('animated signatures persist across color edits, one rename, reload and a separate title purchase',async t=>{
 const {store,file}=fixture(t),a=await browser(store),nameStyle={mode:'animated',colors:['#112233','#445566','#778899','#AABBCC']};store.credit(a.id,100000);store.reserve(a.id,{name:'Identity',nameStyle});
 assert.deepEqual(store.appearance(a.req,'Identity').nameStyle,nameStyle);store.rename(a.id,{id:'identity',name:'Identity Two'});assert.deepEqual(store.appearance(a.req,'Identity Two').nameStyle,nameStyle);assert.equal(store.profile(a.id).freeRenames,0);
 store.buyTitle(a.id,'killer');assert.equal(store.activeIdentity(a.req).name,'Identity Two');assert.deepEqual(store.activeIdentity(a.req).nameStyle,nameStyle);
 const reloaded=createCollection({file,freeTrial:false});assert.equal(reloaded.activeTitle(a.req),'killer');assert.deepEqual(reloaded.appearance(a.req,'Identity Two').nameStyle,nameStyle);assert.equal(reloaded.profile(a.id).coins,65000);
 const other=await browser(reloaded);assert.equal(reloaded.appearance(other.req,'Identity Two'),null);assert.throws(()=>reloaded.equipTitle(other.id,'killer'),/do not own/);
});
test('title placement stays inside the cell, remains independent per connection and survives snapshots',()=>{
 const room=core.createRoom('ffa');room.players.clear();const a=core.join(room,'Placement',''),b=core.join(room,'Other','');
 setCosmetics(a,{titlePosition:{x:5,y:5}});setCosmetics(b,{titlePosition:{x:-.3,y:.2}});assert.ok(Math.hypot(a.titlePosition.x,a.titlePosition.y)<.781);assert.deepEqual(b.titlePosition,{x:-.3,y:.2});
 a.titleId='killer';a.nameStyle={mode:'animated',colors:['#112233','#445566','#778899','#AABBCC']};
 const snap=core.snapshot(room).players.find(p=>p.id===a.id);assert.deepEqual(snap.titlePosition,a.titlePosition);assert.deepEqual(snap.nameStyle,a.nameStyle);assert.deepEqual(normalizeTitlePosition({x:NaN,y:Infinity}),{x:0,y:-.48});
});
test('paid mode blocks free name previews even on localhost and does not issue coins',async t=>{
 const {store}=fixture(t),server=http.createServer((req,res)=>store.handle(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port,first=await fetch(base+'/collection/profile'),cookie=first.headers.get('set-cookie').split(';')[0],headers={cookie,'content-type':'application/json'},body=JSON.stringify({name:'Local Signature',nameStyle:{mode:'animated',colors:['#112233','#445566','#778899','#AABBCC']}});
 let res=await fetch(base+'/collection/name-preview',{method:'POST',headers,body});assert.equal(res.status,403);const profile=await (await fetch(base+'/collection/profile',{headers:{cookie}})).json();assert.equal(profile.coins,0);assert.equal(profile.names.length,0);assert.equal(profile.activeIdentity,null);
 res=await fetch(base+'/collection/name-preview',{method:'POST',headers:{...headers,'x-forwarded-for':'198.51.100.4'},body});assert.equal(res.status,403);
});
test('replays copy animated colors and title placement without retaining mutable input objects',async()=>{
 const {url}=require('./helpers/game-module.cjs'),{ReplayBuffer}=await import(url('replays.js')),buffer=new ReplayBuffer();
 const nameStyle={mode:'animated',colors:['#112233','#445566','#778899','#AABBCC']},titlePosition={x:.2,y:-.4},state={mode:'mega',players:[{id:'p',name:'Identity',titleId:'killer',nameStyle,titlePosition,cells:[{x:1000,y:1000,mass:5000}]}],food:[]};
 buffer.capture(0,state,{});nameStyle.colors[0]='#FFFFFF';titlePosition.x=.7;buffer.capture(1000,state,{});const clip=buffer.clip({});assert.equal(clip.frames[0].state.players[0].nameStyle.colors[0],'#112233');assert.equal(clip.frames[0].state.players[0].titlePosition.x,.2);
});
