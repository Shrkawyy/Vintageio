'use strict';
const fs=require('node:fs'),path=require('node:path'),cache=new Map();
function url(file){
 if(cache.has(file))return cache.get(file);
 const source=fs.readFileSync(path.join(__dirname,'../../public',file),'utf8')
  .replace(/\bfrom\s+['"]\.\/([^'"]+)['"]/g,(_,relative)=>'from '+JSON.stringify(url(relative.split('?')[0])));
 const value='data:text/javascript;charset=utf-8,'+encodeURIComponent(source);cache.set(file,value);return value;
}
module.exports={game:()=>import(url('game.js')),url};
