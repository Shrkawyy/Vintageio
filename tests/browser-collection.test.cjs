'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{url}=require('./helpers/game-module.cjs');
const modulePromise=import(url('browser-collection.js'));
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};};
const missing=()=>new Response('Not Found',{status:404}),config={browserCollectionTrial:true,wsUrl:'',regions:{EU:[{wsUrl:''}]}};

test('static hosting can try every title and persist animated names without granting paid ownership or coins',async()=>{
 const {createCollectionTransport}=await modulePromise,saved=storage(),request=createCollectionTransport({fetcher:async()=>missing(),getConfig:()=>config,getStorage:()=>saved});
 let p=await request('profile');assert.equal(p.browserPreview,true);assert.equal(p.freeTrial,true);assert.equal(p.titles.length,20);
 for(const title of p.titles){p=await request('title-preview',{id:title.id});assert.equal(p.activeTitle,title.id);assert.deepEqual(p.ownedTitles,[]);assert.equal(p.coins,0);}
 const nameStyle={mode:'animated',colors:['#112233','#445566','#778899','#AABBCC']};
 p=await request('reserve',{name:'Browser Pilot',nameStyle});assert.equal(p.activeIdentity.name,'Browser Pilot');assert.deepEqual(p.activeIdentity.nameStyle,nameStyle);
 p=await request('rename',{id:'browser pilot',name:'Browser Two'});p=await request('rename',{id:'browser two',name:'Browser Three'});assert.equal(p.freeRenames,1);
 const reopened=createCollectionTransport({fetcher:async()=>missing(),getConfig:()=>config,getStorage:()=>saved});p=await reopened('profile');assert.equal(p.activeIdentity.name,'Browser Three');assert.equal(p.activeTitle,'vintage-legend');assert.equal(p.names.length,1);assert.equal(p.coins,0);
 await assert.rejects(request('reserve',{name:'BROWSER THREE'}),/already/);await assert.rejects(request('title-preview',{id:'unknown'}),/Unknown/);
});

test('a real collection server remains authoritative, including paid-mode denials',async()=>{
 const {createCollectionTransport}=await modulePromise,calls=[],request=createCollectionTransport({getConfig:()=>config,fetcher:async(path,options)=>{
  calls.push([path,options.method||'GET']);return path.endsWith('/profile')?Response.json({freeTrial:false,namePrice:15000}):Response.json({error:'You do not own this title'},{status:403});
 }});
 assert.equal((await request('profile')).freeTrial,false);await assert.rejects(request('title-equip',{id:'goat'}),/do not own/);assert.deepEqual(calls,[['/collection/profile','GET'],['/collection/title-equip','POST']]);
});

test('offline previews require an explicit opt-in and are blocked when any online world is configured',async()=>{
 const {createCollectionTransport,allowsBrowserTrial}=await modulePromise;
 for(const settings of [{},{...config,browserCollectionTrial:false},{...config,wsUrl:'wss://game.example'},{...config,regions:{EU:[{wsUrl:'wss://game.example'}]}}]){
  assert.equal(allowsBrowserTrial(settings),false);const request=createCollectionTransport({fetcher:async()=>missing(),getConfig:()=>settings});await assert.rejects(request('profile'),/server is unavailable/);
 }
});

test('network failures, server errors and failed mutations cannot silently create a browser collection',async()=>{
 const {createCollectionTransport}=await modulePromise;
 for(const fetcher of [async()=>{throw Error('Network disconnected')},async()=>new Response('Unavailable',{status:500}),async()=>Response.json({error:'Forbidden'},{status:403})]){
  const request=createCollectionTransport({fetcher,getConfig:()=>config});await assert.rejects(request('profile'));
 }
 const request=createCollectionTransport({fetcher:async()=>missing(),getConfig:()=>config});await assert.rejects(request('title-preview',{id:'vip'}),/server is unavailable/);
});

test('closing browser testing or adding an online endpoint blocks an already selected preview transport',async()=>{
 const {createCollectionTransport}=await modulePromise;let settings=config;const request=createCollectionTransport({fetcher:async()=>missing(),getConfig:()=>settings,getStorage:()=>storage()});
 await request('profile');settings={...config,browserCollectionTrial:false};await assert.rejects(request('title-preview',{id:'goat'}),/unavailable/);
 settings={...config,wsUrl:'wss://game.example'};await assert.rejects(request('profile'),/unavailable/);
});

test('browser previews sanitize stored styles, share changes across tabs and report blocked storage',async()=>{
 const {createBrowserCollection}=await modulePromise,saved=storage(),first=createBrowserCollection({getStorage:()=>saved}),second=createBrowserCollection({getStorage:()=>saved});
 await first('reserve',{name:'<First>',nameStyle:{mode:'animated',colors:['javascript:bad']}});await second('reserve',{name:'Second'});
 const p=await first('profile');assert.equal(p.names.length,2);assert.equal(p.activeIdentity.name,'Second');assert.ok(p.names[0].nameStyle.colors.every(c=>/^#[A-F0-9]{6}$/.test(c)));assert.equal(p.names[0].name,'First');
 const blocked=createBrowserCollection({getStorage:()=>{throw Error('Blocked')}});await assert.rejects(blocked('title-preview',{id:'vip'}),/Allow browser storage/);assert.equal((await blocked('profile')).activeTitle,'');
});
