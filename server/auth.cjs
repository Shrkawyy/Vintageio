'use strict';
const {randomBytes,createHmac,timingSafeEqual}=require('node:crypto');
// OAuth credentials and provider access tokens never leave the backend.
function createAuth(env=process.env,fetcher=fetch){
 const origin=env.PUBLIC_ORIGIN||'', frontend=env.FRONTEND_ORIGIN||origin, secret=env.SESSION_SECRET||'';
 const secure=origin.startsWith('https://'), version=env.FACEBOOK_GRAPH_VERSION;
 const configs={
  discord:{id:env.DISCORD_CLIENT_ID,secret:env.DISCORD_CLIENT_SECRET,authorize:'https://discord.com/oauth2/authorize',token:'https://discord.com/api/oauth2/token',profile:'https://discord.com/api/users/@me',scope:'identify'},
  facebook:{id:env.FACEBOOK_APP_ID,secret:env.FACEBOOK_APP_SECRET,authorize:`https://www.facebook.com/${version}/dialog/oauth`,token:`https://graph.facebook.com/${version}/oauth/access_token`,profile:`https://graph.facebook.com/${version}/me?fields=id,name`,scope:'public_profile'}
 };
 const ready=p=>!!(configs[p]?.id&&configs[p]?.secret&&origin&&frontend&&secret.length>=32&&(p!=='facebook'||/^v\d+\.\d+$/.test(version||'')));
 const pending=new Map();
 const sign=s=>createHmac('sha256',secret).update(s).digest('base64url');
 const cookie=(name,value,age)=>`${name}=${value}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
 const cookies=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim().split('=')));
 function user(req){try{const token=cookies(req).vintage_session||'', [payload,sig]=token.split('.');if(!payload||!sig||secret.length<32)return null;const expected=sign(payload);if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;const data=JSON.parse(Buffer.from(payload,'base64url'));return data.exp>Date.now()?data.user:null;}catch{return null;}}
 async function handler(req,res){
  const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith('/auth/'))return false;
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  if(req.headers.origin===frontend){res.setHeader('Access-Control-Allow-Origin',frontend);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');}
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return true;};
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.writeHead(204);res.end();return true;}
  if(u.pathname==='/auth/me')return json(200,{user:user(req)});
  if(u.pathname==='/auth/providers')return json(200,{discord:ready('discord'),facebook:ready('facebook')});
  if(u.pathname==='/auth/logout'){
   if(req.method!=='POST'||req.headers.origin!==frontend)return json(403,{error:'Invalid logout request'});
   res.setHeader('Set-Cookie',cookie('vintage_session','',0));return json(200,{ok:true});
  }
  const match=u.pathname.match(/^\/auth\/(discord|facebook)(\/callback)?$/);if(!match)return json(404,{error:'Not found'});
  if(req.method!=='GET')return json(405,{error:'Method not allowed'});
  const provider=match[1],c=configs[provider];if(!ready(provider))return json(503,{error:'Provider is not configured on this server'});
  const redirect=origin+'/auth/'+provider+'/callback';
  if(!match[2]){
   for(const [k,v] of pending)if(v.exp<Date.now())pending.delete(k);
   if(pending.size>=2000)return json(429,{error:'Please try again later'});
   const state=randomBytes(32).toString('hex');pending.set(state,{provider,exp:Date.now()+600000});
   res.setHeader('Set-Cookie',cookie('vintage_oauth',state,600));
   const url=new URL(c.authorize);url.search=new URLSearchParams({client_id:c.id,redirect_uri:redirect,response_type:'code',scope:c.scope,state}).toString();
   res.writeHead(302,{Location:url.href});res.end();return true;
  }
  const state=u.searchParams.get('state'),entry=pending.get(state);
  if(!entry||entry.provider!==provider||entry.exp<Date.now()||cookies(req).vintage_oauth!==state)return json(400,{error:'Invalid or expired OAuth state'});
  pending.delete(state);res.setHeader('Set-Cookie',cookie('vintage_oauth','',0));
  if(u.searchParams.has('error')||!u.searchParams.get('code'))return json(400,{error:'Login was cancelled'});
  try{
   const body=new URLSearchParams({client_id:c.id,client_secret:c.secret,grant_type:'authorization_code',code:u.searchParams.get('code'),redirect_uri:redirect});
   const tokenReply=await fetcher(c.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(10000)});
   if(!tokenReply.ok)throw Error('token');const token=await tokenReply.json();if(!token.access_token)throw Error('token');
   const result=await fetcher(c.profile,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(10000)});
   if(!result.ok)throw Error('profile');const profile=await result.json();if(!profile.id)throw Error('profile');
   const account={id:provider+':'+profile.id,provider,name:String(profile.global_name||profile.name||profile.username||'Player').slice(0,60)};
   const payload=Buffer.from(JSON.stringify({user:account,exp:Date.now()+7*86400000})).toString('base64url');
   res.setHeader('Set-Cookie',[cookie('vintage_oauth','',0),cookie('vintage_session',payload+'.'+sign(payload),7*86400)]);
   const nonce=randomBytes(16).toString('base64');res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'`);
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
   res.end(`<p>Signed in to Vintage. You can close this window.</p><script nonce="${nonce}">if(window.opener){window.opener.postMessage({type:'vintage-auth'},${JSON.stringify(frontend).replace(/</g,'\\u003c')});window.close();}</script>`);return true;
  }catch{return json(502,{error:'Login could not be completed. Try again.'});}
 }
 return handler;
}
module.exports={createAuth};
