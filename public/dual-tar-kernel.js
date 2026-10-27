/** Physics adapted from the supplied MultiOgar-Edited dual.tar, Apache-2.0.
 * Archive SHA-256: 318f24bcc05aa5c3fc4b09110ac9c8be4cdc9bbc0c2753fd1cb257c95dc24aa3.
 * See LICENSE-MULTIOGAR.txt and DUAL-TAR-PHYSICS.md for source locations and changes.
 * Vintage lengths = source lengths * distanceScale. Mass is unchanged.
 */
let nextId=1000000000,nextPellet=0;
// Scaling can turn an integer source vector into 219.99999999999997.
const trunc=value=>Math.trunc(Math.abs(value-Math.round(value))<1e-8?Math.round(value):value);
const radius=(cell,c)=>10*Math.sqrt(Math.max(0,cell.mass||0))*c.distanceScale;
const sourceRadius=cell=>10*Math.sqrt(Math.max(0,cell.mass||0));
const ensure=(cell,c)=>{
 cell.dualTarId??=++nextId;cell.physicsId??=cell.dualTarId;cell.age??=0;cell.boost??=0;cell.boostX??=0;cell.boostY??=0;
 return cell;
};
function speed(mass,c){return 2.2*Math.pow(10*Math.sqrt(Math.max(Number.MIN_VALUE,mass)),-.439)*40*c.playerSpeed*25*c.distanceScale;}
function mergeDelay(mass,c){return Math.max(c.mergeTime,10*Math.sqrt(Math.max(0,mass))*.2);}
function ready(cell,c){return cell.age+1e-7>=mergeDelay(cell.mass,c)*1000;}
function velocity(cell){const v=cell.boost*(25/9);cell.vx=cell.boostX*v;cell.vy=cell.boostY*v;}
function setBoost(cell,x,y,budget,c){ensure(cell,c);const length=Math.hypot(x,y);cell.boost=budget;cell.boostX=length?x/length:1;cell.boostY=length?y/length:0;velocity(cell);}
function bound(cell,width,c){
 if(!Number.isFinite(width))return;
 const r=Math.min(width/2,radius(cell,c)/2);
 if(cell.x<r||cell.x>width-r){cell.boostX=-cell.boostX;cell.x=Math.max(r,Math.min(width-r,cell.x));cell.hitWall=true;}
 if(cell.y<r||cell.y>width-r){cell.boostY=-cell.boostY;cell.y=Math.max(r,Math.min(width-r,cell.y));cell.hitWall=true;}
 velocity(cell);
}
function boost(cell,dt,width,c){
 if(cell.ejected){cell.previousX=cell.x;cell.previousY=cell.y;}
 ensure(cell,c);const remaining=cell.boost*Math.pow(8/9,Math.max(0,dt)*25),travel=cell.boost-remaining;
 cell.x+=cell.boostX*travel;cell.y+=cell.boostY*travel;cell.boost=remaining<1e-8?0:remaining;bound(cell,width,c);velocity(cell);
}
function aim(player,cell,c){
 const dx=((player.target?.x??cell.x)-cell.x)/c.distanceScale,dy=((player.target?.y??cell.y)-cell.y)/c.distanceScale;
 if(trunc(dx)**2+trunc(dy)**2<1)return{x:1,y:0};const length=Math.hypot(dx,dy);return{x:dx/length,y:dy/length};
}
function fragment(player,parent,mass,ux,uy,time,c){
 const remaining=parent.mass-mass;if(!(mass>0&&remaining>0)||10*Math.sqrt(remaining)<c.minimumSourceSize)return null;
 parent.mass=remaining;const child=ensure({x:parent.x,y:parent.y,originX:parent.x,originY:parent.y,mass,color:parent.color,age:0,bornAt:time,mergeAt:time+mergeDelay(mass,c)},c);
 setBoost(child,ux,uy,c.splitBoost*Math.pow(sourceRadius(child),.0122)*c.distanceScale,c);return child;
}
function splitCell(player,cell,time,width,c){
 if(!player?.cells?.includes(cell)||sourceRadius(cell)<c.minSplitSize)return null;
 ensure(cell,c);const u=aim(player,cell,c);return fragment(player,cell,cell.mass/2,u.x,u.y,time,c);
}
function autoSplit(player,time,width,maxCells,c){
 let count=0;for(const cell of [...player.cells]){
  if(sourceRadius(cell)<c.autoSize)continue;
  if(player.cells.length>=Math.min(maxCells,c.maxCells)){cell.mass=c.autoSize**2/100;continue;}
  const angle=Math.random()*Math.PI*2,child=fragment(player,cell,cell.mass/2,Math.sin(angle),Math.cos(angle),time,c);
  if(child){player.cells.push(child);count++;}
 }return count;
}
function manifold(a,b,c){
 const x=(b.cell.x-a.cell.x)/c.distanceScale,y=(b.cell.y-a.cell.y)/c.distanceScale;
 return {a,b,px:x*c.distanceScale,py:y*c.distanceScale,d:Math.sqrt(trunc(x)**2+trunc(y)**2)*c.distanceScale};
}
function rigid(m,c){
 if(m.d===0)return false;const a=m.a.cell,b=m.b.cell,push=(radius(a,c)+radius(b,c)-m.d)/m.d;
 if(push<=0)return false;const total=a.mass+b.mass;
 const strength=c.siblingPush??.3;
 a.x-=m.px*push*b.mass/total*strength;a.y-=m.py*push*b.mass/total*strength;
 b.x+=m.px*push*a.mass/total*strength;b.y+=m.py*push*a.mass/total*strength;return true;
}
function ownRigid(a,b,c){return a.cell.age+1e-7>=c.noCollisionDelay&&b.cell.age+1e-7>=c.noCollisionDelay&&(!ready(a.cell,c)||!ready(b.cell,c));}
function eatable(m,c,time=Infinity){
 let small=m.a,big=m.b;if(small.cell.mass>big.cell.mass)[small,big]=[big,small];
 const a=big.cell,b=small.cell;if(a.removed||b.removed)return null;
 if(c.emitterGrace&&small.kind==='ejected'&&b.sourceId===a.dualTarId&&time<(b.sourceCollectAt||0))return null;
 if(m.d>=radius(a,c)-radius(b,c)/3)return null;
 if(big.player&&big.player===small.player){if(a.age+1e-7<c.noCollisionDelay||b.age+1e-7<c.noCollisionDelay)return null;}
 else if(sourceRadius(a)<sourceRadius(b)*1.15||big.kind!=='player'&&!(big.kind==='virus'&&small.kind==='ejected'))return null;
 return {big,small};
}
function popParts(mass,currentCount,c,maxCells){
 let left=Math.min(maxCells,c.maxCells)-currentCount;if(left<=0)return [];
 const minimum=c.virusPopSize**2/100,parts=[];
 if(mass/left<minimum){let count=2,part=mass/count;while(part>minimum&&count*2<left)part=mass/(count*=2);count=Math.min(count,left);return Array(count).fill(mass/(count+1));}
 // Mirrors Virus.onEaten's half/half distribution, bounded by available slots.
 let part=mass/2,remaining=mass/2;
 while(left-->0){
  if(left>0&&remaining/left<minimum){part=remaining/left;while(left-->0)parts.push(part);}
  while(part>=remaining&&left>0)part/=2;
  if(Number.isFinite(part)&&part>0)parts.push(part);remaining-=part;
 }
 return parts.slice(0,Math.min(maxCells,c.maxCells)-currentCount);
}
function pop(player,cell,time,width,maxCells,c){
 const parts=popParts(cell.mass,player.cells.length,c,maxCells);let count=0;
 for(const mass of parts){const angle=Math.random()*Math.PI*2,child=fragment(player,cell,mass,Math.sin(angle),Math.cos(angle),time,c);if(child){player.cells.push(child);count++;}}
 player.lastPopAt=time;return count;
}
function eat(m,c,viruses,time,width,maxCells){
 const hit=eatable(m,c,time);if(!hit)return 0;const {big,small}=hit,a=big.cell,b=small.cell;
 if(big.kind==='virus'){
  if(viruses.length>=c.virusMaxCount)return 0;
  setBoost(a,b.boostX,b.boostY,220*c.distanceScale,c);
 }else{
  const noGain=!c.playerBotGrow&&sourceRadius(a)>=250&&small.kind==='player'&&sourceRadius(b)<=41;
  if(!noGain)a.mass+=b.mass;
 }
 b.removed=true;b.eatenBy=a.physicsId;
 if(big.kind==='player'&&small.kind==='virus')pop(big.player,a,time,width,maxCells,c);
 return 1;
}
function entries(players,food,viruses,c){
 return [...players.flatMap(player=>(player.cells||[]).map(cell=>({cell:ensure(cell,c),player,kind:'player'}))),
  ...food.map(cell=>({cell:ensure(cell,c),kind:cell.ejected?'ejected':'food'})),...viruses.map(cell=>({cell:ensure(cell,c),kind:'virus'}))];
}
function cleanup(players,food,viruses,time,c){
 for(const player of players){player.cells=player.cells.filter(cell=>!cell.removed);if(player.npc&&!player.cells.length&&player.respawnAt==null)player.respawnAt=time+c.botRespawnSeconds;}
 for(const list of [food,viruses])for(let i=list.length-1;i>=0;i--)if(list[i].removed)list.splice(i,1);
}
class Grid{
 constructor(rows,c){this.size=256*c.distanceScale;this.c=c;this.buckets=new Map();this.keys=new Map();for(const row of rows)this.update(row);}
 range(row){const r=radius(row.cell,this.c),s=this.size;return[Math.floor((row.cell.x-r)/s),Math.floor((row.cell.x+r)/s),Math.floor((row.cell.y-r)/s),Math.floor((row.cell.y+r)/s)];}
 update(row){for(const key of this.keys.get(row)||[]){const bucket=this.buckets.get(key);bucket?.delete(row);if(!bucket?.size)this.buckets.delete(key);}const keys=[],[x0,x1,y0,y1]=this.range(row);for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=x+','+y;if(!this.buckets.has(key))this.buckets.set(key,new Set());this.buckets.get(key).add(row);keys.push(key);}this.keys.set(row,keys);}
 query(row,swept=false){const found=new Set(),range=this.range(row);
  if(swept&&Number.isFinite(row.cell.previousX)&&Number.isFinite(row.cell.previousY)){const old=this.range({cell:{...row.cell,x:row.cell.previousX,y:row.cell.previousY}});range[0]=Math.min(range[0],old[0]);range[1]=Math.max(range[1],old[1]);range[2]=Math.min(range[2],old[2]);range[3]=Math.max(range[3],old[3]);}
  const [x0,x1,y0,y1]=range;for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(const other of this.buckets.get(x+','+y)||[])if(other!==row&&!other.cell.removed)found.add(other);return found;
 }
}
function firstFeedContact(row,grid,c,time,viruses){
 const pellet=row.cell,x=pellet.previousX??pellet.x,y=pellet.previousY??pellet.y,dx=pellet.x-x,dy=pellet.y-y,a=dx*dx+dy*dy;let best=null;
 for(const receiver of grid.query(row,true)){
  const cell=receiver.cell;if(receiver.kind!=='player'&&receiver.kind!=='virus'||cell.mass<pellet.mass*1.15**2)continue;
  if(receiver.kind==='virus'&&viruses.length>=c.virusMaxCount)continue;
  if(pellet.sourceId===cell.dualTarId&&time<(pellet.sourceCollectAt||0))continue;
  const r=radius(cell,c)-radius(pellet,c)/3;if(r<=0)continue;
  const ox=x-cell.x,oy=y-cell.y,outside=ox*ox+oy*oy-r*r;let at=0;
  if(outside>=0){if(!a)continue;const b=ox*dx+oy*dy,disc=b*b-a*outside;if(disc<0)continue;at=(-b-Math.sqrt(disc))/a;if(at<0||at>1)continue;}
  if(!best||at<best.at)best={at,receiver,m:{a:row,b:receiver,d:r-1e-7,px:0,py:0}};
 }return best;
}
function moveOne(player,cell,dt,time,width,c,sensitivity=1){
 ensure(cell,c);
 if(!player.movementStopped){
  const dx=(player.target?.x??cell.x)-cell.x,dy=(player.target?.y??cell.y)-cell.y;
  const d=Math.sqrt(trunc(dx/c.distanceScale)**2+trunc(dy/c.distanceScale)**2)*c.distanceScale;
  if(d){const fraction=Math.min(d,speed(cell.mass,c)*dt*sensitivity)/d;cell.x+=dx*fraction;cell.y+=dy*fraction;}
 }
 boost(cell,dt,width,c);
}
function resolveOwn(player,time,width,c,mergeOnly=false){
 const rows=entries([player],[],[],c);let eaten=0;
 for(const a of rows)for(const b of rows){if(a===b||a.cell.removed||b.cell.removed)continue;const m=manifold(a,b,c);
  if(ownRigid(a,b,c)){if(!mergeOnly)rigid(m,c);}else if(ready(a.cell,c)&&ready(b.cell,c))eaten+=eat(m,c,[],time,width,c.maxCells);
 }player.cells=player.cells.filter(cell=>!cell.removed);return eaten;
}
function moveCells(player,dt,time,width,c,sensitivity=1){
 if(!player?.cells?.length||!(dt>0))return;
 resolveOwn(player,time,width,c);for(const cell of player.cells){moveOne(player,cell,dt,time,width,c,sensitivity);cell.age+=dt*1000;}
}
function decayCell(cell,c){
 if(sourceRadius(cell)<=c.minimumSourceSize||sourceRadius(cell)<=c.noDecaySize)return;
 cell.mass*=1-c.sourceDecayRate;
}
function decayMass(players,dt,c){
 for(const player of players)for(const cell of player.cells||[]){cell.dualDecayCredit=(cell.dualDecayCredit||0)+Math.max(0,dt);while(cell.dualDecayCredit+1e-9>=1){cell.dualDecayCredit-=1;decayCell(cell,c);}}
}
function eject(player,food,time,width,c){
 if(!player?.cells?.length||time+1e-9<(player.dualLastEject??-Infinity)+.04)return 0;
 let count=0;
 for(const cell of player.cells){
  ensure(cell,c);if(sourceRadius(cell)<c.minEjectSize||cell.mass<=c.feedCost)continue;
  const u=aim(player,cell,c);cell.mass-=c.feedCost;
  const angle=Math.atan2(u.x,u.y)+(c.symmetricFeed?(Math.random()*2-1)*c.ejectDispersion:Math.random()*.4-.3),r=radius(cell,c);
  const pellet=ensure({x:cell.x+u.x*r,y:cell.y+u.y*r,mass:c.feedMass,radius:c.feedRadius,ejected:true,feedId:++nextPellet,
   color:cell.color||player.color||'#60cfe7',ownerId:player.id,age:0,bornAt:time,
   ...(c.emitterGrace?{sourceId:cell.dualTarId,sourceCollectAt:time+c.emitterGrace}:{})},c);
  setBoost(pellet,Math.sin(angle),Math.cos(angle),c.ejectBoost*c.distanceScale,c);food.push(pellet);count++;
 }
 if(count)player.dualLastEject=time;return count;
}
function resolveOnly(players,food,viruses,time,width,maxCells,c,{own=false,cross=true,foodOnly=false}={}){
 const rows=entries(players,food,viruses,c),grid=new Grid(rows,c);let eaten=0;
 if(c.sweptFeed&&cross)for(const row of rows){if(row.kind!=='ejected'||row.cell.removed)continue;const hit=firstFeedContact(row,grid,c,time,viruses);if(hit){eaten+=eat(hit.m,c,viruses,time,width,maxCells);grid.update(hit.receiver);}}
 for(const a of rows){if(a.cell.removed||a.kind!=='player'&&a.kind!=='virus')continue;
  for(const b of grid.query(a)){
   const same=a.player&&a.player===b.player;if(same&&!own||!same&&!cross||foodOnly&&b.kind!=='food'&&b.kind!=='ejected')continue;
   if(same&&(!ready(a.cell,c)||!ready(b.cell,c)))continue;
   eaten+=eat(manifold(a,b,c),c,viruses,time,width,maxCells);grid.update(a);
  }
 }cleanup(players,food,viruses,time,c);return eaten;
}
function step(players,food,viruses,dt,time,width,maxCells,c){
 const rows=entries(players,food,viruses,c),grid=new Grid(rows,c),contacts=[];let eaten=0;
 // Moving pellets/viruses are resolved before player motion, as in GameServer.mainLoop.
 for(const row of rows){
  if(row.kind!=='ejected'&&row.kind!=='virus'||row.cell.removed||!row.cell.boost)continue;
  boost(row.cell,dt,width,c);grid.update(row);
  if(row.kind==='ejected'&&c.sweptFeed){const hit=firstFeedContact(row,grid,c,time,viruses);if(hit){eaten+=eat(hit.m,c,viruses,time,width,maxCells);grid.update(hit.receiver);}continue;}
  for(const other of grid.query(row)){
   if(row.kind==='ejected'&&other.kind==='ejected')continue;
   eaten+=eat(manifold(row,other,c),c,viruses,time,width,maxCells);
  }
 }
 for(const row of rows.filter(row=>row.kind==='player').sort((a,b)=>b.cell.dualTarId-a.cell.dualTarId)){
  if(row.cell.removed)continue;
  for(const other of grid.query(row)){
   const m=manifold(row,other,c);
   if(row.player===other.player&&ownRigid(row,other,c)){rigid(m,c);grid.update(other);}
   else contacts.push(m);
  }
  moveOne(row.player,row.cell,dt,time,width,c);grid.update(row);
 }
 for(const player of players)autoSplit(player,time,width,maxCells,c);
 const tick=Math.max(0,Math.round(time*25)-1);
 if((tick+3)%25===0)for(const player of players)for(const cell of player.cells)decayCell(cell,c);
 for(let i=contacts.length-1;i>=0;i--)eaten+=eat(contacts[i],c,viruses,time,width,maxCells);
 for(const row of rows)row.cell.age+=dt*1000;
 cleanup(players,food,viruses,time,c);return eaten;
}
function makeVirus(x,y,c){return ensure({x,y,mass:c.virusSize**2/100,baseMass:c.virusSize**2/100,feedMass:0,feedCount:0,age:0},c);}
function foodRecipient(pellet,players,c){
 const b={cell:ensure(pellet,c),kind:pellet.ejected?'ejected':'food'};
 for(const player of players)for(const cell of player.cells||[]){const a={cell:ensure(cell,c),player,kind:'player'},hit=eatable(manifold(a,b,c),c);if(hit?.big===a)return{player,cell,at:0};}
 return null;
}
export const dualTarKernel=Object.freeze({speed,mergeDelay,boost,splitCell,autoSplit,moveCells,decayMass,eject,
 mergeCells:(player,time,width,c)=>resolveOwn(player,time,width,c,true),popParts,pop,resolveOnly,step,makeVirus,foodRecipient});
