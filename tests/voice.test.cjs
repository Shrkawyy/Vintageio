'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createVoiceHub,cleanSignal,iceServersFromEnv}=require('../server/voice.cjs');
function setup(options={}){
 const packets=new Map(),hub=createVoiceHub({send:(ws,p)=>{if(!packets.has(ws))packets.set(ws,[]);packets.get(ws).push(p);},...options});
 const room=()=>({players:new Map()});let n=0;
 const user=(r,tag='PRIVATE',multiKey)=>{const ws={},player={id:'player'+(++n),name:'Guest'+n,tag,multiKey};r.players.set(player.id,player);return{ws,current:{room:r,player}};};
 const send=(u,msg)=>hub.handle(u.ws,u.current,msg),join=u=>{send(u,{type:'voice_join'});return packets.get(u.ws).findLast(p=>p.type==='voice_welcome');};
 return{hub,packets,room,user,send,join};
}
test('voice requires a joined nonempty tag and excludes spectators and bots',()=>{
 const h=setup(),r=h.room(),u=h.user(r,'');assert.equal(h.join(u),undefined);assert.equal(h.hub.size,0);
 h.hub.handle({},null,{type:'voice_join'});u.current.player.tag='TEAM';u.current.player.npc=true;assert.equal(h.join(u),undefined);
});
test('voice membership is private to both the canonical tag and the game room',()=>{
 const h=setup(),r=h.room(),a=h.user(r),b=h.user(r),foreign=h.user(r,'OTHER'),otherRoom=h.user(h.room());
 const wa=h.join(a),wf=h.join(foreign),wo=h.join(otherRoom),wb=h.join(b);
 assert.equal(wb.peers.length,1);assert.equal(wb.peers[0].id,wa.id);assert.equal(wf.peers.length,0);assert.equal(wo.peers.length,0);
 const wire=JSON.stringify([...h.packets.values()]);assert.ok(!wire.includes('PRIVATE'));assert.ok(!wire.includes('OTHER'));assert.ok(!wire.includes('player1'));
});
test('only same-room same-tag enrolled peers can exchange audio-only signaling',()=>{
 const h=setup(),r=h.room(),a=h.user(r),b=h.user(r),c=h.user(r,'OTHER'),stranger=h.user(r);
 const wa=h.join(a),wb=h.join(b),wc=h.join(c),signal={description:{type:'offer',sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'}};
 h.send(a,{type:'voice_signal',to:wb.id,signal,tag:'OTHER',from:'spoof'});
 const received=h.packets.get(b.ws).at(-1);assert.equal(received.type,'voice_signal');assert.equal(received.from,wa.id);assert.deepEqual(received.signal,signal);
 const before=h.packets.get(c.ws).length;h.send(a,{type:'voice_signal',to:wc.id,signal});assert.equal(h.packets.get(c.ws).length,before);
 const beforeB=h.packets.get(b.ws).length;h.send(stranger,{type:'voice_signal',to:wb.id,signal});assert.equal(h.packets.get(b.ws).length,beforeB);
});
test('multibox connections share only one voice endpoint without exposing the linking key',()=>{
 const h=setup(),r=h.room(),a=h.user(r,'PRIVATE','a'.repeat(32)),second=h.user(r,'PRIVATE','a'.repeat(32));h.join(a);h.join(second);
 assert.equal(h.hub.size,1);assert.equal(h.packets.get(second.ws).at(-1).code,'duplicate_connection');assert.ok(!JSON.stringify([...h.packets.values()]).includes('a'.repeat(32)));
});
test('mute/speaking state is constrained and leaving removes peers immediately',()=>{
 const h=setup(),r=h.room(),a=h.user(r),b=h.user(r);const wa=h.join(a);h.join(b);
 h.send(a,{type:'voice_state',muted:true,talking:true});h.send(a,{type:'voice_state',muted:false,talking:true});
 const state=h.packets.get(b.ws).at(-1);assert.equal(state.peer.talking,true);assert.equal(state.peer.muted,false);
 h.send(a,{type:'voice_state',muted:true,talking:true});assert.equal(h.packets.get(b.ws).at(-1).peer.talking,false);
 h.hub.leave(a.ws);assert.equal(h.packets.get(b.ws).at(-1).id,wa.id);assert.equal(h.hub.size,1);h.hub.clear();assert.equal(h.hub.size,0);
});
test('voice capacity, game removal and rate limiting remain bounded',()=>{
 let now=0;const h=setup({limit:2,now:()=>now}),r=h.room(),a=h.user(r),b=h.user(r),c=h.user(r);h.join(a);h.join(b);assert.equal(h.join(c),undefined);assert.equal(h.packets.get(c.ws).at(-1).code,'room_full');
 const before=h.packets.get(b.ws).length;for(let i=0;i<500;i++)h.send(a,{type:'voice_state',muted:!!(i%2),talking:false});assert.ok(h.packets.get(b.ws).length-before<=180);
 now=5000;r.players.delete(a.current.player.id);h.send(a,{type:'voice_state',muted:false,talking:false});assert.equal(h.hub.size,1);
});
test('signaling rejects video/data channels, huge SDP, malformed ICE and unknown fields',()=>{
 assert.equal(cleanSignal({description:{type:'offer',sdp:'m=video 9 UDP/TLS/RTP/SAVPF 111'}}),null);
 assert.equal(cleanSignal({description:{type:'offer',sdp:'m=audio 9 RTP/AVP 111\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel'}}),null);
 assert.equal(cleanSignal({description:{type:'offer',sdp:'m=audio '+ 'x'.repeat(13000)}}),null);
 assert.equal(cleanSignal({candidate:{candidate:'x',sdpMLineIndex:-1}}),null);
 assert.deepEqual(cleanSignal({candidate:null,tag:'private'}),{candidate:null});
 assert.deepEqual(cleanSignal({candidate:{candidate:'candidate:1',sdpMid:'0',sdpMLineIndex:0,secret:'no'}}),{candidate:{candidate:'candidate:1',sdpMid:'0',sdpMLineIndex:0}});
});
test('ICE configuration accepts bounded STUN/TURN settings and rejects malformed configuration',()=>{
 assert.deepEqual(iceServersFromEnv('[]'),[]);assert.ok(iceServersFromEnv()[0].urls.startsWith('stun:'));
 const cfg=iceServersFromEnv('[{"urls":["turns:turn.example.com:443"],"username":"u","credential":"p"}]');assert.equal(cfg[0].credential,'p');
 assert.throws(()=>iceServersFromEnv('{bad'),/JSON/);assert.throws(()=>iceServersFromEnv('[{"urls":"https://example.com"}]'),/URL/);
});
