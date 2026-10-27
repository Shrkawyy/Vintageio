'use strict';
// Original Vintage insignia. Prices are server verified; localhost trials grant no ownership.
const entries=[
 ['vip','VIP','The inner circle',75000,'#FFD580','#7E5522',0,'crown'],
 ['yt','YT','Broadcast your legacy',null,'#FF6B78','#802435',1,'play'],
 ['goat','GOAT','Greatest of all time',100000,'#FFDDA0','#A26AF2',2,'horns'],
 ['killer','THE KILLER','Leave no survivors',20000,'#FF526F','#6F173A',1,'blade'],
 ['apex','APEX','Above the competition',20000,'#79E8FF','#245584',3,'peak'],
 ['phantom','PHANTOM','Seen only when it is too late',20000,'#C6B6FF','#554280',0,'ghost'],
 ['reaper','REAPER','Collect the final score',20000,'#EA647D','#3C334F',4,'blade'],
 ['sovereign','SOVEREIGN','The arena is your kingdom',20000,'#D8A0FF','#745236',2,'crown'],
 ['warlord','WARLORD','Lead the charge',20000,'#FFA86B','#823926',1,'shield'],
 ['venom','VENOM','A dangerous signature',20000,'#B3F474','#355B37',3,'fang'],
 ['eclipse','ECLIPSE','Let the light disappear',20000,'#BD9AFF','#383B6E',0,'moon'],
 ['nova','NOVA','Make an entrance',20000,'#FF9CD9','#70366C',4,'star'],
 ['tempest','TEMPEST','Control the storm',20000,'#8EC9FF','#344786',1,'bolt'],
 ['frostbite','FROSTBITE','Cold and calculated',20000,'#B4F4FF','#40778B',3,'ice'],
 ['inferno','INFERNO','Turn up the heat',20000,'#FFC27B','#AD3A40',4,'flame'],
 ['vandal','VANDAL','Break the expected',20000,'#FE8DC8','#68448F',1,'slash'],
 ['ronin','RONIN','Your own path',20000,'#F1AEA6','#8C3349',0,'blade'],
 ['mythic','MYTHIC','Written into legend',20000,'#E9D699','#7270AD',2,'star'],
 ['voidwalker','VOIDWALKER','Beyond the edge',20000,'#B79CFF','#285171',3,'portal'],
 ['vintage-legend','VINTAGE LEGEND','An original, forever',30000,'#91EDDF','#B58B49',2,'diamond']
];
const TITLE_CATALOG=Object.freeze(entries.map(([id,label,name,price,color,secondary,shape,emblem])=>Object.freeze({id,label,name,price,color,secondary,shape,emblem})));
const titleFor=id=>TITLE_CATALOG.find(item=>item.id===id)||null;
const formatPlayerName=(player,max=20)=>{const name=String(player?.name||'Player').trim().slice(0,max)||'Player',title=titleFor(player?.titleId);return (title?'['+title.label+'] ':'')+name;};
function normalizeTitlePosition(value){
  let x=Number.isFinite(value?.x)?value.x:0,y=Number.isFinite(value?.y)?value.y:-.48;
  const d=Math.hypot(x,y);if(d>.78){x*=.78/d;y*=.78/d;}
  return {x:Math.round(x*1000)/1000,y:Math.round(y*1000)/1000};
}
const outlines=[
 'M22 10H394L412 50 394 90H22L8 50Z',
 'M28 8H412L392 34 412 92H8L28 66 8 34Z',
 'M38 10H382L412 50 382 90H38L8 50Z',
 'M30 8H390L414 32V68L390 92H30L6 68V32Z',
 'M18 12H402V34L414 50 402 66V88H18V66L6 50 18 34Z'
];
const icons={crown:'M28 57 20 32 38 42 49 23 61 42 79 32 70 57ZM29 68H70',play:'M34 26 73 50 34 74Z',horns:'M49 70 28 52 19 24 34 35 49 43 64 35 79 24 70 52ZM38 52H60',blade:'M25 77 73 22 62 48 39 68ZM26 55 45 73',peak:'M18 72 49 22 80 72M36 47 49 67 62 47',ghost:'M25 73V44Q25 20 49 20Q73 20 73 44V73L61 65 49 74 37 65ZM37 43V51M61 43V51',shield:'M22 25H76V49Q76 65 49 78Q22 65 22 49ZM49 31V64',fang:'M22 26 38 70 49 43 60 70 76 26 49 35Z',moon:'M64 23A29 29 0 1 0 73 66A29 29 0 0 1 64 23',star:'M49 19 57 40 80 41 62 55 68 77 49 63 30 77 36 55 18 41 41 40Z',bolt:'M57 17 25 53H45L39 81 76 42H54Z',ice:'M49 18V80M22 34 76 65M22 65 76 34M38 25 49 36 60 25M38 73 49 62 60 73',flame:'M48 18Q75 43 71 59Q67 79 48 79Q22 75 27 54Q30 43 40 37Q36 56 48 59Q61 52 48 18',slash:'M24 75 49 23M46 75 71 23M19 55H77',portal:'M49 19 76 34V66L49 81 22 66V34ZM49 32 65 41V59L49 68 33 59V41Z',diamond:'M20 39 34 22H66L80 39 49 79ZM20 39H80M34 22 41 39 49 79 57 39 66 22'};
function titleBadgeSvg(item){
  if(!item||titleFor(item.id)!==item)return '';
  const {color,secondary,label,shape,emblem}=item;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 100"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="${secondary}"/><stop offset=".48" stop-color="#111c29"/><stop offset="1" stop-color="#070c13"/></linearGradient><linearGradient id="s"><stop stop-color="${color}"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="${color}"/></linearGradient></defs><path d="${outlines[shape]}" fill="url(#b)" stroke="${color}" stroke-width="2"/><path d="M102 19H370M102 81H370" stroke="${color}" opacity=".3"/><path d="M100 18V82" stroke="${color}" opacity=".4"/><path d="${icons[emblem]}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><text x="252" y="62" text-anchor="middle" fill="url(#s)" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="${label.length>11?27:34}" letter-spacing="1">${label}</text><path d="M12 50 20 50M400 50 408 50" stroke="white" stroke-width="3"/></svg>`;
}
const badgeUrls=new Map();
const titleBadgeUrl=item=>{
  if(!item||titleFor(item.id)!==item)return '';
  if(!badgeUrls.has(item.id))badgeUrls.set(item.id,'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(titleBadgeSvg(item)));
  return badgeUrls.get(item.id);
};

module.exports={TITLE_CATALOG,titleFor,formatPlayerName,normalizeTitlePosition,titleBadgeSvg,titleBadgeUrl};
