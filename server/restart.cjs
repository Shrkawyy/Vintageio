'use strict';
const INTERVAL=3*60*60*1000;
class RestartCycle{
  constructor(now=Date.now(),intervalMs=INTERVAL){this.intervalMs=intervalMs;this.nextAt=now+intervalMs;this.sent=new Set();}
  poll(now=Date.now()){
    const events=[],remaining=this.nextAt-now;
    if(remaining<=0){events.push({kind:'restart',at:this.nextAt});this.nextAt=now+this.intervalMs;this.sent.clear();return events;}
    for(const minutes of [10,5]){
      if(remaining<=minutes*60000&&!this.sent.has(minutes)){
        this.sent.add(minutes);events.push({kind:'warning',minutes,remainingMs:remaining});
      }
    }
    return events;
  }
  schedule(){return{type:'server_schedule',nextRestartAt:this.nextAt,intervalMs:this.intervalMs};}
}
module.exports={RestartCycle,INTERVAL};
