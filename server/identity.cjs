'use strict';
// Shared, bounded cosmetic data. No CSS, URLs or executable values are accepted.
const SIGNATURE_COLORS=Object.freeze(['#70E0FF','#B58AFF','#FF70B8','#FFD580']);
const cleanIdentityColor=(value,fallback='#FFFFFF')=>/^#[0-9a-f]{6}$/i.test(String(value))?String(value).toUpperCase():fallback;
function normalizeNameStyle(value,fallback='#FFFFFF'){
  const first=cleanIdentityColor(fallback),animated=value?.mode==='animated';
  return {mode:animated?'animated':'static',colors:Array.from({length:4},(_,i)=>cleanIdentityColor(value?.colors?.[i],animated?SIGNATURE_COLORS[i]:first))};
}
function applyNameStyle(node,value,fallback='#FFFFFF'){
  const style=normalizeNameStyle(value,fallback);node.classList.toggle('signature-animated',style.mode==='animated');
  node.style.color=style.colors[0];style.colors.forEach((c,i)=>node.style.setProperty('--signature-'+i,c));
}
function namePaint(ctx,value,fallback,x,y,width,time=0){
  const style=normalizeNameStyle(value,fallback);if(style.mode!=='animated')return style.colors[0];
  const paint=ctx.createLinearGradient(x-width/2,y,x+width/2,y),phase=(time/1.8)%4,index=Math.floor(phase),part=phase-index;
  const blend=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
  for(let n=0;n<=4;n++)paint.addColorStop(n/4,blend(style.colors[(index+n)%4],style.colors[(index+n+1)%4],part));
  return paint;
}

module.exports={SIGNATURE_COLORS,cleanIdentityColor,normalizeNameStyle,applyNameStyle,namePaint};
