'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomBytes,createHash}=require('node:crypto');
const NAME_PRICE=15000;
const {TITLE_CATALOG,titleFor}=require('./titles.cjs');
const {normalizeNameStyle}=require('./identity.cjs');
// Local trials never grant ownership or spend coins, and cannot be used remotely.
function localTitlePreview(req){
 if(process.env.NODE_ENV==='production')return false;
 try{const host=new URL('http://'+req.headers.host).hostname,peer=req.socket?.remoteAddress;
  return !req.headers['x-forwarded-for']&&['localhost','127.0.0.1','[::1]'].includes(host)&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer);
 }catch{return false;}
}
const PACKS=Object.freeze([]); // Coin sales have been removed. Existing balances are retained.
const cleanName=value=>String(value||'').normalize('NFKC').replace(/[<>\u0000-\u001f\u007f]/g,'').trim().replace(/\s+/g,' ').slice(0,18);
const nameKey=value=>cleanName(value).toLowerCase();
const color=value=>/^#[0-9a-f]{6}$/i.test(String(value))?String(value).toUpperCase():'#FFFFFF';
function createCollection({file=path.join(__dirname,'data/collections.json'),offerEndsAt=process.env.COIN_OFFER_ENDS_AT||''}={}){
 let db={version:1,profiles:{},names:{}};
 if(fs.existsSync(file)){db=JSON.parse(fs.readFileSync(file,'utf8'));if(db.version!==1||!db.profiles||!db.names)throw Error('Unsupported collection database');}
 let persisted=JSON.stringify(db);
 function save(){try{fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(db));fs.renameSync(temp,file);persisted=JSON.stringify(db);}catch(e){db=JSON.parse(persisted);throw e;}}
 const fail=(message,status=400)=>{const e=Error(message);e.status=status;throw e;};
 const tokenId=token=>/^[a-f0-9]{64}$/.test(token||'')?createHash('sha256').update(token).digest('hex'):'';
 function identity(req){const token=String(req?.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('vintage_collection='))?.slice(19);const id=tokenId(token);return id&&db.profiles[id]?id:null;}
 function session(req,res){let id=identity(req);if(id)return id;const token=randomBytes(32).toString('hex');id=tokenId(token);db.profiles[id]={coins:0,freeRenames:1,owned:[],createdAt:Date.now()};save();res.setHeader('Set-Cookie',`vintage_collection=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${req.socket?.encrypted?'; Secure':''}`);return id;}
 function profile(id){const p=db.profiles[id];if(!p)fail('Collection profile not found',401);return{coins:p.coins,freeRenames:p.freeRenames,names:p.owned.map(key=>{const n=db.names[key];return {id:key,name:n.name,color:n.color,nameStyle:normalizeNameStyle(n.nameStyle,n.color)};}),titles:TITLE_CATALOG,titleStyles:p.titleStyles||{},ownedTitles:p.titles||[],equippedTitle:p.equippedTitle||'',namePrice:NAME_PRICE,packs:PACKS,checkoutEnabled:false,offerEndsAt:null};}
 function activeTitle(req){const p=db.profiles[identity(req)];if(!p)return '';if(localTitlePreview(req)&&titleFor(p.previewTitle))return p.previewTitle;return (p.titles||[]).includes(p.equippedTitle)&&titleFor(p.equippedTitle)?p.equippedTitle:'';}
 function activeIdentity(req){const id=identity(req),p=db.profiles[id];if(!p)return null;const titleId=activeTitle(req),record=db.names[p.activeName];const style=localTitlePreview(req)&&p.previewName?p.previewName:record?.owner===id?record:p.titleStyles?.[titleId];if(!style&&!titleId)return null;const chosen=color(style?.color||titleFor(titleId)?.color);return {name:style?.name||'',color:chosen,nameStyle:normalizeNameStyle(style?.nameStyle,chosen),titleId};}
 function titleProfile(id,req){return {...profile(id),localTitlePreview:localTitlePreview(req),activeTitle:activeTitle(req),activeIdentity:activeIdentity(req),previewingTitle:localTitlePreview(req)&&!!db.profiles[id]?.previewTitle};}
 function checkedStyle(id,titleId,input={}){if(input.name===undefined&&input.color===undefined&&input.nameStyle===undefined)return null;const name=cleanName(input.name),record=db.names[nameKey(name)];if(name.length<2)fail('Use a name with at least 2 characters');if(record&&record.owner!==id)fail('This name is reserved by another player',409);const style=normalizeNameStyle(input.nameStyle,input.color||titleFor(titleId)?.color);return {name,color:style.colors[0],nameStyle:style};}
 function setStyle(id,titleId,style){if(!style)return;const p=db.profiles[id];(p.titleStyles??={})[titleId]=style;const record=db.names[nameKey(style.name)];if(record?.owner===id){record.color=style.color;record.nameStyle=style.nameStyle;}}
 function buyTitle(id,titleId,input={}){const p=db.profiles[id],item=titleFor(titleId);if(!p)fail('Collection profile not found',401);if(!item)fail('Unknown title');if(item.price===null)fail('YT is not on sale yet');if((p.titles||[]).includes(titleId))fail('You already own this title',409);if(p.coins<item.price)fail('You need '+item.price.toLocaleString('en-US')+' coins for this title',409);const style=checkedStyle(id,titleId,input);p.coins-=item.price;(p.titles??=[]).push(titleId);p.equippedTitle=titleId;p.previewTitle='';setStyle(id,titleId,style);save();return profile(id);}
 function equipTitle(id,titleId,input={}){const p=db.profiles[id];if(!p)fail('Collection profile not found',401);if(titleId&&!(p.titles||[]).includes(titleId))fail('You do not own this title',403);const style=titleId?checkedStyle(id,titleId,input):null;p.equippedTitle=titleId||'';p.previewTitle='';if(titleId)setStyle(id,titleId,style);save();return profile(id);}
 function reserve(id,input){const p=db.profiles[id],name=cleanName(input.name),key=nameKey(name);if(!p)fail('Collection profile not found',401);if(name.length<2)fail('Use a name with at least 2 characters');if(db.names[key])fail('This name is already reserved',409);if(p.coins<NAME_PRICE)fail('You need 15,000 coins to reserve a name',409);const style=normalizeNameStyle(input.nameStyle,input.color);p.coins-=NAME_PRICE;p.owned.push(key);db.names[key]={owner:id,name,color:style.colors[0],nameStyle:style,createdAt:Date.now()};p.activeName=key;p.previewName=null;save();return profile(id);}
 function rename(id,input){const p=db.profiles[id],oldKey=String(input.id||''),record=db.names[oldKey];if(!p||!record||record.owner!==id)fail('You do not own this name',403);if(!p.freeRenames)fail('Your free name change has already been used',409);const name=cleanName(input.name),key=nameKey(name);if(name.length<2)fail('Use a name with at least 2 characters');if(key===oldKey)fail('Choose a different name');if(db.names[key])fail('This name is already reserved',409);const style=normalizeNameStyle(input.nameStyle??record.nameStyle,input.color||record.color);delete db.names[oldKey];db.names[key]={...record,name,color:style.colors[0],nameStyle:style};p.owned[p.owned.indexOf(oldKey)]=key;p.activeName=key;p.previewName=null;p.freeRenames--;save();return profile(id);}
 function appearance(req,name){const record=db.names[nameKey(name)],chosen=activeIdentity(req);if(!record){const style=chosen?.name&&nameKey(chosen.name)===nameKey(name)?chosen:null;return {name:cleanName(name),nameColor:style?.color||'',...(style?{nameStyle:style.nameStyle}:{})};}if(record.owner!==identity(req))return null;return {name:record.name,nameColor:record.color,nameStyle:normalizeNameStyle(record.nameStyle,record.color)};}
 function nameColor(id,input){const record=db.names[input.id];if(!record||record.owner!==id)fail('You do not own this name',403);record.nameStyle=normalizeNameStyle(input.nameStyle,input.color);record.color=record.nameStyle.colors[0];db.profiles[id].activeName=input.id;db.profiles[id].previewName=null;save();return profile(id);}
 function equipName(id,key){const record=db.names[key];if(!record||record.owner!==id)fail('You do not own this name',403);db.profiles[id].activeName=key;db.profiles[id].previewName=null;save();return profile(id);}
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
    if(!localTitlePreview(req))return json(403,{error:'Free name trials are available on localhost only'});
    const style=checkedStyle(id,'',data);if(!style)fail('Choose a name and colors');db.profiles[id].previewName=style;save();return json(200,titleProfile(id,req));
   }
   if(u.pathname==='/collection/title-buy'){buyTitle(id,data.id,data);return json(200,titleProfile(id,req));}
   if(u.pathname==='/collection/title-equip'){equipTitle(id,data.id,data);return json(200,titleProfile(id,req));}
   if(u.pathname==='/collection/title-preview'){
    if(!localTitlePreview(req))return json(403,{error:'Free title trials are available on localhost only'});
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
module.exports={createCollection,NAME_PRICE,PACKS,cleanName,nameKey,localTitlePreview};
