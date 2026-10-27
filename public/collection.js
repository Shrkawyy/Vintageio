import {normalizeNameStyle,applyNameStyle,SIGNATURE_COLORS} from './identity.js?v=static-free-trial-oct27-9';
import {createCollectionTransport} from './browser-collection.js?v=static-free-trial-oct27-9';
export function mountCollection({releaseInputs,toast,onEquip,onTitleChange=()=>{},onOpenTitles=()=>{}}){
 const $=id=>document.getElementById(id),overlay=$('collection-overlay');
 let profile=null,editing=null,trigger=null,busy=false,revision=0,applied='';const transport=createCollectionTransport();
 const isOpen=()=>!overlay.classList.contains('hidden'),activeTitle=()=>profile?.activeTitle||'',activeIdentity=()=>profile?.activeIdentity||null;
 const appearance=name=>profile?.names.find(n=>n.name.toLowerCase()===String(name||'').trim().toLowerCase())||null;
 function status(text,error=false){$('collection-status').textContent=text;$('collection-status').classList.toggle('error',error);}
 async function request(endpoint,data){if(data)revision++;return transport(endpoint,data);}
 function style(){return normalizeNameStyle({mode:$('reserved-name-mode').value,colors:Array.from({length:4},(_,i)=>$(i?'reserved-name-color-'+i:'reserved-name-color').value)});}
 function preview(){const animated=$('reserved-name-mode').value==='animated';$('signature-extra-colors').hidden=!animated;$('reserved-name-preview').textContent=$('reserved-name-input').value.trim()||'Your signature';applyNameStyle($('reserved-name-preview'),style());}
 function choose(item=null){
  editing=item?.id||null;const identity=item||activeIdentity(),s=normalizeNameStyle(identity?.nameStyle,identity?.color);
  $('reserved-name-input').value=identity?.name||$('nickname').value||'Vintage Player';
  $('reserved-name-input').readOnly=!!editing&&!profile?.freeRenames&&!(profile?.freeTrial&&item?.trial);$('reserved-name-mode').value=s.mode;
  s.colors.forEach((color,i)=>$(i?'reserved-name-color-'+i:'reserved-name-color').value=color);
  $('reserved-name-cancel').hidden=!editing;update();preview();
 }
 function update(){
  $('reserve-name-submit').textContent=editing?'SAVE & USE SIGNATURE':profile?.freeTrial?'USE NAME / FREE TRIAL':'LOCK NAME / 15,000 COINS';
  $('reserve-name-submit').disabled=busy||!profile;
  $('reserved-style-hint').textContent=profile?.freeTrial?'Names and both color modes are open for free testing. Trial access is temporary.':editing?'Color changes are free. Changing the name uses your one free rename.':'One locked name, two color modes. Static color or a moving blend of four colors.';
 }
 function render(){
  $('collection-balance').textContent=profile?.freeTrial?'FREE TESTING PERIOD':Number(profile?.coins||0).toLocaleString('en-US')+' COINS';
  $('collection-free-changes').textContent=profile?.browserPreview?'BROWSER PREVIEW / THIS DEVICE ONLY':profile?.freeTrial?'FREE TRIAL / NO COINS REQUIRED':(profile?.freeRenames??1)+' free name change remaining';
  $('collection-terms').textContent=profile?.browserPreview?'Free browser preview: saved on this device. Names are not reserved across players.':profile?.freeTrial?'Free testing period: names and both color modes are available to try. Trial access is temporary.':'15,000 coins per locked name / one free name change. Both color modes are included. Color updates are free.';
  const list=$('reserved-names-list');list.replaceChildren();
  for(const item of profile?.names||[]){
   const card=document.createElement('article');card.className='reserved-name-card';
   const identity=document.createElement('div'),name=document.createElement('strong'),hint=document.createElement('small'),actions=document.createElement('div');
   name.textContent=item.name;applyNameStyle(name,item.nameStyle,item.color);hint.textContent=(item.trial?'FREE TRIAL / ':'')+(item.nameStyle?.mode==='animated'?'FOUR-COLOR MOTION':'STATIC COLOR');identity.append(name,hint);
   for(const [label,action]of [['USE',()=>use(item)],['EDIT',()=>choose(item)]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=action;button.disabled=busy;actions.append(button);}
   card.append(identity,actions);list.append(card);
  }
  if(!list.childElementCount){const empty=document.createElement('div');empty.className='collection-empty';const heading=document.createElement('h3'),hint=document.createElement('p');heading.textContent='Make a name for yourself.';hint.textContent='Your locked signatures live here. Choose a name and a color story to begin.';empty.append(heading,hint);list.append(empty);}
  const signature=JSON.stringify([activeTitle(),activeIdentity()]);if(signature!==applied){applied=signature;onTitleChange(activeTitle(),activeIdentity());}
  update();
 }
 async function use(item){if(busy)return;busy=true;try{profile=await request('name-equip',{id:item.id});render();onEquip(item);choose(item);status('Signature equipped.');}catch(e){status(e.message,true);}finally{busy=false;update();}}
 async function submit(){
  if(busy)return;const name=$('reserved-name-input').value.trim(),nameStyle=style(),color=nameStyle.colors[0];if(name.length<2){status('Use a name with at least 2 characters.',true);return;}
  busy=true;update();
  try{
   const key=name.normalize('NFKC').toLowerCase(),owned=appearance(name),endpoint=editing?(editing===key?'name-color':'rename'):owned?'name-color':'reserve';
   profile=await request(endpoint,{id:editing||owned?.id,name,color,nameStyle});render();const item=appearance(name)||activeIdentity();if(item)onEquip(item);choose(appearance(name));
   status(profile.freeTrial?'Free trial signature saved. Your colors appear in-game and in chat.':'Signature saved. Your colors appear in-game and in chat.');
  }catch(e){status(e.message,true);}finally{busy=false;update();}
 }
 async function refresh(){const at=revision;try{const next=await request('profile');if(at!==revision)return true;profile=next;render();return true;}catch{if(isOpen())status('Collection unavailable. Open the game through its server.',true);return false;}}
 async function setTitle(id,trial=false){const owned=profile?.ownedTitles.includes(id),endpoint=id&&(trial||profile?.freeTrial)&&!owned?'title-preview':!id||owned?'title-equip':'title-buy';profile=await request(endpoint,{id});render();return profile;}
 async function open(){trigger=document.activeElement;releaseInputs();overlay.classList.remove('hidden');choose();status('Loading your signatures...');$('collection-close').focus();await refresh();choose();status('');}
 function close(){overlay.classList.add('hidden');releaseInputs();trigger?.focus?.({preventScroll:true});}
 $('collection-close').onclick=close;for(const id of ['reserved-names-btn','toolbar-collection-btn'])$(id).onclick=open;
 $('collection-view-titles').onclick=()=>{close();onOpenTitles();};
 $('reserved-name-form').onsubmit=e=>{e.preventDefault();submit();};
 $('reserved-name-cancel').onclick=()=>choose();$('reserved-name-input').oninput=preview;
 $('reserved-name-mode').onchange=()=>{if($('reserved-name-mode').value==='animated'&&new Set(style().colors).size===1){SIGNATURE_COLORS.forEach((c,i)=>$(i?'reserved-name-color-'+i:'reserved-name-color').value=c);}preview();};
 for(let i=0;i<4;i++)$(i?'reserved-name-color-'+i:'reserved-name-color').oninput=preview;
 overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 window.addEventListener('keydown',e=>{if(!isOpen())return;if(e.key==='Escape'){close();e.preventDefault();e.stopImmediatePropagation();}else if(e.key==='Tab'){const nodes=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')].filter(n=>n.getClientRects().length),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){last?.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first?.focus();e.preventDefault();}}},true);
 refresh();return {isOpen,open,close,appearance,refresh,activeTitle,activeIdentity,setTitle,getProfile:()=>profile};
}
