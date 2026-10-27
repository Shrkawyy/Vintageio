import {TITLE_CATALOG,titleFor,titleBadgeUrl,normalizeTitlePosition} from './titles.js?v=dual-watch-intro-oct27-7';
import {namePaint} from './identity.js?v=dual-watch-intro-oct27-7';
export function mountTitleStudio({getCollection,getSlot,setPosition,getQuery}){
 const $=id=>document.getElementById(id),canvas=$('title-position-canvas'),ctx=canvas.getContext('2d'),grid=$('title-catalog-grid');
 let visible=false,selected='killer',position=normalizeTitlePosition(),dragging=false,busy=false,frame=0;
 const images=new Map(),image=url=>{if(!images.has(url)){const img=new Image();img.src=url;images.set(url,img);}return images.get(url);};
 const profile=()=>getCollection()?.getProfile(),note=(message,error=false)=>{const node=$('title-studio-status');node.textContent=message;node.classList.toggle('error',error);};
 function render(){
  if(!visible)return;const p=profile(),item=titleFor(selected)||TITLE_CATALOG[0],owned=p?.ownedTitles.includes(item.id),query=getQuery().toLowerCase();
  grid.replaceChildren();let count=0;
  for(const title of TITLE_CATALOG){
   if(!(title.label+' '+title.name).toLowerCase().includes(query))continue;count++;
   const card=document.createElement('button');card.type='button';card.className='insignia-card';card.dataset.title=title.id;card.classList.toggle('selected',title.id===selected);card.setAttribute('aria-pressed',String(title.id===selected));card.style.setProperty('--insignia',title.color);
   const art=document.createElement('div'),img=document.createElement('img'),name=document.createElement('strong'),detail=document.createElement('small'),price=document.createElement('span');art.className='insignia-art';img.src=titleBadgeUrl(title);img.alt=title.label;art.append(img);name.textContent=title.label;detail.textContent=title.name;price.textContent=p?.activeTitle===title.id?'EQUIPPED':p?.ownedTitles.includes(title.id)?'OWNED':title.price===null?'NOT ON SALE':title.price.toLocaleString('en-US')+' COINS';card.append(art,name,detail,price);card.onclick=()=>{selected=title.id;note('');render();};grid.append(card);
  }
  $('skins-result-count').textContent=count+' TITLES';$('title-selected-name').textContent=item.label;$('title-selected-description').textContent=item.name;
  $('title-equip').textContent=owned?'EQUIP TITLE':item.price===null?'NOT ON SALE':'UNLOCK / '+item.price.toLocaleString('en-US')+' COINS';
  $('title-equip').disabled=busy||!p||(!owned&&item.price===null);$('title-trial').hidden=!p?.localTitlePreview;$('title-trial').disabled=busy;$('title-remove').hidden=!p?.activeTitle;
 }
 function draw(now){
  if(!visible)return;const r=235,cx=300,cy=300+(dragging?0:Math.sin(now/1400)*4),slot=getSlot(),item=titleFor(selected);
  ctx.clearRect(0,0,600,600);ctx.save();ctx.shadowColor='#70e0ff44';ctx.shadowBlur=28;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle='#103d54';ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#70e0ff77';ctx.lineWidth=2;ctx.stroke();
  if(slot.skinUrl){const skin=image(slot.skinUrl);if(skin.complete&&skin.naturalWidth){ctx.save();ctx.clip();ctx.drawImage(skin,cx-r,cy-r,r*2,r*2);ctx.restore();}}
  ctx.font='bold 30px Arial';ctx.textAlign='center';ctx.textBaseline='middle';const identity=getCollection()?.activeIdentity(),name=identity?.name||$('nickname').value||'Vintage Player';ctx.fillStyle=namePaint(ctx,identity?.nameStyle,identity?.color||'#ffffff',cx,cy,260,now/1000);ctx.strokeStyle='#06101d';ctx.lineWidth=4;ctx.strokeText(name,cx,cy,370);ctx.fillText(name,cx,cy,370);ctx.font='bold 26px Arial';ctx.fillStyle='#c5e7ee';ctx.fillText('12.5k',cx,cy+36);
  if(item){const badge=image(titleBadgeUrl(item)),w=r*1.25,h=w/4.2,x=cx+position.x*r,y=cy+position.y*r;if(badge.complete&&badge.naturalWidth)ctx.drawImage(badge,x-w/2,y-h/2,w,h);}
  ctx.restore();frame=requestAnimationFrame(draw);
 }
 function place(event){const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*600/rect.width,y=(event.clientY-rect.top)*600/rect.height;position=normalizeTitlePosition({x:(x-300)/235,y:(y-300)/235});}
 const savePosition=()=>{setPosition(position);note('Position saved for this connection.');};
 canvas.onpointerdown=e=>{if(!visible)return;dragging=true;canvas.setPointerCapture(e.pointerId);place(e);e.preventDefault();};
 canvas.onpointermove=e=>{if(dragging)place(e);};canvas.onpointerup=()=>{if(dragging){dragging=false;savePosition();}};canvas.onpointercancel=()=>{dragging=false;};
 canvas.onkeydown=e=>{const direction={ArrowLeft:[-.04,0],ArrowRight:[.04,0],ArrowUp:[0,-.04],ArrowDown:[0,.04]}[e.key];if(!direction)return;e.preventDefault();position=normalizeTitlePosition({x:position.x+direction[0],y:position.y+direction[1]});savePosition();};
 $('title-position-reset').onclick=()=>{position=normalizeTitlePosition();savePosition();};
 async function equip(trial=false,id=selected){if(busy)return;busy=true;render();try{await getCollection().setTitle(id,trial);note(trial?'Local trial active. Your title is ready in-game.':id?'Title equipped.':'Title removed.');render();}catch(e){note(e.message,true);}finally{busy=false;render();}}
 $('title-equip').onclick=()=>equip();$('title-trial').onclick=()=>equip(true);$('title-remove').onclick=()=>equip(false,'');
 async function show(next){visible=next;$('title-studio').hidden=!next;grid.hidden=!next;cancelAnimationFrame(frame);if(!next)return;position=normalizeTitlePosition(getSlot().titlePosition);selected=profile()?.activeTitle||selected;render();frame=requestAnimationFrame(draw);await getCollection().refresh();render();}
 return {show,render,updateSlot(){position=normalizeTitlePosition(getSlot().titlePosition);render();}};
}
