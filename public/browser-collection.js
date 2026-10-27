import {TITLE_CATALOG,titleFor} from './titles.js?v=static-free-trial-oct27-9';
import {normalizeNameStyle} from './identity.js?v=static-free-trial-oct27-9';

const KEY='vintage.browser-collection-trial.v1';
const cleanName=value=>String(value||'').normalize('NFKC').replace(/[<>\u0000-\u001f\u007f]/g,'').trim().replace(/\s+/g,' ').slice(0,18);
const nameKey=value=>cleanName(value).toLowerCase();
export function allowsBrowserTrial(config={}){
 if(config.browserCollectionTrial!==true||String(config.wsUrl||'').trim())return false;
 return !Object.values(config.regions||{}).some(servers=>Array.isArray(servers)&&servers.some(server=>String(server?.wsUrl||'').trim()));
}

// This is a device-local cosmetic preview, never a replacement for a game server's ownership checks.
export function createBrowserCollection({getStorage=()=>globalThis.localStorage}={}){
 function read(){
  let saved;try{saved=JSON.parse(getStorage()?.getItem(KEY)||'null');}catch{}
  const names=[];
  if(saved?.version===1&&Array.isArray(saved.names))for(const item of saved.names.slice(0,64)){
   const name=cleanName(item?.name),id=nameKey(name);if(name.length<2||names.some(n=>n.id===id))continue;
   const nameStyle=normalizeNameStyle(item.nameStyle,item.color);names.push({id,name,color:nameStyle.colors[0],nameStyle,trial:true});
  }
  return {version:1,names,activeName:names.some(n=>n.id===saved?.activeName)?saved.activeName:'',activeTitle:titleFor(saved?.activeTitle)?.id||''};
 }
 function profile(db){
  const name=db.names.find(n=>n.id===db.activeName),title=titleFor(db.activeTitle),color=name?.color||title?.color||'#FFFFFF';
  return {coins:0,freeTrial:true,browserPreview:true,freeRenames:1,names:db.names,titles:TITLE_CATALOG,titleStyles:{},ownedTitles:[],equippedTitle:'',activeTitle:db.activeTitle,previewingTitle:!!db.activeTitle,namePrice:0,baseNamePrice:15000,packs:[],checkoutEnabled:false,offerEndsAt:null,activeIdentity:name||title?{name:name?.name||'',color,nameStyle:normalizeNameStyle(name?.nameStyle,color),titleId:db.activeTitle}:null};
 }
 return async function request(endpoint,input={}){
  const db=read();if(endpoint==='profile')return profile(db);
  if(['title-preview','title-equip','title-buy'].includes(endpoint)){
   if(input.id&&!titleFor(input.id))throw Error('Unknown title');db.activeTitle=input.id||'';
  }else if(['reserve','rename','name-color','name-equip'].includes(endpoint)){
   if(endpoint==='name-equip'){
    if(!db.names.some(n=>n.id===input.id))throw Error('This preview name was not found');db.activeName=input.id;
   }else{
    const old=endpoint==='reserve'?null:db.names.find(n=>n.id===input.id);
    if(endpoint!=='reserve'&&!old)throw Error('This preview name was not found');
    const name=endpoint==='name-color'?old.name:cleanName(input.name),id=nameKey(name);
    if(name.length<2)throw Error('Use a name with at least 2 characters');
    if(db.names.some(n=>n.id===id&&n!==old))throw Error('This name is already in your previews');
    if(!old&&db.names.length>=64)throw Error('You can save up to 64 preview names on this device');
    const nameStyle=normalizeNameStyle(input.nameStyle??old?.nameStyle,input.color||old?.color),item={id,name,color:nameStyle.colors[0],nameStyle,trial:true};
    if(old)db.names[db.names.indexOf(old)]=item;else db.names.push(item);db.activeName=id;
   }
  }else throw Error('This action requires the collection server');
  try{const storage=getStorage();if(!storage)throw Error();storage.setItem(KEY,JSON.stringify(db));}
  catch{throw Error('Allow browser storage to save your free previews on this device.');}
  return profile(db);
 };
}

export function createCollectionTransport({fetcher=(...args)=>fetch(...args),getConfig=()=>globalThis.VINTAGE_CONFIG||{},getStorage}={}){
 let browser=null;
 return async function request(endpoint,data){
  if(browser){if(!allowsBrowserTrial(getConfig()))throw Error('Browser testing is currently unavailable. Reload the page.');return browser(endpoint,data);}
  const response=await fetcher('/collection/'+endpoint,{credentials:'same-origin',headers:data?{'Content-Type':'application/json'}:{},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
  if(response.status===404&&endpoint==='profile'&&!data&&allowsBrowserTrial(getConfig())){
   browser??=createBrowserCollection({getStorage});return browser('profile');
  }
  let body;try{body=await response.json();}catch{throw Error('The collection server is unavailable. Please try again later.');}
  if(!response.ok)throw Error(body.error||'Please try again');return body;
 };
}
