"""Two real Chrome WebRTC audio peers; no real microphone or external ICE service."""
import json
import math
import os
import struct
import subprocess
import tempfile
import time
import urllib.request
import wave
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/ffa-2026-10-23'
PORT=38770
BASE=f'http://127.0.0.1:{PORT}'
server=subprocess.Popen(['node','server/index.js'],cwd=ROOT,env={**os.environ,'PORT':str(PORT),'MAX_CONN_PER_IP':'32','VOICE_ICE_SERVERS_JSON':'[]'},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
report={}
try:
    for _ in range(50):
        try:
            urllib.request.urlopen(BASE+'/health',timeout=1).close();break
        except OSError:time.sleep(.1)
    with tempfile.TemporaryDirectory(prefix='vintage-voice-test-') as temp:
        tone=Path(temp)/'voice-tone.wav'
        with wave.open(str(tone),'wb') as audio:
            audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(48000)
            audio.writeframes(b''.join(struct.pack('<h',int(10000*(.55+.45*math.sin(i/48000*math.tau*4))*(math.sin(i/48000*math.tau*440)+.3*math.sin(i/48000*math.tau*880)))) for i in range(48000*4)))
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True,args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+tone.as_posix()])
            source=(ROOT/'public/client.js').read_text(encoding='utf-8-sig')+'\nwindow.__voiceTest={voice,get remote(){return remote},arena};'
            config={'wsUrl':f'ws://127.0.0.1:{PORT}','voiceIceServers':[],'regions':{'EU':[{'id':'eu-ffa','name':'FFA','mode':'ffa','wsUrl':f'ws://127.0.0.1:{PORT}'}],'NA':[],'ASIA':[]}}
            errors=[];contexts=[]
            def create(name,tag,mobile=False):
                context=browser.new_context(viewport={'width':390 if mobile else 1500,'height':844 if mobile else 950},permissions=['microphone'])
                contexts.append(context);page=context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
                page.route('**/config.js',lambda route:route.fulfill(content_type='text/javascript',body='window.VINTAGE_CONFIG='+json.dumps(config)))
                page.route('**/client.js*',lambda route:route.fulfill(content_type='text/javascript',body=source))
                page.add_init_script('''(()=>{const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=constraints=>window.__denyMic?Promise.reject(new DOMException('Test permission denial','NotAllowedError')):original(constraints);})()''')
                page.goto(BASE,wait_until='domcontentloaded');page.locator('#nickname').fill(name);page.locator('#team-tag').fill(tag);page.locator('#play-btn').click()
                page.wait_for_function('window.__voiceTest?.remote?.connected && window.__voiceTest.remote.myIds.filter(Boolean).length===2')
                return page
            def wait(page,expression):
                try:page.wait_for_function(expression,timeout=20000)
                except Exception:
                    print('VOICE DEBUG',page.evaluate('''()=>({active:window.__voiceTest.voice.active,notice:window.__voiceTest.voice.notice,peers:[...window.__voiceTest.voice.peers.values()].map(p=>({name:p.name,state:p.pc.connectionState,ice:p.pc.iceConnectionState,signaling:p.pc.signalingState,local:p.pc.localDescription?.sdp?.length,remote:p.pc.remoteDescription?.sdp?.length,tracks:p.pc.getReceivers().map(r=>({kind:r.track?.kind,state:r.track?.readyState,muted:r.track?.muted}))}))})'''));raise
            alice=create('Alice','VOICE-42');bob=create('Bob','voice-42');outsider=create('Outsider','OTHER');guest=create('Guest','')
            assert not guest.locator('#tag-voice').is_visible()
            alice.bring_to_front();alice.get_by_role('button',name='Join voice',exact=True).click();wait(alice,'window.__voiceTest.voice.active && Boolean(window.__voiceTest.voice.stream)')
            bob.bring_to_front();bob.get_by_role('button',name='Listen only',exact=True).click()
            wait(bob,'window.__voiceTest.voice.peers.size===1 && [...window.__voiceTest.voice.peers.values()][0].pc.connectionState==="connected"')
            wait(alice,'window.__voiceTest.voice.peers.size===1 && [...window.__voiceTest.voice.peers.values()][0].pc.connectionState==="connected"')
            wait(bob,'[...window.__voiceTest.voice.peers.values()].some(p=>Boolean(p.gain))')
            bob.bring_to_front();bob.wait_for_timeout(2000)
            received=bob.evaluate('''async()=>{const p=[...window.__voiceTest.voice.peers.values()][0],stats=await p.pc.getStats();return [...stats.values()].filter(s=>s.type==='inbound-rtp'&&s.kind==='audio').map(s=>({packets:s.packetsReceived,samples:s.totalSamplesReceived,bytes:s.bytesReceived}));}''')
            def rms(page):
                return page.evaluate("""async()=>{const v=window.__voiceTest.voice,p=[...v.peers.values()][0],a=v.context.createAnalyser();p.gain.connect(a);let maximum=0;for(let i=0;i<4;i++){await new Promise(r=>setTimeout(r,70));const data=new Float32Array(a.fftSize);a.getFloatTimeDomainData(data);maximum=Math.max(maximum,Math.sqrt(data.reduce((s,n)=>s+n*n,0)/data.length));}p.gain.disconnect(a);return maximum;}""")
            bob_rms=rms(bob)
            assert any(s['packets']>5 for s in received) and bob_rms>.0001,(received,bob_rms)
            assert not bob.evaluate('Boolean(window.__voiceTest.voice.stream)')
            bob.get_by_role('button',name='Enable my microphone',exact=True).click();wait(bob,'Boolean(window.__voiceTest.voice.stream) && !window.__voiceTest.voice.busy')
            wait(alice,'[...window.__voiceTest.voice.peers.values()].some(p=>Boolean(p.gain))');alice.wait_for_timeout(700)
            back=alice.evaluate('''async()=>{const stats=await [...window.__voiceTest.voice.peers.values()][0].pc.getStats();return [...stats.values()].filter(s=>s.type==='inbound-rtp'&&s.kind==='audio').map(s=>({packets:s.packetsReceived,samples:s.totalSamplesReceived}));}''')
            alice_rms=rms(alice);assert any(s['packets']>5 for s in back) and alice_rms>.0001,(back,alice_rms)
            bob.get_by_label('Volume for Alice',exact=True).evaluate('e=>{e.value="25";e.dispatchEvent(new Event("input",{bubbles:true}))}')
            assert abs(bob.evaluate('[...window.__voiceTest.voice.peers.values()][0].gain.gain.value')-.25)<1e-6
            bob.get_by_role('button',name='Mute Alice for me',exact=True).click();assert bob.evaluate('[...window.__voiceTest.voice.peers.values()][0].gain.gain.value')==0;assert rms(bob)<.000001
            assert alice.evaluate('window.__voiceTest.voice.stream.getAudioTracks()[0].enabled')
            bob.get_by_role('button',name='Unmute Alice for me',exact=True).click()
            bob.get_by_label('All voice volume',exact=True).evaluate('e=>{e.value="50";e.dispatchEvent(new Event("input",{bubbles:true}))}')
            assert abs(bob.evaluate('[...window.__voiceTest.voice.peers.values()][0].gain.gain.value')-.125)<1e-6
            bob.get_by_role('button',name='Mute all incoming voice',exact=True).click();assert bob.evaluate('[...window.__voiceTest.voice.peers.values()][0].gain.gain.value')==0
            bob.get_by_role('button',name='Unmute all incoming voice',exact=True).click()
            alice.get_by_role('button',name='Mute my microphone',exact=True).click();assert not alice.evaluate('window.__voiceTest.voice.stream.getAudioTracks()[0].enabled')
            alice.get_by_role('button',name='Unmute my microphone',exact=True).click();assert alice.evaluate('window.__voiceTest.voice.stream.getAudioTracks()[0].enabled')
            outsider.get_by_role('button',name='Listen only',exact=True).click();wait(outsider,'window.__voiceTest.voice.active');assert outsider.evaluate('window.__voiceTest.voice.peers.size')==0
            assert alice.evaluate('window.__voiceTest.voice.peers.size')==1,'secondary multibox sockets must not duplicate voice'
            assert 'VOICE-42' not in alice.locator('#tag-voice').inner_text()
            box=alice.locator('#tag-voice').bounding_box();team=alice.locator('#own-connections').bounding_box();assert box['y']>=team['y']+team['height']
            alice.screenshot(path=str(OUT/'tag-voice-desktop.png'))
            denied=create('NoMic','VOICE-42');denied.evaluate('window.__denyMic=true');denied.get_by_role('button',name='Join voice',exact=True).click();wait(denied,'window.__voiceTest.voice.active')
            assert not denied.evaluate('Boolean(window.__voiceTest.voice.stream)');assert 'blocked' in denied.locator('.voice-status').inner_text().lower()
            wait(alice,'window.__voiceTest.voice.peers.size===2');denied.get_by_role('button',name='Leave tag voice',exact=True).click();wait(alice,'window.__voiceTest.voice.peers.size===1')
            mobile=create('Mobile','VOICE-42',True);mobile.get_by_role('button',name='Listen only',exact=True).click();wait(mobile,'window.__voiceTest.voice.active && window.__voiceTest.voice.peers.size===2')
            wait(mobile,'[...window.__voiceTest.voice.peers.values()].some(p=>p.pc.connectionState==="connected")');mobile.screenshot(path=str(OUT/'tag-voice-mobile.png'))
            mobile.get_by_role('button',name='Leave tag voice',exact=True).click();wait(alice,'window.__voiceTest.voice.peers.size===1')
            bob.evaluate('window.__lastVoiceTrack=window.__voiceTest.voice.stream.getAudioTracks()[0]');bob.get_by_role('button',name='Leave tag voice',exact=True).click()
            wait(bob,'window.__lastVoiceTrack.readyState==="ended" && !window.__voiceTest.voice.active');wait(alice,'window.__voiceTest.voice.peers.size===0')
            alice.evaluate('window.__lastVoiceTrack=window.__voiceTest.voice.stream.getAudioTracks()[0];window.__voiceTest.remote.sockets[0].close(1000)')
            wait(alice,'window.__lastVoiceTrack.readyState==="ended" && !window.__voiceTest.voice.active && !window.__voiceTest.voice.context')
            assert not errors,errors
            report={'realAudio':{'aliceToBob':received,'bobToAlice':back,'aliceDecodedRms':alice_rms,'bobDecodedRms':bob_rms},'localMuteAndGain':True,'selfMuteTrack':True,'masterAndDeafen':True,'tagIsolation':True,'multiboxDeduplication':True,'permissionDeniedListenOnly':True,'mobileLayout':True,'leaveStopsMicrophone':True,'disconnectStopsMicrophone':True,'noPageErrors':True,'networkScope':'local host ICE, synthetic audio only; public TURN deployment not exercised'}
            for context in contexts:context.close()
            browser.close()
    (OUT/'voice-browser-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report))
finally:
    server.terminate();server.wait(timeout=10)
