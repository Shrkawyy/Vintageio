// Keep browser ES module and Node CommonJS simulation byte-for-byte equivalent.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const kernelSource=fs.readFileSync(path.join(root,'public/dual-tar-kernel.js'),'utf8');
const kernelNames=[...kernelSource.matchAll(/^export\s+(?:const|function)\s+(\w+)/gm)].map(m=>m[1]);
fs.writeFileSync(path.join(root,'server/dual-tar-kernel.cjs'),"'use strict';\n"+kernelSource.replace(/^export\s+/gm,'')+'\nmodule.exports={'+kernelNames.join(',')+'};\n');
const source=fs.readFileSync(path.join(root,'public/physics.js'),'utf8');
const names=[...source.matchAll(/^export\s+(?:const|function)\s+(\w+)/gm)].map(m=>m[1]);
const body=source.replace(/^import\s+\{dualTarKernel\}\s+from\s+'[^']+';/m,"const {dualTarKernel}=require('./dual-tar-kernel.cjs');").replace(/^export\s+/gm,'');
fs.writeFileSync(path.join(root,'server/physics.cjs'),"'use strict';\n"+body+'\nmodule.exports={'+names.join(',')+'};\n');
console.log('Synchronized physics:',names.join(', '));

const virusSource=fs.readFileSync(path.join(root,'public/virus-rules.js'),'utf8');
const virusNames=[...virusSource.matchAll(/^export\s+(?:const|function)\s+(\w+)/gm)].map(m=>m[1]);
const virusBody=virusSource.replace(/^import\s+\{([^}]+)\}\s+from\s+'\.\/physics\.js[^']*';/gm,(_,names)=>
  'const {'+names.replace(/\s+as\s+/g,':')+"}=require('./physics.cjs');").replace(/^export\s+/gm,'');
fs.writeFileSync(path.join(root,'server/virus.cjs'),"'use strict';\n"+virusBody+'\nmodule.exports={'+virusNames.join(',')+'};\n');

// Small catalogs used by both the browser and authoritative services.
const titleSource=fs.readFileSync(path.join(root,'public/titles.js'),'utf8');
const titleNames=[...titleSource.matchAll(/^export\s+(?:const|function)\s+(\w+)/gm)].map(m=>m[1]);
fs.writeFileSync(path.join(root,'server/titles.cjs'),"'use strict';\n"+titleSource.replace(/^export\s+/gm,'')+'\nmodule.exports={'+titleNames.join(',')+'};\n');
const identitySource=fs.readFileSync(path.join(root,'public/identity.js'),'utf8');
const identityNames=[...identitySource.matchAll(/^export\s+(?:const|function)\s+(\w+)/gm)].map(m=>m[1]);
fs.writeFileSync(path.join(root,'server/identity.cjs'),"'use strict';\n"+identitySource.replace(/^export\s+/gm,'')+'\nmodule.exports={'+identityNames.join(',')+'};\n');
