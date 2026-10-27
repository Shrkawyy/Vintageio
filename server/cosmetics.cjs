'use strict';
const fs=require('node:fs'),path=require('node:path');
const {normalizeTitlePosition}=require('./titles.cjs');
const flagIds=new Set(fs.readdirSync(path.join(__dirname,'../public/assets/flags')).filter(file=>file.endsWith('.svg')).map(file=>file.slice(0,-4)));
flagIds.delete('1f1ee-1f1f1');
// Cosmetic preview is intentionally available to guests while login/levels are
// being built. Each socket owns one connection's appearance, never another's.
function cleanSkinUrl(value){
 if(typeof value!=='string'||value.length>1200)return '';
 if(/^\/assets\/skins\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp|gif)$/i.test(value))return value;
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
function setCosmetics(player,value={}){
 if(!player)return;
 player.skinUrl=cleanSkinUrl(value.skinUrl);
 player.shieldId=/^shield(?:[1-46-9]|1[0-3])$/.test(value.shieldId||'')?value.shieldId:'';
 player.flagId=flagIds.has(value.flagId)?value.flagId:'';
 player.titlePosition=normalizeTitlePosition(value.titlePosition);
}
module.exports={cleanSkinUrl,setCosmetics};
