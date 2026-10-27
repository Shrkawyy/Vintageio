'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {createCollection}=require('../server/collection.cjs'),{TITLE_CATALOG}=require('../server/titles.cjs');
function fixture(t,freeTrial=true){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vintage-free-trial-')),file=path.join(dir,'collection.json'),store=createCollection({file,freeTrial});t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {store,file};}
async function browser(store){let cookie='';const req={headers:{host:'play.vintage.test','x-forwarded-for':'203.0.113.10'},socket:{remoteAddress:'198.51.100.1'}},res={setHeader(k,v){cookie=v.split(';')[0]},writeHead(){},end(){}};await store.handle({...req,url:'/collection/profile',method:'GET'},res);req.headers.cookie=cookie;return {req,id:store.identity(req)};}
const animated={mode:'animated',colors:['#112233','#445566','#778899','#AABBCC']};
test('all twenty titles and exclusive trial names work with zero coins and grant no paid title ownership',async t=>{
 const {store}=fixture(t),a=await browser(store),b=await browser(store);assert.equal(store.profile(a.id).freeTrial,true);assert.equal(store.profile(a.id).namePrice,0);assert.equal(store.profile(a.id).baseNamePrice,15000);
 for(const title of TITLE_CATALOG){store.buyTitle(a.id,title.id);assert.equal(store.activeTitle(a.req),title.id);assert.equal(store.profile(a.id).coins,0);assert.deepEqual(store.profile(a.id).ownedTitles,[]);}
 store.reserve(a.id,{name:'Free Pilot',nameStyle:animated});assert.equal(store.profile(a.id).names[0].trial,true);assert.deepEqual(store.appearance(a.req,'Free Pilot').nameStyle,animated);assert.equal(store.appearance(b.req,'FREE PILOT'),null);
 assert.throws(()=>store.reserve(b.id,{name:'free   pilot'}),/already reserved/);assert.throws(()=>store.rename(b.id,{id:'free pilot',name:'Stolen'}),/do not own/);
 store.rename(a.id,{id:'free pilot',name:'Free Pilot 2'});store.rename(a.id,{id:'free pilot 2',name:'Free Pilot 3'});assert.equal(store.profile(a.id).freeRenames,1);assert.equal(store.profile(a.id).coins,0);
});
test('ending the trial revokes free access on public and localhost sessions and restores paid name availability',async t=>{
 const {store,file}=fixture(t),a=await browser(store),b=await browser(store);store.reserve(a.id,{name:'Trial Only',nameStyle:animated});store.equipTitle(a.id,'goat');
 const closed=createCollection({file,freeTrial:false}),profile=closed.profile(a.id);assert.equal(profile.namePrice,15000);assert.deepEqual(profile.names,[]);assert.deepEqual(profile.ownedTitles,[]);assert.equal(closed.activeTitle(a.req),'');
 assert.equal(closed.activeTitle({...a.req,headers:{cookie:a.req.headers.cookie,host:'localhost'},socket:{remoteAddress:'127.0.0.1'}}),'');
 assert.equal(closed.appearance(a.req,'Trial Only').nameStyle,undefined);assert.throws(()=>closed.equipTitle(a.id,'goat'),/do not own/);assert.throws(()=>closed.buyTitle(a.id,'vip'),/75,000/);assert.throws(()=>closed.buyTitle(a.id,'yt'),/not on sale/);assert.throws(()=>closed.reserve(a.id,{name:'Trial Only'}),/15,000/);
 closed.credit(b.id,15000);closed.reserve(b.id,{name:'Trial Only'});assert.equal(closed.profile(b.id).names[0].trial,false);assert.equal(closed.appearance(a.req,'Trial Only'),null);
 const reopened=createCollection({file,freeTrial:true});assert.deepEqual(reopened.profile(a.id).names,[]);assert.equal(reopened.appearance(a.req,'Trial Only'),null);assert.equal(reopened.profile(b.id).names[0].trial,false);
});
test('paid names, title ownership, coin balances and rename allowance survive a free period',async t=>{
 const {store,file}=fixture(t,false),a=await browser(store);store.credit(a.id,250000);store.reserve(a.id,{name:'Paid Pilot',color:'#AABBCC'});store.buyTitle(a.id,'vip');store.rename(a.id,{id:'paid pilot',name:'Paid Pilot Two'});
 const free=createCollection({file,freeTrial:true});free.reserve(a.id,{name:'Temporary Pilot',nameStyle:animated});free.buyTitle(a.id,'goat');free.rename(a.id,{id:'temporary pilot',name:'Temporary Two'});
 assert.equal(free.profile(a.id).coins,160000);assert.equal(free.profile(a.id).freeRenames,0);assert.deepEqual(free.profile(a.id).ownedTitles,['vip']);
 const closed=createCollection({file,freeTrial:false});assert.equal(closed.activeTitle(a.req),'vip');assert.equal(closed.activeIdentity(a.req).name,'Paid Pilot Two');assert.equal(closed.activeIdentity(a.req).color,'#AABBCC');assert.equal(closed.profile(a.id).names.length,1);assert.equal(closed.profile(a.id).coins,160000);assert.equal(closed.profile(a.id).freeRenames,0);
});
test('production requests can use the public free mode, while disabling it blocks every free endpoint and forged pricing',async t=>{
 const original=process.env.NODE_ENV;process.env.NODE_ENV='production';t.after(()=>{if(original===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=original;});
 const {store,file}=fixture(t);let current=store;const server=http.createServer((req,res)=>current.handle(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port,first=await fetch(base+'/collection/profile'),cookie=first.headers.get('set-cookie').split(';')[0],headers={cookie,origin:base,'content-type':'application/json','x-forwarded-for':'203.0.113.12'};
 const post=(endpoint,data,extra={})=>fetch(base+'/collection/'+endpoint,{method:'POST',headers:{...headers,...extra},body:JSON.stringify(data)});
 let res=await post('reserve',{name:'Public Pilot',nameStyle:animated});assert.equal(res.status,200);assert.equal((await res.json()).coins,0);
 res=await post('title-preview',{id:'yt'});assert.equal(res.status,200);assert.equal((await res.json()).activeTitle,'yt');
 assert.equal((await post('reserve',{name:'Foreign Origin'},{origin:'https://other.example'})).status,403);
 current=createCollection({file,freeTrial:false});
 for(const [endpoint,data,status]of [['name-preview',{name:'Bypass'},403],['title-preview',{id:'goat'},403],['title-equip',{id:'goat'},403],['title-buy',{id:'vip'},409],['reserve',{name:'Bypass'},409]]){
  res=await post(endpoint,{...data,freeTrial:true,coins:999999});assert.equal(res.status,status,endpoint);
 }
 const profile=await (await fetch(base+'/collection/profile',{headers:{cookie}})).json();assert.equal(profile.freeTrial,false);assert.equal(profile.coins,0);assert.equal(profile.activeTitle,'');assert.equal(profile.names.length,0);
});
test('the server config enables testing by default and the environment can close or reopen it without code changes',async t=>{
 const {file}=fixture(t),original=process.env.COLLECTION_FREE_TRIAL;t.after(()=>{if(original===undefined)delete process.env.COLLECTION_FREE_TRIAL;else process.env.COLLECTION_FREE_TRIAL=original;});
 assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname,'../server/collection.config.json'),'utf8')).freeTrial,true);
 process.env.COLLECTION_FREE_TRIAL='0';let store=createCollection({file}),a=await browser(store);assert.equal(store.profile(a.id).freeTrial,false);
 process.env.COLLECTION_FREE_TRIAL='1';store=createCollection({file});assert.equal(store.profile(a.id).freeTrial,true);
 process.env.COLLECTION_FREE_TRIAL='invalid';assert.throws(()=>createCollection({file}),/must be 0 or 1/);
});
