# Tag voice

The voice panel appears directly below your connection/team rows when you play
with a tag. Join voice asks for microphone access; Listen only needs no microphone.
Enable mic can be used later. Each listener can mute any teammate locally, set
their individual volume, change the master listening volume or mute all incoming
voice. Microphone mute does not mute other players. An indicator marks speaking
teammates. Voice remains controllable while the lobby is open; leaving voice,
switching game sessions/tags or losing the game socket stops microphone tracks.

Only enrolled human players in the **same tag and same game server** exchange
signaling. A multibox player has one voice identity, independently of their two
game connections. The private tag and multibox key are absent from voice packets.
Spectators, untagged players and bots cannot join. Rooms allow up to 12 voice
participants. Audio is WebRTC audio; it is not recorded or relayed by the game
WebSocket server. The server handles membership and signaling only.

## Run locally

Run `RUN-VINTAGE.cmd`, open `http://localhost:3001/`, join a live room with the
same tag in two browsers, then click Join voice or Listen only. Refresh with
Ctrl+F5 after updating. Update both `public/` and `server/`, then restart Node.
The offline local demo has no voice transport; its panel explains that a live
server is required.

## Internet hosting

Host the client on HTTPS and connect it to the backend over WSS. Browsers require
a secure origin and explicit microphone permission; localhost is a development
exception. See [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

The default ICE configuration uses Google's public STUN server for discovering
direct routes. For users behind restrictive NATs/firewalls, configure a TURN
relay on your hosting/provider. No TURN service is bundled or deployed by this
source update. See [WebRTC's TURN guide](https://webrtc.org/getting-started/turn-server).

Set this environment variable on the Node host, using credentials from your
own TURN provider/server, and restart Node:

```text
VOICE_ICE_SERVERS_JSON=[{"urls":"stun:stun.l.google.com:19302"},{"urls":["turn:turn.example.com:3478?transport=udp","turns:turn.example.com:443?transport=tcp"],"username":"YOUR_TURN_USERNAME","credential":"YOUR_TURN_CREDENTIAL"}]
```

The backend validates this list and sends it only to eligible players joining
voice. Do not put the TURN server's administration secret in this value. Use
client access credentials issued by your TURN provider. If a provider requires
short-lived credentials, refresh this configuration through that provider's
credential flow. An optional `VINTAGE_CONFIG.voiceIceServers` array overrides
the backend list; normally leave it unset. Setting the list to `[]` is useful
for deterministic same-host tests and does not support arbitrary Internet NATs.

## Verification

`node --test tests/*.test.cjs` includes membership/room isolation, signaling
validation, limits, multibox deduplication and a real WebSocket protocol test.

`python scripts/check-voice-browser.py` uses real Chrome WebRTC connections and
a generated synthetic microphone waveform. It checks decoded audio RMS in both
directions, per-peer/master GainNode values, zero output after local mute,
microphone track muting, listen-only mode, microphone denial, mobile layout,
private-tag isolation and stopped capture after leaving/disconnecting. It uses
host ICE with no external servers; a public TURN deployment is not tested.

The muted media-element puller in `tag-voice.js` addresses Chromium's documented
[remote-stream Web Audio issue](https://issues.chromium.org/issues/40094084).
Only the Web Audio gain path is audible, so local volume/mute cannot produce a
second unmuted playback path. Signaling uses the
[perfect-negotiation pattern](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation).
