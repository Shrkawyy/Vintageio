// Put YOUR Vintage JSON WebSocket endpoint here, never a Senpa/ONYX endpoint.
// One backend serves the three isolated game modes. Add separate NA endpoints when deployed.
window.VINTAGE_CONFIG = {
  wsUrl: '',
  authBaseUrl: '', // e.g. https://api.your-domain.com; empty = same origin
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
