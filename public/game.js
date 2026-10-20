export const MODES = Object.freeze({
  ffa: {title:'FREE FOR ALL',start:1000,color:'#73e5f1',botCount:13},
  dual:{title:'DUAL',start:1000,color:'#ae95ff',botCount:11},
  mega:{title:'MEGA',start:5000,color:'#ffd28a',botCount:12},
});
export const WORLD_SIZE=4800;
export const AUTO_SPLIT_MASS=25500;
export const MAX_CELLS=16;
export const DEFAULT_SETTINGS={
  showGrid:true,showMass:true,showNames:true,showLeaderboard:true,showMinimap:true,showChat:true,showSectors:false,
  autoSplit:true,autoRespawn:false,mouseSensitivity:1,zoom:1,cameraSmoothing:0.10,
  showFood:true,showViruses:true,showBorders:true,showHelp:true,cellOpacity:100,nickSize:1,massSize:1,
  bgColor:'#07131f',gridColor:'#244051',ownColor:'#70e0ff',secondColor:'#ff88b0',accentColor:'#70e0ff',
  borderWidth:5,foodSize:1,backgroundImage:false,backgroundUrl:'',
  keySplit:'SPACE',keyDoubleSplit:'Q',keyTripleSplit:'NO KEY',keySplit16:'T',keySplit32:'NO KEY',keySplit64:'D',
  keyFeed:'W',keyMacroFeed:'E',keySwitch:'TAB',keyStopMove:'NO KEY',keyChat:'ENTER',keyMenu:'ESCAPE',keySettings:'S',
  keyChatToggle:'C',keyHUD:'H',keySaveReplay:'R',keySpectateMode:'X',keyToggleNames:'N',keyToggleMass:'M',
  keyToggleSkin:'S',keyToggleChat:'NO KEY',keyToggleSectors:'B',keyCommand1:'1',keyCommand2:'2',keyCommand3:'3',
  keyCommand4:'4',keyCommand5:'5',keyCommand6:'6',keyCommand7:'7',keyCommand8:'8',keyCommand9:'9',keyCommand10:'0',
  keyZoom1:'ALT+1',keyZoom2:'ALT+2',keyZoom3:'ALT+3',keyZoom4:'ALT+4',keyZoom5:'ALT+5',
  rightClickMove:true,
  chatCommands:['Need backup!','Need a teammate!','Push now!','Split into me!','Feed me!','Hold position!','Defend me!','Go left!','Go right!','GG!']
};
export const DEFAULT_NAMES=['Nova','Orbit','Mercury','Sable','Helix','Cosmo','Vector','Astra','Vortex','Pulse','Quasar','Zenith','Echo','Drift','Neon'];
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const radius=m=>Math.max(13,Math.sqrt(Math.max(1,m))*2.45);
const rand=(a,b)=>a+Math.random()*(b-a);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function foodPoint(){return {x:rand(50,WORLD_SIZE-50),y:rand(50,WORLD_SIZE-50),mass:rand(8,23),color:['#60cfe7','#d991ff','#f39dc8','#7fdfbc','#efca87'][Math.floor(Math.random()*5)]};}
function newCell(x,y,mass,color){return {x,y,mass,color,vx:0,vy:0,mergeAt:0};}
function player(id,name,tag,color,start,npc=false){const x=rand(700,WORLD_SIZE-700),y=rand(700,WORLD_SIZE-700);return {id,name,tag,color,npc,cells:[newCell(x,y,start,color)],target:{x,y},heading:rand(0,Math.PI*2),alive:true};}
export class LocalArena{
  constructor(){this.mode='ffa';this.players=[];this.food=[];this.viruses=[];this.myIds=[];this.elapsed=0;this.chat=[];this._id=0;}
  reset(mode,name,tag,multi=true,settings=DEFAULT_SETTINGS){this.mode=MODES[mode]?mode:'ffa';this.elapsed=0;this._id=0;this.chat=[];
    const conf=MODES[this.mode];this.food=Array.from({length:260},foodPoint);this.viruses=Array.from({length:28},()=>({x:rand(100,WORLD_SIZE-100),y:rand(100,WORLD_SIZE-100)}));
    this.players=[];const me=player('local-1',name||'Vintage Player',tag||'',settings.ownColor,conf.start);
    me.cells[0].x=WORLD_SIZE/2;me.cells[0].y=WORLD_SIZE/2;me.target={x:me.cells[0].x,y:me.cells[0].y};this.players.push(me);this.myIds=[me.id];
    if(multi&&this.mode!=='mega'){const second=player('local-2',name+' II',tag,settings.secondColor,conf.start);second.cells[0].x=me.cells[0].x+280;second.cells[0].y=me.cells[0].y+90;this.players.push(second);this.myIds.push(second.id);}
    for(let i=0;i<conf.botCount;i++)this.players.push(player('npc-'+i,DEFAULT_NAMES[i],['','VX','RX','NV'][i%4],['#e59fe7','#ffb482','#87f4cd','#9eb3fa'][i%4],rand(600,conf.start*1.8),true));
  }
  get snapshot(){return {type:'state',mode:this.mode,players:this.players.filter(p=>p.cells.length),food:this.food,viruses:this.viruses,worldSize:WORLD_SIZE};}
  getById(id){return this.players.find(p=>p.id===id);}
  setTarget(id,x,y){const p=this.getById(id);if(p){p.target={x:clamp(x,0,WORLD_SIZE),y:clamp(y,0,WORLD_SIZE)};}}
  split(id,settings=DEFAULT_SETTINGS){const p=this.getById(id);if(!p||!p.cells.length)return;let available=MAX_CELLS-p.cells.length;
    for(const c of [...p.cells]){if(!available||c.mass<80)continue;const dx=p.target.x-c.x,dy=p.target.y-c.y,mag=Math.hypot(dx,dy)||1;const half=c.mass/2;c.mass=half;
      const next=newCell(clamp(c.x+dx/mag*radius(c.mass)*.8,30,WORLD_SIZE-30),clamp(c.y+dy/mag*radius(c.mass)*.8,30,WORLD_SIZE-30),half,c.color);
      next.vx=dx/mag*470;next.vy=dy/mag*470;next.mergeAt=this.elapsed+9;c.mergeAt=this.elapsed+9;p.cells.push(next);available--;
    }
  }
  feed(id){const p=this.getById(id);if(!p)return;for(const c of p.cells){if(c.mass<=100)continue;c.mass-=22;const dx=p.target.x-c.x,dy=p.target.y-c.y,mag=Math.hypot(dx,dy)||1;this.food.push({x:clamp(c.x+dx/mag*(radius(c.mass)+24),0,WORLD_SIZE),y:clamp(c.y+dy/mag*(radius(c.mass)+24),0,WORLD_SIZE),mass:22,color:'#bdfdff'});}}
  tick(dt,settings=DEFAULT_SETTINGS){dt=Math.min(.05,Math.max(0,dt));this.elapsed+=dt;
    for(const p of this.players){if(!p.cells.length)continue;
      if(p.npc){const lead=p.cells[0];if(Math.random()<.012){p.heading=rand(0,Math.PI*2)};const dangerous=this.players.filter(x=>x!==p&&x.cells.length&&x.cells[0].mass>lead.mass*1.3&&distance(x.cells[0],lead)<420).sort((a,b)=>distance(a.cells[0],lead)-distance(b.cells[0],lead))[0];
        if(dangerous)p.heading=Math.atan2(lead.y-dangerous.cells[0].y,lead.x-dangerous.cells[0].x);
        p.target={x:clamp(lead.x+Math.cos(p.heading)*500,0,WORLD_SIZE),y:clamp(lead.y+Math.sin(p.heading)*500,0,WORLD_SIZE)};
      }
      for(const c of p.cells){const dx=p.target.x-c.x,dy=p.target.y-c.y,dist=Math.hypot(dx,dy);const speed=clamp(400-Math.sqrt(c.mass)*2.2,80,355)*(p.npc?0.75:settings.mouseSensitivity);
        if(dist>3){const movement=Math.min(dist,speed*dt);c.x+=dx/dist*movement;c.y+=dy/dist*movement;}
        c.x=clamp(c.x+c.vx*dt,10,WORLD_SIZE-10);c.y=clamp(c.y+c.vy*dt,10,WORLD_SIZE-10);c.vx*=Math.pow(.83,dt*30);c.vy*=Math.pow(.83,dt*30);
        if(c.mass>=AUTO_SPLIT_MASS&&settings.autoSplit&&p.cells.length<MAX_CELLS)this.split(p.id,settings);
      }
      if(this.elapsed%6<dt){for(const c of p.cells){c.mass*=.9985;}}
      if(p.cells.length>1&&Math.random()<.05){for(let i=0;i<p.cells.length;i++)for(let j=i+1;j<p.cells.length;j++){const a=p.cells[i],b=p.cells[j];if(a&&b&&this.elapsed>a.mergeAt&&this.elapsed>b.mergeAt&&distance(a,b)<radius(a)*.55){a.mass+=b.mass;p.cells.splice(j,1);j--;}}}
    }
    for(const p of this.players){for(const c of p.cells){const r=radius(c.mass);
      for(let k=this.food.length-1;k>=0;k--){const f=this.food[k];if(Math.abs(c.x-f.x)<r&&Math.abs(c.y-f.y)<r&&distance(c,f)<r){c.mass+=f.mass;this.food.splice(k,1);}}
    }}
    for(let i=0;i<this.players.length;i++)for(let j=0;j<this.players.length;j++){
      if(i===j)continue;const a=this.players[i],b=this.players[j];for(const ca of a.cells){for(let k=b.cells.length-1;k>=0;k--){const cb=b.cells[k];if(ca.mass>cb.mass*1.25&&distance(ca,cb)<radius(ca)-radius(cb)*.34){ca.mass+=cb.mass;b.cells.splice(k,1);}}}
    }
    if(this.food.length<270)for(let i=0;i<4;i++)this.food.push(foodPoint());
    for(const p of this.players){if(p.npc&&!p.cells.length){const replacement=player(p.id,p.name,p.tag,p.color,rand(550,MODES[this.mode].start*1.7),true);p.cells=replacement.cells;p.heading=rand(0,7);}}
  }
}
export class ArenaRenderer{
  constructor(canvas,minimap){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.radar=minimap;this.radarCtx=minimap.getContext('2d');this.cam={x:WORLD_SIZE/2,y:WORLD_SIZE/2};this.zoom=.75;this.background=null;this.backgroundUrl='';this.fps=60;this.lastFpsCheck=0;this.frames=0;this.last=performance.now();this.screenW=0;this.screenH=0;}
  resize(){const ratio=Math.min(devicePixelRatio||1,2),w=innerWidth,h=innerHeight;this.canvas.width=Math.round(w*ratio);this.canvas.height=Math.round(h*ratio);this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';this.ctx.setTransform(ratio,0,0,ratio,0,0);this.screenW=w;this.screenH=h;}
  toWorld(x,y){return {x:this.cam.x+(x-this.screenW/2)/this.zoom,y:this.cam.y+(y-this.screenH/2)/this.zoom};}
  draw(snapshot,selectedId,settings=DEFAULT_SETTINGS,playing=false,dt=1/60){if(!this.screenW||this.screenW!==innerWidth||this.screenH!==innerHeight)this.resize();const ctx=this.ctx,W=this.screenW,H=this.screenH;
    ctx.clearRect(0,0,W,H);ctx.fillStyle=settings.bgColor;ctx.fillRect(0,0,W,H);
    if(settings.backgroundImage&&settings.backgroundUrl){if(this.backgroundUrl!==settings.backgroundUrl){this.backgroundUrl=settings.backgroundUrl;this.background=new Image();this.background.src=settings.backgroundUrl;}if(this.background?.complete&&this.background.naturalWidth){ctx.globalAlpha=.22;ctx.drawImage(this.background,0,0,W,H);ctx.globalAlpha=1;}}
    const me=snapshot?.players?.find(p=>p.id===selectedId&&p.cells?.length),c=me?.cells||[];
    if(me&&playing){const centroid={x:c.reduce((s,x)=>s+x.x,0)/c.length,y:c.reduce((s,x)=>s+x.y,0)/c.length};const ratio=clamp((settings.cameraSmoothing||.1)*dt*60,.01,1);this.cam.x+=(centroid.x-this.cam.x)*ratio;this.cam.y+=(centroid.y-this.cam.y)*ratio;}
    const mass=c.reduce((s,x)=>s+x.mass,0)||1000;
    const targetZoom=(settings.zoom||1)*clamp(1.05-Math.log10(Math.max(100,mass))/12,.48,.78);
    this.zoom+= (targetZoom-this.zoom)*clamp(dt*5,0,1);
    ctx.save();ctx.translate(W/2,H/2);ctx.scale(this.zoom,this.zoom);ctx.translate(-this.cam.x,-this.cam.y);
    const left=this.cam.x-W/this.zoom/2,top=this.cam.y-H/this.zoom/2,right=this.cam.x+W/this.zoom/2,bottom=this.cam.y+H/this.zoom/2;
    if(settings.showGrid){ctx.lineWidth=1/this.zoom;ctx.strokeStyle=settings.gridColor;ctx.globalAlpha=.65;ctx.beginPath();for(let x=Math.floor(left/110)*110;x<right;x+=110){ctx.moveTo(x,Math.max(0,top));ctx.lineTo(x,Math.min(WORLD_SIZE,bottom));}for(let y=Math.floor(top/110)*110;y<bottom;y+=110){ctx.moveTo(Math.max(0,left),y);ctx.lineTo(Math.min(WORLD_SIZE,right),y);}ctx.stroke();ctx.globalAlpha=1;}
    if(settings.showSectors){ctx.font='bold 56px Rajdhani';ctx.textAlign='center';ctx.fillStyle='#7793aa17';for(let x=0;x<5;x++)for(let y=0;y<5;y++){if(x*960>left-800&&x*960<right+100)ctx.fillText('ABCDE'[x]+(y+1),x*960+480,y*960+480);}}
    if(settings.showBorders){ctx.strokeStyle=settings.accentColor;ctx.globalAlpha=.38;ctx.lineWidth=settings.borderWidth||5;ctx.strokeRect(0,0,WORLD_SIZE,WORLD_SIZE);ctx.globalAlpha=1;}
    if(snapshot?.food&&settings.showFood){for(const f of snapshot.food){if(f.x<left-20||f.x>right+20||f.y<top-20||f.y>bottom+20)continue;const r=clamp(Math.sqrt(f.mass)*1.7*(settings.foodSize||1),3,15);ctx.beginPath();ctx.arc(f.x,f.y,r,0,Math.PI*2);ctx.fillStyle=f.color||'#83dbea';ctx.globalAlpha=.85;ctx.fill();}ctx.globalAlpha=1;}
    if(snapshot?.viruses&&settings.showViruses){for(const v of snapshot.viruses){if(v.x<left-50||v.x>right+50||v.y<top-50||v.y>bottom+50)continue;ctx.beginPath();for(let k=0;k<24;k++){const a=k*Math.PI*2/24,r=k%2?38:44;const x=v.x+Math.cos(a)*r,y=v.y+Math.sin(a)*r;if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fillStyle='#1b6d68';ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#71dac1';ctx.stroke();}}
    const ordered=[...(snapshot?.players||[])].flatMap(p=>(p.cells||[]).map(cell=>({p,cell}))).sort((a,b)=>a.cell.mass-b.cell.mass);
    for(const {p,cell} of ordered){if(cell.x<left-350||cell.x>right+350||cell.y<top-350||cell.y>bottom+350)continue;
      const r=radius(cell.mass),fill=p.color||cell.color||'#6ddff3';ctx.globalAlpha=(settings.cellOpacity||100)/100;
      ctx.beginPath();ctx.arc(cell.x,cell.y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.globalAlpha=1;
      ctx.beginPath();ctx.arc(cell.x,cell.y,r-7,0,Math.PI*2);ctx.fillStyle='#08131d';ctx.globalAlpha=.18;ctx.fill();ctx.globalAlpha=1;
      ctx.lineWidth=5;ctx.strokeStyle=fill;ctx.globalAlpha=.75;ctx.beginPath();ctx.arc(cell.x,cell.y,r-4,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
      if(p.id===selectedId){ctx.strokeStyle='#fff8';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cell.x,cell.y,r+8,0,Math.PI*2);ctx.stroke();}
      const fontSize=clamp(radius(cell.mass)*.35,15,37)*settings.nickSize;ctx.textAlign='center';ctx.fillStyle='#fff';ctx.lineWidth=3;ctx.strokeStyle='#17283a';ctx.font=`700 ${fontSize}px Rajdhani`;
      if(settings.showNames){const name=(p.name||'Player').slice(0,20);ctx.strokeText(name,cell.x,cell.y+(settings.showMass?-6:fontSize*.35));ctx.fillText(name,cell.x,cell.y+(settings.showMass?-6:fontSize*.35));}
      if(settings.showMass){const massFont=clamp(fontSize*.82,12,32)*settings.massSize;ctx.font=`700 ${massFont}px Rajdhani`;const label=Math.floor(cell.mass).toLocaleString('en-US');ctx.strokeText(label,cell.x,cell.y+massFont+1);ctx.fillText(label,cell.x,cell.y+massFont+1);}
    }
    ctx.restore();
    this.drawRadar(snapshot,selectedId,settings);
    this.frames++;if(performance.now()-this.lastFpsCheck>800){this.fps=Math.round(this.frames*1000/(performance.now()-this.lastFpsCheck||1000));this.frames=0;this.lastFpsCheck=performance.now();}
  }
  drawRadar(snapshot,id,settings){const ctx=this.radarCtx;ctx.clearRect(0,0,150,150);if(!settings.showMinimap||!snapshot)return;ctx.fillStyle='#11273a';ctx.fillRect(0,0,150,150);
    ctx.strokeStyle='#426278';ctx.strokeRect(3,3,144,144);ctx.strokeStyle='#264356';ctx.lineWidth=1;for(let k=1;k<5;k++){ctx.beginPath();ctx.moveTo(k*30,0);ctx.lineTo(k*30,150);ctx.moveTo(0,k*30);ctx.lineTo(150,k*30);ctx.stroke();}
    for(const p of snapshot.players||[]){if(!p.cells?.length)continue;const c=p.cells[0];ctx.beginPath();ctx.arc(c.x/WORLD_SIZE*150,c.y/WORLD_SIZE*150,p.id===id?5:2.5,0,Math.PI*2);ctx.fillStyle=p.id===id?'#fff':'#7397b3';ctx.fill();}
  }
}
