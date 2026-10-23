/** Audio stays in WebRTC. Only membership, mute state and signaling use the game socket. */
export class TagVoice{
  constructor(root,{iceServers=()=>undefined}={}){
    this.root=root;this.getIceServers=iceServers;this.peers=new Map();this.transport=null;this.ready=false;this.tagged=false;this.active=false;this.busy=false;this.epoch=0;this.id=null;this.stream=null;this.context=null;this.notice='';
    let prefs={};try{prefs=JSON.parse(localStorage.getItem('vintage-voice-prefs')||'{}');}catch{}
    this.master=Number.isFinite(prefs.master)?Math.max(0,Math.min(100,prefs.master)):100;this.micMuted=!!prefs.micMuted;this.deafened=!!prefs.deafened;
    const node=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls||'';if(text!==undefined)e.textContent=text;return e;};this.node=node;
    const button=(label,fn)=>{const b=node('button','',label);b.type='button';b.onclick=fn;return b;};this.button=button;
    root.setAttribute('aria-label','Tag voice');
    const head=node('div','voice-head');head.append(node('strong','','TAG VOICE'));this.count=node('span','','PRIVATE');head.append(this.count);
    this.status=node('p','voice-status','Join voice to talk with your tag.');this.status.setAttribute('role','status');
    this.joinButton=button('Join voice',()=>this.join(false));this.listenButton=button('Listen only',()=>this.join(true));this.joinActions=node('div','voice-actions');this.joinActions.append(this.joinButton,this.listenButton);
    this.micButton=button('Mic on',()=>this.stream?this.toggleMic():this.enableMic());this.micButton.setAttribute('aria-label','Mute my microphone');
    this.deafenButton=button('Sound on',()=>{this.deafened=!this.deafened;this.savePrefs();this.applyVolumes();this.render();});
    this.leaveButton=button('Leave',()=>this.leave());this.leaveButton.setAttribute('aria-label','Leave tag voice');
    this.liveActions=node('div','voice-actions');this.liveActions.append(this.micButton,this.deafenButton,this.leaveButton);
    this.masterRow=node('label','voice-master');this.masterRow.append(node('span','','All voices'));
    this.masterInput=node('input');this.masterInput.type='range';this.masterInput.min='0';this.masterInput.max='100';this.masterInput.value=this.master;this.masterInput.setAttribute('aria-label','All voice volume');
    this.masterValue=node('output','',this.master+'%');this.masterInput.oninput=()=>{this.master=+this.masterInput.value;this.masterValue.textContent=this.master+'%';this.savePrefs();this.applyVolumes();};this.masterRow.append(this.masterInput,this.masterValue);
    this.selfRow=node('div','voice-self','You');this.peerList=node('div','voice-peers');this.empty=node('p','voice-empty','Waiting for your tag teammates…');
    this.resumeButton=button('Enable sound',()=>this.resumeAudio());this.resumeButton.hidden=true;
    root.append(head,this.status,this.joinActions,this.liveActions,this.masterRow,this.selfRow,this.peerList,this.empty,this.resumeButton);this.render();
    root.addEventListener('keydown',event=>event.stopPropagation());
    window.addEventListener('pagehide',()=>this.leave());
  }
  savePrefs(){try{localStorage.setItem('vintage-voice-prefs',JSON.stringify({master:this.master,micMuted:this.micMuted,deafened:this.deafened}));}catch{}}
  setContext({tagged=false,live=false}={}){this.tagged=!!tagged;this.ready=!!live&&!!this.transport;this.render();}
  bind(transport){if(this.transport!==transport){this.leave();this.transport=transport;}this.tagged=!!transport.opts.tag;this.ready=!!transport.connected&&!transport.opts.spectator;this.render();}
  detach(transport=this.transport){if(transport!==this.transport)return;this.leave(false);this.transport=null;this.ready=false;this.render();}
  send(message){const ws=this.transport?.sockets?.[0];if(ws?.readyState!==WebSocket.OPEN)return false;ws.send(JSON.stringify(message));return true;}
  async resumeAudio(){
    try{if(!this.context){const Context=window.AudioContext||window.webkitAudioContext;if(Context)this.context=new Context();}
      if(this.context?.state==='suspended')await this.context.resume();
      for(const p of this.peers.values())for(const element of [p.audio,p.decoder].filter(Boolean))await element.play().then(()=>{p.needsPlay=false;}).catch(()=>{p.needsPlay=true;});
      this.resumeButton.hidden=!(this.context?.state==='suspended'||[...this.peers.values()].some(p=>p.needsPlay));
    }catch{this.resumeButton.hidden=false;}
  }
  async join(listenOnly=false){
    if(!this.ready||!this.tagged||this.busy||this.active)return;
    this.leave(false);this.busy=true;this.notice='';const epoch=this.epoch;this.render();await this.resumeAudio();
    if(epoch!==this.epoch)return;
    if(!listenOnly){try{await this.captureMic(epoch);}catch(error){if(epoch!==this.epoch)return;this.notice=error.name==='NotAllowedError'?'Microphone blocked. You can still listen; enable mic when ready.':'No microphone available. You can still listen.';}}
    if(epoch!==this.epoch)return;
    if(!this.send({type:'voice_join'})){this.leave(false);this.notice='Connect to a live game before joining voice.';this.render();}
    else this.joinTimer=setTimeout(()=>{if(this.busy&&!this.active){this.leave();this.notice='Voice did not answer. Check that the game backend is updated, then retry.';this.render();}},10000);
  }
  async captureMic(epoch){
    if(!navigator.mediaDevices?.getUserMedia){const error=Error('Microphone needs HTTPS or localhost');error.name='NotAllowedError';throw error;}
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    if(epoch!==this.epoch){for(const track of stream.getTracks())track.stop();return;}
    this.stream=stream;for(const track of stream.getAudioTracks()){
      track.enabled=!this.micMuted;
      track.onended=()=>{if(this.stream!==stream)return;this.stream=null;this.localSource?.disconnect();this.localSource=null;this.localAnalyser=null;for(const p of this.peers.values())p.transceiver.sender.replaceTrack(null).catch(()=>{});this.notice='Microphone disconnected. Enable mic to try again.';this.sendState(false);this.render();};
    }
    if(this.context){this.localSource=this.context.createMediaStreamSource(stream);this.localAnalyser=this.context.createAnalyser();this.localAnalyser.fftSize=512;this.localSource.connect(this.localAnalyser);}
    const track=stream.getAudioTracks()[0];for(const peer of this.peers.values())await peer.transceiver.sender.replaceTrack(track).catch(()=>{});
  }
  async enableMic(){
    if(!this.active||this.busy)return;const epoch=this.epoch;this.busy=true;this.render();await this.resumeAudio();
    try{this.micMuted=false;await this.captureMic(epoch);if(epoch!==this.epoch)return;this.notice='';this.savePrefs();this.sendState(false);}catch{this.notice='Allow microphone access in the browser, then try Enable mic.';}
    if(epoch===this.epoch){this.busy=false;this.render();}
  }
  toggleMic(){this.micMuted=!this.micMuted;for(const track of this.stream?.getAudioTracks()||[])track.enabled=!this.micMuted;this.savePrefs();this.sendState(false);this.render();}
  sendState(talking=false){if(!this.active)return;const muted=!this.stream||this.micMuted;this.talking=!muted&&talking;this.send({type:'voice_state',muted,talking:this.talking});this.selfRow.classList.toggle('is-speaking',this.talking);}
  handle(message){
    if(message.type==='voice_welcome'){
      if(!this.busy&&!this.active)return;
      clearTimeout(this.joinTimer);this.joinTimer=null;
      this.id=message.id;this.active=true;this.busy=false;this.iceServers=this.getIceServers()??message.iceServers??[];this.limit=message.limit;
      for(const peer of message.peers||[])this.createPeer(peer);this.sendState(false);clearInterval(this.levelTimer);
      this.levelTimer=setInterval(()=>this.levelTick(),150);this.render();
    }else if(message.type==='voice_peer_joined'&&this.active){this.createPeer(message.peer);this.render();}
    else if(message.type==='voice_peer_left'){this.removePeer(message.id);this.render();}
    else if(message.type==='voice_peer_state'){
      const p=this.peers.get(message.peer?.id);if(p){p.muted=!!message.peer.muted;p.talking=!!message.peer.talking;this.renderPeer(p);}
    }else if(message.type==='voice_signal'&&this.active){
      const p=this.peers.get(message.from);if(p)p.queue=p.queue.then(()=>this.receive(p,message.signal)).catch(()=>{if(this.peers.get(p.id)===p){p.connection='failed';this.renderPeer(p);}});
    }else if(message.type==='voice_error'){this.leave(false);this.notice=message.message||'Voice is unavailable';this.render();}
    else if(message.type==='voice_left'){this.leave(false);}
  }
  createPeer(info){
    if(!info?.id||info.id===this.id||this.peers.has(info.id))return;
    const pc=new RTCPeerConnection({iceServers:this.iceServers||[]});
    const p={id:info.id,name:String(info.name||'Player'),muted:!!info.muted,talking:!!info.talking,localMuted:false,volume:100,pc,queue:Promise.resolve(),candidates:[],makingOffer:false,ignoreOffer:false,settingAnswer:false,polite:this.id>info.id,connection:'connecting'};
    this.peers.set(p.id,p);
    const track=this.stream?.getAudioTracks()[0];p.transceiver=pc.addTransceiver(track||'audio',{direction:'sendrecv',...(track?{streams:[this.stream]}:{})});
    pc.onicecandidate=event=>{if(this.peers.get(p.id)===p)this.send({type:'voice_signal',to:p.id,signal:{candidate:event.candidate?.toJSON()??null}});};
    pc.onnegotiationneeded=async()=>{try{p.makingOffer=true;await pc.setLocalDescription();if(this.peers.get(p.id)===p)this.send({type:'voice_signal',to:p.id,signal:{description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}}});}catch{if(pc.signalingState!=='closed'){p.connection='failed';this.renderPeer(p);}}finally{p.makingOffer=false;}};
    pc.ontrack=event=>{
      if(this.peers.get(p.id)!==p)return;
      p.source?.disconnect();p.gain?.disconnect();if(p.decoder){p.decoder.pause();p.decoder.srcObject=null;p.decoder.remove();}const stream=new MediaStream([event.track]);p.stream=stream;
      if(this.context){
        // Chromium needs a media-element puller for remote WebRTC -> Web Audio:
        // https://issues.chromium.org/issues/40094084 . It stays muted; only GainNode is audible.
        p.decoder=document.createElement('audio');p.decoder.muted=true;p.decoder.autoplay=true;p.decoder.hidden=true;p.decoder.srcObject=stream;p.decoder.setAttribute('playsinline','');this.root.append(p.decoder);p.decoder.play().catch(()=>{p.needsPlay=true;this.resumeButton.hidden=false;});
        p.source=this.context.createMediaStreamSource(stream);p.gain=this.context.createGain();p.source.connect(p.gain);p.gain.connect(this.context.destination);
      }else{p.audio=document.createElement('audio');p.audio.autoplay=true;p.audio.srcObject=stream;p.audio.setAttribute('playsinline','');p.audio.play().catch(()=>{p.needsPlay=true;this.resumeButton.hidden=false;});}
      this.applyPeerVolume(p);this.renderPeer(p);
    };
    pc.onconnectionstatechange=()=>{if(this.peers.get(p.id)!==p)return;p.connection=pc.connectionState;if(p.connection==='failed'&&!p.restarted){p.restarted=true;pc.restartIce();}this.renderPeer(p);};
    const row=this.node('div','voice-peer');row.dataset.voicePeer=p.id;
    const label=this.node('div','voice-peer-label'),dot=this.node('i','voice-dot'),name=this.node('span','',p.name),state=this.node('small');label.append(dot,name,state);p.state=state;
    const controls=this.node('div','voice-peer-controls');p.muteButton=this.button('Mute',()=>{p.localMuted=!p.localMuted;this.applyPeerVolume(p);this.renderPeer(p);});
    const volume=this.node('input');volume.type='range';volume.min='0';volume.max='100';volume.value='100';volume.setAttribute('aria-label','Volume for '+p.name);p.value=this.node('output','','100%');volume.oninput=()=>{p.volume=+volume.value;p.value.textContent=p.volume+'%';this.applyPeerVolume(p);};
    controls.append(p.muteButton,volume,p.value);row.append(label,controls);this.peerList.append(row);p.row=row;this.renderPeer(p);return p;
  }
  async receive(p,signal){
    if(this.peers.get(p.id)!==p||!signal)return;const pc=p.pc;
    if(signal.description){
      const d=signal.description,ready=!p.makingOffer&&(pc.signalingState==='stable'||p.settingAnswer),collision=d.type==='offer'&&!ready;
      p.ignoreOffer=!p.polite&&collision;if(p.ignoreOffer)return;
      p.settingAnswer=d.type==='answer';try{await pc.setRemoteDescription(d);}finally{p.settingAnswer=false;}
      for(const candidate of p.candidates.splice(0))await pc.addIceCandidate(candidate).catch(()=>{});
      if(d.type==='offer'){await pc.setLocalDescription();if(this.peers.get(p.id)===p)this.send({type:'voice_signal',to:p.id,signal:{description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}}});}
    }else if(Object.hasOwn(signal,'candidate')&&!p.ignoreOffer){
      if(!pc.remoteDescription){if(p.candidates.length<64)p.candidates.push(signal.candidate);}
      else await pc.addIceCandidate(signal.candidate).catch(()=>{});
    }
  }
  applyPeerVolume(p){const value=this.deafened||p.localMuted?0:this.master/100*p.volume/100;if(p.gain)p.gain.gain.value=value;if(p.audio){p.audio.volume=value;p.audio.muted=value===0;}}
  applyVolumes(){for(const p of this.peers.values())this.applyPeerVolume(p);}
  renderPeer(p){if(!p.row)return;p.row.classList.toggle('is-speaking',p.talking&&!p.muted);p.row.classList.toggle('is-muted',p.localMuted);p.state.textContent=p.localMuted?'Muted for you':p.connection==='connected'?(p.muted?'Mic muted':'Connected'):p.connection==='failed'?'Network unavailable':'Connecting…';p.muteButton.textContent=p.localMuted?'Unmute':'Mute';p.muteButton.setAttribute('aria-label',(p.localMuted?'Unmute ':'Mute ')+p.name+' for me');p.muteButton.setAttribute('aria-pressed',String(p.localMuted));}
  levelTick(){
    let speaking=false;
    if(this.stream&&!this.micMuted&&this.localAnalyser){const data=new Float32Array(this.localAnalyser.fftSize);this.localAnalyser.getFloatTimeDomainData(data);const rms=Math.sqrt(data.reduce((sum,n)=>sum+n*n,0)/data.length);if(rms>.015)this.lastLoudAt=performance.now();speaking=performance.now()-(this.lastLoudAt||-1000)<300;}
    if(speaking!==!!this.talking)this.sendState(speaking);
    this.resumeButton.hidden=!(this.context?.state==='suspended'||[...this.peers.values()].some(p=>p.needsPlay));
  }
  removePeer(id){const p=this.peers.get(id);if(!p)return;this.peers.delete(id);p.pc.ontrack=p.pc.onicecandidate=p.pc.onnegotiationneeded=p.pc.onconnectionstatechange=null;p.pc.close();p.source?.disconnect();p.gain?.disconnect();for(const element of [p.audio,p.decoder].filter(Boolean)){element.pause();element.srcObject=null;element.remove();}p.row?.remove();}
  leave(notify=true){
    this.epoch++;if(notify&&(this.active||this.busy))this.send({type:'voice_leave'});
    clearTimeout(this.joinTimer);this.joinTimer=null;clearInterval(this.levelTimer);this.levelTimer=null;for(const id of [...this.peers.keys()])this.removePeer(id);
    for(const track of this.stream?.getTracks()||[]){track.onended=null;track.stop();}this.stream=null;this.localSource?.disconnect();this.localSource=null;this.localAnalyser=null;
    this.context?.close().catch(()=>{});this.context=null;this.id=null;this.active=false;this.busy=false;this.talking=false;this.notice='';this.resumeButton.hidden=true;this.render();
  }
  render(){
    this.root.hidden=!this.tagged&&!this.active&&!this.busy;this.root.classList.toggle('voice-active',this.active);this.root.classList.toggle('voice-busy',this.busy);
    this.count.textContent=this.active?(this.peers.size+1)+' IN VOICE':'PRIVATE';
    this.joinActions.hidden=this.active||this.busy;this.liveActions.hidden=!this.active&&!this.busy;
    this.masterRow.hidden=this.selfRow.hidden=!this.active;this.empty.hidden=!this.active||!!this.peers.size;
    this.joinButton.disabled=this.listenButton.disabled=!this.ready||!window.RTCPeerConnection;
    this.micButton.disabled=!this.active||this.busy;this.deafenButton.disabled=!this.active;
    this.micButton.textContent=!this.stream?'Enable mic':this.micMuted?'Mic muted':'Mic on';this.micButton.setAttribute('aria-label',!this.stream?'Enable my microphone':this.micMuted?'Unmute my microphone':'Mute my microphone');this.micButton.setAttribute('aria-pressed',String(!!this.stream&&!this.micMuted));
    this.deafenButton.textContent=this.deafened?'Sound muted':'Sound on';this.deafenButton.setAttribute('aria-label',this.deafened?'Unmute all incoming voice':'Mute all incoming voice');this.deafenButton.setAttribute('aria-pressed',String(this.deafened));
    this.selfRow.textContent='You · '+(!this.stream?'Listening only':this.micMuted?'Microphone muted':'Microphone on');this.selfRow.classList.toggle('is-speaking',!!this.talking);
    this.status.textContent=this.notice||(this.busy?'Connecting voice…':this.active?'Only your tag in this game server.':!window.RTCPeerConnection?'Voice is not supported by this browser.':!this.ready?'Voice requires a live server connection.':'Join to talk, or listen without a microphone.');
  }
}
