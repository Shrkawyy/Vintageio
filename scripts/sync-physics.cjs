// Keep browser ES module and Node CommonJS simulation byte-for-byte equivalent.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'public/physics.js'),'utf8');
const names=[...source.matchAll(/^export\s+(?:const|function)\s+(\w+)/gm)].map(m=>m[1]);
const body=source.replace(/^export\s+/gm,'');
fs.writeFileSync(path.join(root,'server/physics.cjs'),"'use strict';\n"+body+'\nmodule.exports={'+names.join(',')+'};\n');
console.log('Synchronized physics:',names.join(', '));
