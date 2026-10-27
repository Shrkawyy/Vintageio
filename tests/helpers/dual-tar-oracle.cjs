'use strict';
// Executes only audited arithmetic/entity methods; never starts the archive server.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../vendor/dual-tar/src');
function method(file,name){
 const source=fs.readFileSync(path.join(root,file),'utf8'),marker=name+' = function',at=source.indexOf(marker);
 if(at<0)throw Error('Missing source method '+name);
 const start=source.indexOf('function',at),body=source.indexOf('{',start);let depth=0,state='code';
 for(let i=body;i<source.length;i++){
  const ch=source[i],next=source[i+1];
  if(state==='line'){if(ch==='\n')state='code';continue;}
  if(state==='block'){if(ch==='*'&&next==='/'){state='code';i++;}continue;}
  if(state==='single'||state==='double'){if(ch==='\\'){i++;continue;}if(ch===(state==='single'?"'":'"'))state='code';continue;}
  if(ch==='/'&&next==='/'){state='line';i++;continue;}if(ch==='/'&&next==='*'){state='block';i++;continue;}
  if(ch==="'"){state='single';continue;}if(ch==='"'){state='double';continue;}
  if(ch==='{')depth++;if(ch==='}'&&--depth===0)return source.slice(start,i+1);
 }
 throw Error('Unclosed method '+name);
}
function oracle(random=.5){
 const math=Object.create(Math);math.random=()=>random;
 function load(file,dependencies={}){const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{module,exports:module.exports,Math:math,require(name){if(Object.hasOwn(dependencies,name))return dependencies[name];throw Error('Disallowed oracle dependency '+name);}},{filename:file,timeout:1000});return module.exports;}
 const Vec2=load('modules/Vec2.js'),Cell=load('entity/Cell.js',{'../modules/Vec2':Vec2});
 const PlayerCell=load('entity/PlayerCell.js',{'./Cell':Cell,'../packet':{}}),Virus=load('entity/Virus.js',{'./Cell':Cell});
 const config={playerSpeed:1,playerRecombineTime:30,playerMinSize:85,playerMinSplitSize:121,playerMinEjectSize:59.16079783,
  playerMaxCells:16,splitVelocity:920,playerDecayRate:.002,playerDecayCap:0,playerNoDecayAtMass:316.227766,playerBotGrow:0,
  ejectCooldown:0,ejectSize:45,ejectSizeLoss:50,ejectVelocity:780,ejectVirus:0,mobilePhysics:0,virusMaxAmount:50,virusMaxCells:0,virusMaxPoppedSize:60,virusEqualPopSize:0};
 const server={config,tickCounter:0,lastNodeId:1,nodesVirus:[],movingNodes:[],food:[],gameMode:{decayMod:1,haveTeams:false},
  border:{minx:0,miny:0,maxx:24000,maxy:24000},addNode(cell){if(cell.owner)cell.owner.cells.push(cell);else this.food.push(cell);},
  updateNodeQuad(){},removeNode(cell){cell.isRemoved=true;if(cell.owner)cell.owner.cells=cell.owner.cells.filter(c=>c!==cell);this.food=this.food.filter(c=>c!==cell);this.nodesVirus=this.nodesVirus.filter(c=>c!==cell);}};
 const Entity={PlayerCell,EjectedMass:Cell,Virus};
 for(const name of ['movePlayer','boostCell','splitPlayerCell','checkCellCollision','checkRigidCollision','resolveRigidCollision','resolveCollision','ejectMass','canEjectMass','updateSizeDecay','splitCells','autoSplit']){
  server[name]=vm.runInNewContext('('+method('GameServer.js','GameServer.prototype.'+name)+')',{Math:math,Entity,Vec2},{timeout:1000});
 }
 Virus.prototype.onEat=vm.runInNewContext('('+method('gamemodes/FFA.js','Entity.Virus.prototype.onEat')+')',{Math:math},{timeout:1000});
 const player=mass=>{const owner={cells:[],socket:{isConnected:true},mouse:new Vec2(16000,8000),lastEject:null},cell=new PlayerCell(server,owner,new Vec2(8000,8000),Math.sqrt(mass*100));owner.cells.push(cell);return owner;};
 return {server,player,Vec2,Cell,PlayerCell,Virus};
}
module.exports={oracle};
