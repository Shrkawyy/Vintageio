'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomBytes,createHash}=require('node:crypto');
const NAME_PRICE=15000;
const {TITLE_CATALOG,titleFor}=require('./titles.cjs');
const {normalizeNameStyle}=require('./identity.cjs');
const PACKS=Object.freeze([]); // Coin sales have been removed. Existing balances are retained.
const cleanName=value=>String(value||'').normalize('NFKC').replace(/[<>\u0000-\u001f\u007f]/g,'').trim().replace(/\s+/g,' ').slice(0,18);
const nameKey=value=>cleanName(value).toLowerCase();
const color=value=>/^#[0-9a-f]{6}$/i.test(String(value))?String(value).toUpperCase():'#FFFFFF';
function configuredFreeTrial(){
 const override=process.env.COLLECTION_FREE_TRIAL;
 if(override!==undefined){if(!['0','1'].includes(override))throw Error('COLLECTION_FREE_TRIAL must be 0 or 1');return override==='1';}
 const file=path.join(__dirname,'collection.config.json');if(!fs.existsSync(file))return false;
 return JSON.parse(fs.readFileSync(file,'utf8')).freeTrial===true;
}
function createCollection({file=path.join(__dirname,'data/collections.json'),freeTrial=configuredFreeTrial()}={}){
 if(typeof freeTrial!=='boolean')throw Error('freeTrial must be a boolean');
 let db={version:1,profiles:{},names:{}};
 if(fs.existsSync(file)){db=JSON.parse(fs.readFileSync(file,'utf8'));if(db.version!==1||!db.profiles||!db.names)throw Error('Unsupported collection database');}
 let persisted=JSON.stringify(db);
 function save(){try{fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(db));fs.renameSync(temp,file);persisted=JSON.stringify(db);}catch(e){db=JSON.parse(persisted);throw e;}}
 const fail=(message,status=400)=>{const e=Error(message);e.status=status;throw e;};
 const tokenId=token=>/^[a-f0-9]{64}$/.test(token||'')?createHash('sha256').update(token).digest('hex'):'';
 function identity(req){const token=String(req?.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('vintage_collection='))?.slice(19);const id=tokenId(token);return id&&db.profiles[id]?id:null;}
 function session(req,res){let id=identity(req);if(id)return id;const token=randomBytes(32).toString('hex');id=tokenId(token);db.profiles[id]={coins:0,freeRenames:1,owned:[],createdAt:Date.now()};save();res.setHeader('Set-Cookie',`vintage_collection=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${req.socket?.encrypted?'; Secure':''}`);return id;}
 const trialAccess=()=>freeTrial;
 const activeRecord=key=>{const n=db.names[key];return n&&(!n.trial||freeTrial)?n:null;};
 function activateName(id,key){const p=db.profiles[id],previous=db.names[p.activeName];if(previous?.owner===id&&!previous.trial)p.paidActiveName=p.activeName;p.activeName=key;if(!db.names[key]?.trial)p.paidActiveName=key;p.previewName=null;}
 function profile(id){const p=db.profiles[id];if(!p)fail('Collection profile not found',401);return{coins:p.coins,freeTrial,freeRenames:p.freeRenames,names:p.owned.flatMap(key=>{const n=activeRecord(key);return n?.owner===id?[{id:key,name:n.name,color:n.color,trial:!!n.trial,nameStyle:normalizeNameStyle(n.nameStyle,n.color)}]:[];}),titles:TITLE_CATALOG,titleStyles:p.titleStyles||{},ownedTitles:p.titles||[],equippedTitle:p.equippedTitle||'',namePrice:freeTrial?0:NAME_PRICE,baseNamePrice:NAME_PRICE,packs:PACKS,checkoutEnabled:false,offerEndsAt:null};}
 function activeTitle(req){const p=db.profiles[identity(req)];if(!p)return '';if(trialAccess(req)&&titleFor(p.previewTitle))return p.previewTitle;return (p.titles||[]).includes(p.equippedTitle)&&titleFor(p.equippedTitle)?p.equippedTitle:'';}
 function activeIdentity(req){const id=identity(req),p=db.profiles[id];if(!p)return null;const titleId=activeTitle(req),current=activeRecord(p.activeName),paid=activeRecord(p.paidActiveName),record=current?.owner===id?current:paid?.owner===id?paid:null;const style=trialAccess(req)&&p.previewName?p.previewName:record||p.titleStyles?.[titleId];if(!style&&!titleId)return null;const chosen=color(style?.color||titleFor(titleId)?.color);return {name:style?.name||'',color:chosen,nameStyle:normalizeNameStyle(style?.nameStyle,chosen),titleId};}
 function titleProfile(id,req){return {...profile(id),activeTitle:activeTitle(req),activeIdentity:activeIdentity(req),previewingTitle:trialAccess(req)&&!!db.profiles[id]?.previewTitle};}
 function checkedStyle(id,titleId,input={}){if(input.name===undefined&&input.color===undefined&&input.nameStyle===undefined)return null;const name=cleanName(input.name),record=activeRecord(nameKey(name));if(name.length<2)fail('Use a name with at least 2 characters');if(record&&record.owner!==id)fail('This name is reserved by another player',409);const style=normalizeNameStyle(input.nameStyle,input.color||titleFor(titleId)?.color);return {name,color:style.colors[0],nameStyle:style};}
 function setStyle(id,titleId,style){if(!style)return;const p=db.profiles[id];(p.titleStyles??={})[titleId]=style;const record=activeRecord(nameKey(style.name));if(record?.owner===id){record.color=style.color;record.nameStyle=style.nameStyle;}}
 function buyTitle(id,titleId,input={}){const p=db.profiles[id],item=titleFor(titleId);if(!p)fail('Collection profile not found',401);if(!item)fail('Unknown title');if((p.titles||[]).includes(titleId))fail('You already own this title',409);if(!freeTrial&&item.price===null)fail('YT is not on sale yet');if(!freeTrial&&p.coins<item.price)fail('You need '+item.price.toLocaleString('en-US')+' coins for this title',409);const style=checkedStyle(id,titleId,input);if(freeTrial){p.previewTitle=titleId;}else{p.coins-=item.price;(p.titles??=[]).push(titleId);p.equippedTitle=titleId;p.previewTitle='';}setStyle(id,titleId,style);save();return profile(id);}
 function equipTitle(id,titleId,input={}){const p=db.profiles[id];if(!p)fail('Collection profile not found',401);if(titleId&&!(p.titles||[]).includes(titleId)){if(freeTrial)return buyTitle(id,titleId,input);fail('You do not own this title',403);}const style=titleId?checkedStyle(id,titleId,input):null;p.equippedTitle=titleId||'';p.previewTitle='';if(titleId)setStyle(id,titleId,style);save();return profile(id);}
 function reserve(id,input){const p=db.profiles[id],name=cleanName(input.name),key=nameKey(name),price=freeTrial?0:NAME_PRICE;if(!p)fail('Collection profile not found',401);if(name.length<2)fail('Use a name with at least 2 characters');if(activeRecord(key))fail('This name is already reserved',409);if(p.coins<price)fail('You need 15,000 coins to reserve a name',409);const style=normalizeNameStyle(input.nameStyle,input.color);p.coins-=price;if(!p.owned.includes(key))p.owned.push(key);db.names[key]={owner:id,name,color:style.colors[0],nameStyle:style,...(freeTrial?{trial:true}:{}),createdAt:Date.now()};activateName(id,key);save();return profile(id);}
 function rename(id,input){const p=db.profiles[id],oldKey=String(input.id||''),record=activeRecord(oldKey);if(!p||!record||record.owner!==id)fail('You do not own this name',403);if(!record.trial&&!p.freeRenames)fail('Your free name change has already been used',409);const name=cleanName(input.name),key=nameKey(name);if(name.length<2)fail('Use a name with at least 2 characters');if(key===oldKey)fail('Choose a different name');if(activeRecord(key))fail('This name is already reserved',409);const style=normalizeNameStyle(input.nameStyle??record.nameStyle,input.color||record.color);delete db.names[oldKey];db.names[key]={...record,name,color:style.colors[0],nameStyle:style};p.owned=p.owned.filter(k=>k!==key);p.owned[p.owned.indexOf(oldKey)]=key;activateName(id,key);if(!record.trial)p.freeRenames--;save();return profile(id);}
 function appearance(req,name){const record=activeRecord(nameKey(name)),chosen=activeIdentity(req);if(!record){const style=chosen?.name&&nameKey(chosen.name)===nameKey(name)?chosen:null;return {name:cleanName(name),nameColor:style?.color||'',...(style?{nameStyle:style.nameStyle}:{})};}if(record.owner!==identity(req))return null;return {name:record.name,nameColor:record.color,nameStyle:normalizeNameStyle(record.nameStyle,record.color)};}
 function nameColor(id,input){const record=activeRecord(input.id);if(!record||record.owner!==id)fail('You do not own this name',403);record.nameStyle=normalizeNameStyle(input.nameStyle,input.color);record.color=record.nameStyle.colors[0];activateName(id,input.id);save();return profile(id);}
 function equipName(id,key){const record=activeRecord(key);if(!record||record.owner!==id)fail('You do not own this name',403);activateName(id,key);save();return profile(id);}
 async function handle(req,res){
  const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith('/collection/'))return false;
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));return true;};
  try{
   if(req.method==='GET'&&u.pathname==='/collection/profile'){const id=session(req,res);return json(200,titleProfile(id,req));}
   if(req.method!=='POST')return json(405,{error:'Method not allowed'});
   // Never accept cookie-authorized mutations from another website.
   if(req.headers.origin){const origin=new URL(req.headers.origin);if(origin.host!==req.headers.host)return json(403,{error:'Invalid request origin'});}
   if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(415,{error:'Use application/json'});
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)return json(413,{error:'Request too large'});}
   const data=JSON.parse(raw||'{}'),id=identity(req);if(!id)return json(401,{error:'Open your collection first'});
   if(u.pathname==='/collection/reserve'){reserve(id,data);return json(200,titleProfile(id,req));}
   if(u.pathname==='/collection/rename'){rename(id,data);return json(200,titleProfile(id,req));}
   if(u.pathname==='/collection/name-color'){nameColor(id,data);return json(200,titleProfile(id,req));}
   if(u.pathname==='/collection/name-equip'){equipName(id,data.id);return json(200,titleProfile(id,req));}
   if(u.pathname==='/collection/name-preview'){
    if(!trialAccess(req))return json(403,{error:'The free testing period has ended'});
    const style=checkedStyle(id,'',data);if(!style)fail('Choose a name and colors');db.profiles[id].previewName=style;save();return json(200,titleProfile(id,req));
   }
   if(u.pathname==='/collection/title-buy'){buyTitle(id,data.id,data);return json(200,titleProfile(id,req));}
   if(u.pathname==='/collection/title-equip'){equipTitle(id,data.id,data);return json(200,titleProfile(id,req));}
   if(u.pathname==='/collection/title-preview'){
    if(!trialAccess(req))return json(403,{error:'The free testing period has ended'});
    if(data.id&&!titleFor(data.id))return json(400,{error:'Unknown title'});
    const style=data.id?checkedStyle(id,data.id,data):null;
    db.profiles[id].previewTitle=data.id||'';if(data.id)setStyle(id,data.id,style);save();return json(200,titleProfile(id,req));
   }
   if(u.pathname==='/collection/checkout')return json(503,{error:'Coin purchases are unavailable.'});
   return json(404,{error:'Not found'});
  }catch(e){return json(e.status||400,{error:e.status?e.message:'The request could not be completed'});}
 }
 // Server-side crediting is intentionally not exposed as an HTTP route.
 function credit(id,amount){if(!Number.isSafeInteger(amount)||amount<=0||amount>1000000)fail('Invalid coin amount');if(!db.profiles[id])fail('Collection profile not found');db.profiles[id].coins+=amount;save();return profile(id);}
 return {handle,appearance,identity,profile,reserve,rename,credit,activeTitle,activeIdentity,buyTitle,equipTitle};
}
module.exports={createCollection,NAME_PRICE,PACKS,cleanName,nameKey};
