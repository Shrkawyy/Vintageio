/** Vintage crystal-virus rules with 8 virus cap and 4-minute respawn delay. */
export const VIRUS_BASE_MASS = 100;
export const VIRUS_FEEDS_TO_SHOOT = 7;
export const VIRUS_MIN_COUNT = 8;
export const VIRUS_MAX_COUNT = 8;
export const VIRUS_RESPAWN_DELAY = 240; // 4 minutes in seconds
export const virusRadius = virus => 36 + Math.min(16, (virus.feedCount || 0) * 2);
export function makeVirus(x,y,angle=0,respawnAt=0) {
  return {x,y,mass:VIRUS_BASE_MASS,feedCount:0,vx:0,vy:0,angle,respawnAt};
}
const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
const distance = (x1,y1,x2,y2) => Math.hypot(x2-x1,y2-y1);

export function stepViruses({viruses, food, players, width, maxCells, time, dt, spawnVirus}) {
  // Handle delayed virus respawns (4 minutes = 240 seconds)
  for (let i = viruses.length - 1; i >= 0; i--) {
    const v = viruses[i];
    if (v.inactive && time >= (v.respawnAt || 0)) {
      v.inactive = false;
      v.x = v.spawnX;
      v.y = v.spawnY;
      v.mass = VIRUS_BASE_MASS;
      v.feedCount = 0;
      v.vx = 0;
      v.vy = 0;
    }
    if (v.inactive) continue;

    v.x=clamp(v.x+(v.vx||0)*dt,virusRadius(v),width-virusRadius(v));
    v.y=clamp(v.y+(v.vy||0)*dt,virusRadius(v),width-virusRadius(v));
    const damp=Math.pow(.90, dt*30);
    v.vx=(v.vx||0)*damp;
    v.vy=(v.vy||0)*damp;
  }

  // Ejected pellets feed viruses
  for (let i=food.length-1;i>=0;i--) {
    const pellet=food[i];
    if (!pellet.ejected) continue;
    pellet.x=clamp(pellet.x+(pellet.vx||0)*dt,0,width);
    pellet.y=clamp(pellet.y+(pellet.vy||0)*dt,0,width);
    pellet.vx=(pellet.vx||0)*Math.pow(.91,dt*30);
    pellet.vy=(pellet.vy||0)*Math.pow(.91,dt*30);
    for (const virus of viruses) {
      if (virus.inactive) continue;
      if (distance(pellet.x,pellet.y,virus.x,virus.y) > virusRadius(virus)+12) continue;
      const dx=pellet.x-virus.x,dy=pellet.y-virus.y;
      const incoming=Math.hypot(pellet.vx||0,pellet.vy||0);
      const angle=incoming>3?Math.atan2(pellet.vy,pellet.vx):Math.atan2(dy,dx);
      virus.feedCount=(virus.feedCount||0)+1;
      virus.mass=VIRUS_BASE_MASS+virus.feedCount*22;
      virus.angle=angle;
      food.splice(i,1);
      if (virus.feedCount>=VIRUS_FEEDS_TO_SHOOT) {
        virus.feedCount=0;
        virus.mass=VIRUS_BASE_MASS;
        const spare=viruses.find(v=>v!==virus && v.inactive);
        if (spare) {
          spare.inactive=false;
          spare.x=clamp(virus.x+Math.cos(angle)*virusRadius(virus)*2.6,55,width-55);
          spare.y=clamp(virus.y+Math.sin(angle)*virusRadius(virus)*2.6,55,width-55);
          spare.vx=Math.cos(angle)*650;
          spare.vy=Math.sin(angle)*650;
        }
      }
      break;
    }
  }

  // Virus collision bursting
  for (let vi=0;vi<viruses.length;vi++) {
    const virus=viruses[vi];
    if (virus.inactive) continue;
    let triggered=false;
    for (const p of players) {
      if (!p.cells?.length) continue;
      for (const cell of [...p.cells]) {
        const r=Math.max(13,Math.sqrt(Math.max(1,cell.mass))*2.45);
        if (distance(cell.x,cell.y,virus.x,virus.y)>r) continue;
        if (cell.mass<130 || p.cells.length>=maxCells) continue;
        const free=maxCells-p.cells.length;
        const copies=Math.min(free,Math.max(3,Math.min(15,Math.floor(cell.mass/110))));
        if (!copies) continue;
        const newCount=copies+1, total=cell.mass+VIRUS_BASE_MASS;
        const massEach=total/newCount;
        cell.mass=massEach;
        cell.mergeAt=time+10;
        for (let k=0;k<copies;k++) {
          const theta=k*Math.PI*2/copies+(virus.angle||0);
          const impulse=400+Math.min(350,Math.sqrt(total)*8);
          p.cells.push({
            x:clamp(cell.x+Math.cos(theta)*Math.sqrt(massEach)*1.5,20,width-20),
            y:clamp(cell.y+Math.sin(theta)*Math.sqrt(massEach)*1.5,20,width-20),
            mass:massEach,color:cell.color,
            vx:Math.cos(theta)*impulse,vy:Math.sin(theta)*impulse,mergeAt:time+10
          });
        }
        // Virus is consumed / popped, schedule respawn in 4 minutes (240s)
        virus.inactive = true;
        virus.spawnX = virus.x;
        virus.spawnY = virus.y;
        virus.respawnAt = time + VIRUS_RESPAWN_DELAY;
        virus.x = -9999; virus.y = -9999;
        triggered=true;
        break;
      }
      if (triggered) break;
    }
  }
}
