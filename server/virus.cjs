'use strict';
/** Vintage crystal-virus rules. Shared by the offline client and authoritative server. */
const VIRUS_BASE_MASS = 100;
const VIRUS_FEEDS_TO_SHOOT = 7;
const VIRUS_MIN_COUNT = 8;
const VIRUS_MAX_COUNT = 32;
const VIRUS_MIN_FRAGMENT_MASS = 300;
const virusRadius = virus => 36 + Math.min(16, (virus.feedCount || 0) * 2);
function makeVirus(x,y,angle=0) {
  return {x,y,mass:VIRUS_BASE_MASS,feedCount:0,vx:0,vy:0,angle};
}
const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
const distance = (x1,y1,x2,y2) => Math.hypot(x2-x1,y2-y1);

/** Consumes ejected food, launches fed viruses, and bursts sufficiently large player cells. */
function stepViruses({viruses, food, players, width, maxCells, time, dt, spawnVirus, addRespawn, physics={}, mergeDelay, findFoodReceiver}) {
  const virusDrag=-30*Math.log(.90),pelletDrag=-30*Math.log(.91);
  const virusTravel=(1-Math.exp(-virusDrag*dt))/virusDrag;
  for (const virus of viruses) {
    virus.x=clamp(virus.x+(virus.vx||0)*virusTravel,virusRadius(virus),width-virusRadius(virus));
    virus.y=clamp(virus.y+(virus.vy||0)*virusTravel,virusRadius(virus),width-virusRadius(virus));
    const damp=Math.pow(.90, dt*30);
    virus.vx=(virus.vx||0)*damp;
    virus.vy=(virus.vy||0)*damp;
  }

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
    if(Number.isFinite(pellet.maxTravelDistance)&&Number.isFinite(pellet.sourceX)&&Number.isFinite(pellet.sourceY)){
      const dx=pellet.x-pellet.sourceX,dy=pellet.y-pellet.sourceY,distance=Math.hypot(dx,dy);
      if(distance>pellet.maxTravelDistance){
        const scale=pellet.maxTravelDistance/distance;
        pellet.x=pellet.sourceX+dx*scale;pellet.y=pellet.sourceY+dy*scale;pellet.vx=0;pellet.vy=0;
      }
    }
    // Sweep the whole flight segment: fast feed must not jump through a virus between ticks.
    const dx=pellet.x-startX,dy=pellet.y-startY,length2=dx*dx+dy*dy;
    let hit=null,first=Infinity;
    for(const virus of viruses){
      const radius=virusRadius(virus)+Math.sqrt(pellet.mass||24)*.85;
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
      virus.mass=VIRUS_BASE_MASS+virus.feedCount*22;
      virus.angle=angle;
      food.splice(i,1);
      if (virus.feedCount>=VIRUS_FEEDS_TO_SHOOT) {
        virus.feedCount=0;
        virus.mass=VIRUS_BASE_MASS;
        if (viruses.length<VIRUS_MAX_COUNT) {
          const shoot=makeVirus(
            clamp(virus.x+Math.cos(angle)*virusRadius(virus)*2.6,55,width-55),
            clamp(virus.y+Math.sin(angle)*virusRadius(virus)*2.6,55,width-55),angle
          );
          shoot.vx=Math.cos(angle)*540;
          shoot.vy=Math.sin(angle)*540;
          viruses.push(shoot);
        } else {
          const spare=viruses.find(v=>v!==virus && Math.hypot(v.vx||0,v.vy||0)<5);
          if (spare) { spare.vx=Math.cos(angle)*540; spare.vy=Math.sin(angle)*540; }
        }
      }
    }
  }

  for (let vi=viruses.length-1;vi>=0;vi--) {
    const virus=viruses[vi];
    let triggered=false;
    for (const p of players) {
      if (!p.cells?.length) continue;
      for (const cell of [...p.cells]) {
        const r=Math.max(13,Math.sqrt(Math.max(1,cell.mass))*2.45);
        if (distance(cell.x,cell.y,virus.x,virus.y)>r+virusRadius(virus)*.3) continue;
        if (cell.mass<600) continue;
        const free=maxCells-p.cells.length;
        // Repeatedly halve the struck piece, matching the descending fragment sizes in the reference.
        const total=cell.mass+VIRUS_BASE_MASS,fragmentMasses=[];
        let retained=total;
        while(fragmentMasses.length<free&&retained/2>=VIRUS_MIN_FRAGMENT_MASS){
          retained/=2;
          fragmentMasses.push(retained);
        }
        // At the fragment cap a virus is consumed without adding cells.
        const cooldown=mergeDelay?mergeDelay(Math.max(retained,...fragmentMasses)):13;
        const mergeAt=Math.max(cell.mergeAt||0,time+cooldown);
        cell.mass=retained;
        cell.mergeAt=mergeAt;
        cell.collideAt=time+.6;
        for (let k=0;k<fragmentMasses.length;k++) {
          const theta=k*Math.PI*2/Math.max(1,fragmentMasses.length)+(virus.angle||0);
          const impulse=220+Math.min(260,Math.sqrt(total)*5);
          const mass=fragmentMasses[k];
          p.cells.push({
            x:clamp(cell.x+Math.cos(theta)*Math.sqrt(mass)*1.35,Math.max(13,Math.sqrt(mass)*2.45),width-Math.max(13,Math.sqrt(mass)*2.45)),
            y:clamp(cell.y+Math.sin(theta)*Math.sqrt(mass)*1.35,Math.max(13,Math.sqrt(mass)*2.45),width-Math.max(13,Math.sqrt(mass)*2.45)),
            mass,color:cell.color,
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

module.exports={VIRUS_BASE_MASS,VIRUS_FEEDS_TO_SHOOT,VIRUS_MIN_COUNT,VIRUS_MAX_COUNT,VIRUS_MIN_FRAGMENT_MASS,virusRadius,makeVirus,stepViruses};
