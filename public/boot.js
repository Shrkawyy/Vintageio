// Progress reports completed critical resources, with 100 reserved for a ready app.
const $=id=>document.getElementById(id),screen=$('boot-screen');
const manifest=['/styles.css?v=33-transparent-lobby','/skins.css?v=3-flags','/collection.css?v=public-free-trial-oct27-8','/identity.css?v=public-free-trial-oct27-8','/assets/vintage-logo.png','/assets/skins/jax/featured-11.png','/game.js?v=public-free-trial-oct27-8','/physics.js?v=public-free-trial-oct27-8','/titles.js?v=public-free-trial-oct27-8','/identity.js?v=public-free-trial-oct27-8','/skins.js?v=public-free-trial-oct27-8','/collection.js?v=public-free-trial-oct27-8','/title-studio.js?v=public-free-trial-oct27-8'];
let running=false;const introStarted=performance.now();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function burst(){
 const logo=screen.querySelector('.boot-logo'),rect=logo.getBoundingClientRect();
 screen.style.setProperty('--burst-x',(rect.left+rect.width/2)+'px');screen.style.setProperty('--burst-y',(rect.top+rect.height/2)+'px');
 const pieces=document.createElement('div');pieces.className='boot-logo-fragments';pieces.setAttribute('aria-hidden','true');
 const edges=[[0,0],[50,0],[100,0],[100,50],[100,100],[50,100],[0,100],[0,50],[0,0]];
 for(let i=0;i<8;i++){
  const a=edges[i],b=edges[i+1],angle=Math.atan2((a[1]+b[1])/2-50,(a[0]+b[0])/2-50),piece=document.createElement('i');
  piece.style.clipPath='polygon(50% 50%,'+a[0]+'% '+a[1]+'%,'+b[0]+'% '+b[1]+'%)';
  piece.style.setProperty('--piece-x',Math.cos(angle)*310+'px');piece.style.setProperty('--piece-y',Math.sin(angle)*230+'px');piece.style.setProperty('--piece-turn',((i%2?1:-1)*(28+i*11))+'deg');pieces.append(piece);
 }
 logo.after(pieces);
 const field=document.createElement('div');field.className='boot-burst';field.setAttribute('aria-hidden','true');
 for(const cls of ['boot-shockwave','boot-burst-glow']){const node=document.createElement('span');node.className=cls;field.append(node);}
 for(let i=0;i<28;i++){
  const shard=document.createElement('i'),angle=i/28*Math.PI*2+.12*(i%3),distance=130+(i*47)%320;
  shard.className='boot-shard';shard.style.setProperty('--piece-x',Math.cos(angle)*distance+'px');shard.style.setProperty('--piece-y',Math.sin(angle)*distance*.72+'px');shard.style.setProperty('--piece-turn',(i*39-300)+'deg');shard.style.setProperty('--shard-size',(5+i%11)+'px');shard.style.setProperty('--shard-color',i%3?'#a6e8ed':'#f1d498');field.append(shard);
 }
 screen.append(field);screen.dataset.phase='burst';screen.classList.add('bursting');
}
function progress(value,detail){$('boot-percent').textContent=value+'%';$('boot-fill').style.width=value+'%';$('boot-progress').setAttribute('aria-valuenow',value);$('boot-detail').textContent=detail;}
async function load(){
 if(running)return;running=true;$('boot-retry').hidden=true;$('boot-stage').textContent='PREPARING YOUR WORLD';let completed=0,failed=false;
 try{
  await Promise.all(manifest.map(async url=>{const response=await fetch(url,{cache:'force-cache'});if(!response.ok)throw Error('A game file could not be loaded.');await response.arrayBuffer();completed++;if(!failed)progress(Math.floor(completed/(manifest.length+2)*100),'Preparing files '+completed+' / '+manifest.length);}));
  await document.fonts.ready;progress(Math.floor((manifest.length+1)/(manifest.length+2)*100),'Starting the Vintage interface...');
  await import('./client.js?v=public-free-trial-oct27-8');
  await Promise.all([...screen.querySelectorAll('img')].map(img=>img.decode()));
  progress(100,'Your world is ready.');$('boot-stage').textContent='WELCOME TO VINTAGE';
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
   await wait(Math.max(0,1400-(performance.now()-introStarted)));
   $('boot-stage').textContent='ENTERING THE ARENA';burst();await wait(950);
  }else await wait(180);
  screen.classList.add('finished');document.body.classList.remove('booting');
  setTimeout(()=>{screen.hidden=true;},500);
 }catch(e){failed=true;$('boot-stage').textContent='LOADING PAUSED';$('boot-detail').textContent=e.message||'Check your connection and retry.';$('boot-retry').hidden=false;running=false;}
}
$('boot-retry').onclick=()=>location.reload();load();
