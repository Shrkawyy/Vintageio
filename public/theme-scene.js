/** The settings stage uses the game's renderer, with editable, persistent scene objects. */
export function mountThemeScene(host,{Renderer,getSettings,canEdit,onArtworkChange,normalize,maxElements=240}){
  host.replaceChildren();host.removeAttribute('aria-hidden');host.classList.add('scene-preview');
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-label','Live theme scene');canvas.tabIndex=-1;host.append(canvas);
  const radar=document.createElement('canvas');radar.width=radar.height=240;
  const renderer=new Renderer(canvas,radar,{viewport:()=>({width:host.clientWidth,height:host.clientHeight,ratio:Math.min(devicePixelRatio||1,2)})});
  const tools=document.createElement('div');tools.className='theme-scene-tools';tools.hidden=true;host.after(tools);
  const title=document.createElement('div');title.className='scene-tool-title';title.textContent='SCENE OBJECTS';tools.append(title);
  const controls=document.createElement('div');controls.className='scene-object-actions';tools.append(controls);
  const field=(type,label,value,parent=controls)=>{const e=document.createElement(type);e.setAttribute('aria-label',label);if(value!==undefined)e.value=value;parent.append(e);return e;};
  const kind=field('select','Scene object');
  for(const [value,label] of [['star','Star'],['ellipse','Ring'],['rect','Rectangle'],['diamond','Diamond'],['hexagon','Hexagon'],['cross','Cross'],['triangle','Triangle'],['symbol','Symbol / text']]){const e=document.createElement('option');e.value=value;e.textContent=label;kind.append(e);}
  const button=(label,callback,parent=controls)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=callback;parent.append(b);return b;};
  const symbol=field('input','Scene symbol','✦');symbol.maxLength=80;symbol.className='scene-symbol';
  let selected=-1,drag=null,lastAt=0,editing=false;const undo=[],redo=[];
  const empty=()=>({version:1,baseColor:'#000000',transparent:true,elements:[]});
  const art=()=>getSettings().themeArtwork||empty(),clone=v=>JSON.parse(JSON.stringify(v));
  const checkpoint=()=>{undo.push(clone(art()));if(undo.length>30)undo.shift();redo.length=0;};
  const commit=value=>{const doc=normalize({...value,transparent:true});onArtworkChange(doc);};
  const add=(type,text)=>{
    if(!canEdit()||art().elements.length>=maxElements)return;
    checkpoint();const doc=clone(art()),offset=(doc.elements.length%5)*20;
    doc.elements.push(type==='symbol'?{type:'text',text:text||symbol.value||'✦',x:265+offset,y:245+offset,size:130,color:ink.value,opacity:1,rotation:0}:{type:'shape',shape:type,x:180+offset,y:160+offset,w:170,h:170,width:12,fill:type!=='ellipse',color:ink.value,opacity:1,rotation:0});
    selected=doc.elements.length-1;commit(doc);sync();
  };
  button('Add object',()=>add(kind.value));
  const palette=document.createElement('div');palette.className='scene-symbol-palette';tools.append(palette);
  for(const mark of ['✦','★','♛','☾','⚡','∞','♥','◆','🚀','🪐','💎','🎮']){const b=button(mark,()=>add('symbol',mark),palette);b.setAttribute('aria-label','Add symbol '+mark);}
  const properties=document.createElement('div');properties.className='scene-object-properties';tools.append(properties);
  const ink=field('input','Scene object color','#e5ad6b',properties);ink.type='color';
  const size=field('input','Scene object size','170',properties);size.type='range';size.min='24';size.max='400';size.step='1';
  const angle=field('input','Scene object rotation','0',properties);angle.type='range';angle.min='-180';angle.max='180';
  const remove=button('Delete',()=>{if(selected<0)return;checkpoint();const doc=clone(art());doc.elements.splice(selected,1);selected=-1;commit(doc);sync();},properties);
  const undoButton=button('Undo',()=>restore(undo,redo),properties),redoButton=button('Redo',()=>restore(redo,undo),properties);
  const hint=document.createElement('p');hint.className='scene-edit-hint';hint.textContent='Add an object, then drag it on the scene. Color, size and rotation edit the selected object. Save your theme to keep it.';tools.append(hint);
  const restore=(from,to)=>{if(!from.length)return;to.push(clone(art()));commit(from.pop());selected=-1;sync();};
  function sync(){
    const item=art().elements[selected];remove.disabled=!item;size.disabled=angle.disabled=!item;
    undoButton.disabled=!undo.length;redoButton.disabled=!redo.length;
    if(item){ink.value=item.color;size.value=item.type==='shape'?Math.max(Math.abs(item.w),Math.abs(item.h)):item.size||100;angle.value=item.rotation||0;}
  }
  ink.oninput=()=>{if(selected<0)return;checkpoint();const doc=clone(art());doc.elements[selected].color=ink.value;commit(doc);};
  size.oninput=()=>{if(selected<0)return;checkpoint();const doc=clone(art()),item=doc.elements[selected],value=+size.value;if(item.type==='shape'){const factor=value/Math.max(1,Math.abs(item.w),Math.abs(item.h));item.w*=factor;item.h*=factor;}else item.size=value;commit(doc);};
  angle.oninput=()=>{if(selected<0)return;checkpoint();const doc=clone(art());doc.elements[selected].rotation=+angle.value;commit(doc);};
  const bounds=item=>{
    if(item.type==='stroke'){const xs=item.points.map(p=>p[0]),ys=item.points.map(p=>p[1]);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
    const shape=item.type==='shape',w=shape?item.w:Math.min(1000,item.size*Array.from(item.text).length*.7),h=shape?item.h:item.size;
    const left=shape?Math.min(0,w):-w/2,top=shape?Math.min(0,h):-h/2,a=(item.rotation||0)*Math.PI/180;
    const points=[[left,top],[left+Math.abs(w),top],[left,top+Math.abs(h)],[left+Math.abs(w),top+Math.abs(h)]].map(([x,y])=>[item.x+x*Math.cos(a)-y*Math.sin(a),item.y+x*Math.sin(a)+y*Math.cos(a)]);
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  };
  const point=event=>{const b=canvas.getBoundingClientRect(),p=renderer.toWorld(event.clientX-b.left,event.clientY-b.top);return{x:Math.max(0,Math.min(1024,p.x/1200*1024)),y:Math.max(0,Math.min(1024,p.y/1200*1024))};};
  canvas.addEventListener('pointerdown',event=>{
    if(!canEdit()||event.button!==0)return;event.preventDefault();canvas.focus();canvas.setPointerCapture(event.pointerId);const p=point(event);
    selected=art().elements.findLastIndex(item=>{const b=bounds(item);return p.x>=b.x-16&&p.x<=b.x+b.w+16&&p.y>=b.y-16&&p.y<=b.y+b.h+16;});
    if(selected>=0)drag={start:p,doc:clone(art()),changed:false};sync();
  });
  canvas.addEventListener('pointermove',event=>{
    if(!drag)return;const p=point(event),dx=p.x-drag.start.x,dy=p.y-drag.start.y;if(!drag.changed&&Math.hypot(dx,dy)<1)return;
    if(!drag.changed){checkpoint();drag.changed=true;}
    const doc=clone(drag.doc),item=doc.elements[selected];
    if(item.type==='stroke')item.points=item.points.map(([x,y])=>[x+dx,y+dy]);else{item.x+=dx;item.y+=dy;}
    commit(doc);
  });
  const end=event=>{drag=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  canvas.addEventListener('keydown',event=>{if(!canEdit())return;if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();remove.click();}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();restore(event.shiftKey?redo:undo,event.shiftKey?undo:redo);}});
  function draw(now){
    if(!host.clientWidth||!host.clientHeight)return;
    const editable=canEdit();if(editing!==editable){editing=editable;tools.hidden=!editable;canvas.tabIndex=editable?0:-1;host.classList.toggle('scene-editable',editable);if(!editable){selected=-1;undo.length=redo.length=0;}sync();}
    const s=getSettings(),t=now/1000,dt=lastAt?Math.min(.05,(now-lastAt)/1000):1/30;lastAt=now;
    const w=host.clientWidth,h=host.clientHeight,zoom=Math.min(w,h)*.84/1200;
    renderer.cam={x:600,y:600};renderer.zoom=zoom;
    const x=470+Math.sin(t*.7)*72,y=570+Math.cos(t*.6)*60;
    const snapshot={mode:'ffa',worldSize:1200,players:[{id:'demo-main',name:'Vintage',color:'#e4a45b',cells:[{id:'main',x,y,mass:3600}]},{id:'demo-other',name:'Orbit',color:'#ffffff',cells:[{id:'other',x:800+Math.cos(t*.8)*55,y:750+Math.sin(t*.9)*55,mass:1900}]}],food:Array.from({length:12},(_,i)=>({x:170+i*68,y:250+Math.sin(i*2+t*.6)*35,mass:14,color:s.rainbowFood?['#e7ac69','#74cfe4','#ce8ecb'][i%3]:s.foodColor})).concat(Array.from({length:5},(_,i)=>({feedId:'preview-feed-'+i,ejected:true,x:x+180+((t*110+i*28)%140),y:y-40,mass:25,radius:9.5,color:s.foodColor}))),viruses:[{x:910,y:450,mass:100,feedMass:(t*28)%175}]};
    renderer.draw(snapshot,'demo-main',{...s,zoom,showMinimap:false},false,dt,true,['demo-main','demo-other']);
    const g=renderer.ctx;
    if(editable&&selected>=0&&art().elements[selected]){
      const b=bounds(art().elements[selected]),factor=1200/1024,z=renderer.zoom;
      g.save();g.translate(w/2-600*z,h/2-600*z);g.scale(z*factor,z*factor);g.strokeStyle='#fff4de';g.lineWidth=1.5/(z*factor);g.setLineDash([6/(z*factor),4/(z*factor)]);g.strokeRect(b.x-8,b.y-8,b.w+16,b.h+16);g.restore();
    }
    // Interface colors sit beside the world sample, using the same chosen palette.
    g.save();g.globalAlpha=.95;g.fillStyle=s.panelColor;g.fillRect(10,10,112,29);g.fillStyle=s.accentColor;g.fillRect(10,10,3,29);g.fillStyle=s.textColor;g.font='600 10px Arial';g.textAlign='left';g.fillText('VINTAGE  /  FFA',22,28);g.restore();
  }
  return {draw,reset(){selected=-1;undo.length=redo.length=0;sync();},renderer,canvas};
}
