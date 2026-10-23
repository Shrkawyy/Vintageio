// Put YOUR Vintage JSON WebSocket endpoint here, never a Senpa/ONYX endpoint.
// One backend serves the three isolated game modes. Add separate NA endpoints when deployed.
window.VINTAGE_CONFIG = {
  wsUrl: ['localhost','127.0.0.1'].includes(location.hostname) && location.port==='3001' ? 'ws://'+location.host : '',
  authBaseUrl: '', // e.g. https://api.your-domain.com; empty = same origin
  // Optional voiceIceServers override. Otherwise the backend supplies its configured STUN/TURN list.
  // Microphone capture requires HTTPS in production; localhost works during development.
  // Set multi:false on a server entry for a single connection with natural cell colors.
  regions: {
    EU: [
      {id:'eu-ffa',name:'FFA',mode:'ffa',wsUrl:''},
      {id:'eu-dual',name:'DUAL',mode:'dual',wsUrl:''},
      {id:'eu-mega',name:'MEGA',mode:'mega',wsUrl:''}
    ],
    NA: [], // Add your deployed NA servers here using the same shape.
    ASIA: []
  }
};
