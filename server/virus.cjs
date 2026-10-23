'use strict';
/** Vintage crystal-virus rules. Shared by the offline client and authoritative server. */
const VIRUS_BASE_MASS = 100;
// Seven 25-mass FFA pellets fill a crystal; other pellets charge by actual mass.
const VIRUS_CHARGE_MASS = 175;
const VIRUS_MIN_COUNT = 8;
const VIRUS_MAX_COUNT = 64;
const virusCharge = virus => Math.max(0, virus.feedMass || 0);
const virusRadius = virus => 36 + Math.min(16, virusCharge(virus) / VIRUS_CHARGE_MASS * 16);
let nextVirusId=0;
function makeVirus(x,y,angle=0) {
  return {id:++nextVirusId,x,y,mass:VIRUS_BASE_MASS,feedMass:0,feedCount:0,vx:0,vy:0,angle};
}
const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
const distance = (x1,y1,x2,y2) => Math.hypot(x2-x1,y2-y1);

/** Consumes ejected food, launches fed viruses, and bursts sufficiently large player cells. */
function stepViruses({viruses, food, players, width, maxCells, time, dt, spawnVirus, addRespawn, physics={}, mergeDelay, findFoodReceiver}) {
  const virusDrag=-30*Math.log(.90),pelletDrag=-30*Math.log(.91);
  const virusTravel=(1-Math.exp(-virusDrag*dt))/virusDrag;
  const release = virus => {
    if (virusCharge(virus)<VIRUS_CHARGE_MASS || viruses.length>=VIRUS_MAX_COUNT) return;
    let dx=Math.cos(virus.angle||0),dy=Math.sin(virus.angle||0);
    const gap=36*2.6,r=36;
    // Reflect an outward launch at the wall, keeping child and parent separated.
    if(virus.x+dx*gap<r || virus.x+dx*gap>width-r)dx=-dx;
    if(virus.y+dy*gap<r || virus.y+dy*gap>width-r)dy=-dy;
    const shoot=makeVirus(clamp(virus.x+dx*gap,r,width-r),clamp(virus.y+dy*gap,r,width-r),Math.atan2(dy,dx));
    shoot.originX=virus.x;shoot.originY=virus.y;
    shoot.vx=dx*540;shoot.vy=dy*540;viruses.push(shoot);
    virus.feedMass=Math.max(0,virusCharge(virus)-VIRUS_CHARGE_MASS);
    virus.feedCount=0;virus.mass=VIRUS_BASE_MASS+virus.feedMass;
  };
  for (const virus of viruses) {
    virus.x=clamp(virus.x+(virus.vx||0)*virusTravel,virusRadius(virus),width-virusRadius(virus));
    virus.y=clamp(virus.y+(virus.vy||0)*virusTravel,virusRadius(virus),width-virusRadius(virus));
    const damp=Math.pow(.90, dt*30);
    virus.vx=(virus.vx||0)*damp;
    virus.vy=(virus.vy||0)*damp;
  }
  // At the cap, retain the full charge and release as soon as space becomes available.
  for (const virus of [...viruses]) release(virus);

  // Pellets fired with W actually travel, then feed a virus that they hit.
  for (let i=food.length-1;i>=0;i--) {
    const pellet=food[i];
    if (!pellet.ejected) continue;
    if(time>=(pellet.expiresAt??Infinity)){food.splice(i,1);continue;}
    const drag=pellet.drag||pelletDrag,travel=(1-Math.exp(-drag*dt))/drag;
    const startX=pellet.x,startY=pellet.y;
    pellet.previousX=startX;pellet.previousY=startY;
    pellet.x=clamp(pellet.x+(pellet.vx||0)*travel,0,width);
    pellet.y=clamp(pellet.y+(pellet.vy||0)*travel,0,width);
    pellet.vx=(pellet.vx||0)*Math.exp(-drag*dt);
    pellet.vy=(pellet.vy||0)*Math.exp(-drag*dt);
    // Sweep the whole flight segment: fast feed must not jump through a virus between ticks.
    const dx=pellet.x-startX,dy=pellet.y-startY,length2=dx*dx+dy*dy;
    let hit=null,first=Infinity;
    for(const virus of viruses){
      const radius=virusRadius(virus)+(pellet.radius||Math.sqrt(pellet.mass||24)*.85);
      const ox=startX-virus.x,oy=startY-virus.y,c=ox*ox+oy*oy-radius*radius;
      let at=0;
      if(c>0){
        if(!length2)continue;
        const b=ox*dx+oy*dy,disc=b*b-length2*c;
        if(disc<0)continue;
        at=(-b-Math.sqrt(disc))/length2;
        if(at<0||at>1)continue;
      }
      if(at<first){hit=virus;first=at;}
    }
    if(hit&&findFoodReceiver){
      const receiver=findFoodReceiver(pellet);
      if(receiver&&receiver.at<=first)hit=null;
    }
    if(hit){
      const virus=hit;
      pellet.x=startX+dx*first;pellet.y=startY+dy*first;
      const impactX=pellet.x-virus.x,impactY=pellet.y-virus.y;
      const incoming=Math.hypot(pellet.vx||0,pellet.vy||0);
      const angle=incoming>3?Math.atan2(pellet.vy,pellet.vx):Math.atan2(impactY,impactX);
      virus.feedCount=(virus.feedCount||0)+1;
      virus.feedMass=Math.min(VIRUS_CHARGE_MASS*2,virusCharge(virus)+Math.max(0,Number(pellet.mass)||0));
      virus.mass=VIRUS_BASE_MASS+virus.feedMass;
      virus.angle=angle;
      food.splice(i,1);
      release(virus);
    }
  }

  for (let vi=viruses.length-1;vi>=0;vi--) {
    const virus=viruses[vi];
    let triggered=false;
    for (const p of players) {
      if (!p.cells?.length) continue;
      for (const cell of [...p.cells]) {
        const r=Math.max(13,Math.sqrt(Math.max(1,cell.mass))*2.45);
        // The crystal must be swallowed, rather than triggering outside the cell's edge.
        if (distance(cell.x,cell.y,virus.x,virus.y)>r-virusRadius(virus)*.39) continue;
        if (cell.mass<600) continue;
        const free=maxCells-p.cells.length;
        // Distribute the entire struck piece into all available fragment slots.
        const bonus=VIRUS_BASE_MASS+virusCharge(virus);
        const copies=Math.max(0,Math.min(free,Math.floor((cell.mass+bonus)/25)-1));
        // At the fragment cap a virus is consumed without adding cells.
        const newCount=copies+1, total=cell.mass+bonus;
        const retained=total/newCount;
        const massEach=copies?(total-retained)/copies:total;
        const cooldown=mergeDelay?mergeDelay(Math.max(retained,massEach)):13;
        const mergeAt=Math.max(cell.mergeAt||0,time+cooldown);
        cell.mass=retained;
        if(copies){cell.mergeAt=mergeAt;cell.collideAt=time+.6;}
        for (let k=0;k<copies;k++) {
          const theta=k*Math.PI*2/copies+(virus.angle||0);
          const impulse=220+Math.min(260,Math.sqrt(total)*5);
          p.cells.push({
            x:clamp(cell.x,Math.max(13,Math.sqrt(massEach)*2.45),width-Math.max(13,Math.sqrt(massEach)*2.45)),
            y:clamp(cell.y,Math.max(13,Math.sqrt(massEach)*2.45),width-Math.max(13,Math.sqrt(massEach)*2.45)),
            originX:cell.x,originY:cell.y,
            mass:massEach,color:cell.color,
            vx:Math.cos(theta)*impulse,vy:Math.sin(theta)*impulse,mergeAt,collideAt:time+.6
          });
        }
        viruses.splice(vi,1);
        // Replace one consumed virus, subject to the world cap.
        if (addRespawn) {
          addRespawn(time + 20, 1);
        } else if (spawnVirus) {
          viruses.push(spawnVirus());
        }
        triggered=true;
        break;
      }
      if (triggered) break;
    }
  }
}

module.exports={VIRUS_BASE_MASS,VIRUS_CHARGE_MASS,VIRUS_MIN_COUNT,VIRUS_MAX_COUNT,virusCharge,virusRadius,makeVirus,stepViruses};
