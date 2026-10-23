/** Local canvas editor. The saved document contains only validated drawing primitives. */
export function mountBackgroundStudio(host,{design,draw,normalize,onSave,onClose,maxElements=240,maxPoints=12000}){
  const clone=value=>JSON.parse(JSON.stringify(value));
  let draft=clone(design||{version:1,baseColor:'#061420',elements:[]}),tool='draw',selected=-1,drag=null,dirty=false,closed=false;
  let ink='#73e5df',width=8,opacity=1,fill=true,stamp='✦',stampSize=100,rotation=0;
  const undo=[],redo=[];
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const root=el('section','background-studio-modal');root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Background Studio');
  const header=el('header','studio-header'),identity=el('div');identity.append(el('span','studio-eyebrow','VINTAGE / CREATIVE SPACE'),el('h2','','Background Studio'));
  const actions=el('div','studio-actions');
  const button=(label,action,parent=actions,className='')=>{const b=el('button',className,label);b.type='button';b.onclick=action;parent.appendChild(b);return b;};
  const close=()=>{if(closed)return;closed=true;root.remove();onClose?.();};
  button('Back',close);
  const download=()=>{const surface=document.createElement('canvas');surface.width=1024;surface.height=1024;draw(surface.getContext('2d'),draft,1024);surface.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='vintage-background.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');};
  button('Download PNG',download);
  const save=use=>{if(onSave(normalize(draft),use)!==false)close();else status.textContent='Could not save. Download your drawing or free browser storage, then try again.';};
  button('Save design',()=>save(false));button('Save & use',()=>save(true),actions,'studio-primary');
  header.append(identity,actions);
  const body=el('div','studio-body'),sidebar=el('aside','studio-tools'),stage=el('div','studio-stage');
  const toolbar=el('div','studio-tool-grid');toolbar.setAttribute('aria-label','Drawing tools');
  const toolButtons=new Map();
  const chooseTool=name=>{tool=name;for(const [key,b]of toolButtons){b.classList.toggle('active',key===name);b.setAttribute('aria-pressed',String(key===name));}canvas.style.cursor=name==='select'?'move':'crosshair';};
  for(const [key,label] of [['select','↖ Select'],['draw','✎ Draw'],['eraser','◌ Eraser'],['rect','□ Rectangle'],['ellipse','○ Circle'],['triangle','△ Triangle'],['star','☆ Star'],['diamond','◇ Diamond'],['hexagon','⬡ Hexagon'],['cross','✚ Cross'],['line','╱ Line'],['arrow','↗ Arrow'],['sticker','✦ Sticker'],['text','T Text']])toolButtons.set(key,button(label,()=>chooseTool(key),toolbar));
  sidebar.append(el('h3','','TOOLS'),toolbar);
  const controls=el('div','studio-properties');sidebar.append(controls);
  const control=(label,type,value,change,attrs={})=>{
    const row=el('label','studio-control'),title=el('span','',label),input=el('input');input.type=type;input.value=value;input.setAttribute('aria-label',label);
    for(const [key,val]of Object.entries(attrs))input.setAttribute(key,val);
    row.append(title,input);controls.appendChild(row);input.addEventListener(type==='text'?'input':'change',()=>change(input));return input;
  };
  const checkpoint=()=>{undo.push(clone(draft));if(undo.length>30)undo.shift();redo.length=0;dirty=true;};
  const repaint=()=>{
    draw(ctx,draft,1024);
    const item=draft.elements[selected];
    if(item){const b=bounds(item);ctx.save();ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.strokeRect(b.x-8,b.y-8,b.w+16,b.h+16);ctx.restore();}
    undoButton.disabled=!undo.length;redoButton.disabled=!redo.length;deleteButton.disabled=selected<0;
    status.textContent=(dirty?'Unsaved draft':'Saved design')+' · '+draft.elements.length+' / '+maxElements+' elements';
  };
  const changeSelected=(key,value)=>{if(selected>=0){checkpoint();draft.elements[selected][key]=value;repaint();}};
  const color=control('Ink color','color',ink,input=>{ink=input.value;hex.value=ink.slice(1).toUpperCase();changeSelected('color',ink);});
  const hex=control('Ink hex','text',ink.slice(1).toUpperCase(),input=>{const next='#'+input.value.replace(/^#/,'');if(/^#[0-9a-f]{6}$/i.test(next)){ink=next;color.value=next;changeSelected('color',ink);input.removeAttribute('aria-invalid');}else input.setAttribute('aria-invalid','true');},{maxlength:7,spellcheck:'false'});
  const palette=el('div','studio-palette');palette.setAttribute('aria-label','Quick colors');
  for(const value of ['#ffffff','#000000','#73e5df','#70b7ff','#a78bfa','#ff73c2','#ff4040','#ff9f43','#ffe66d','#56e39f','#0c3448','#63306e']){
    const b=button('',()=>{ink=value;color.value=value;hex.value=value.slice(1).toUpperCase();changeSelected('color',value);},palette);b.style.background=value;b.setAttribute('aria-label','Ink '+value);
  }
  controls.appendChild(palette);
  const widthInput=control('Brush / outline size','range',width,input=>{width=+input.value;changeSelected('width',width);},{min:1,max:100,step:1});
  const opacityInput=control('Opacity','range',100,input=>{opacity=+input.value/100;changeSelected('opacity',opacity);},{min:5,max:100,step:1});
  const sizeInput=control('Sticker / text size','range',stampSize,input=>{stampSize=+input.value;if(['sticker','text'].includes(draft.elements[selected]?.type))changeSelected('size',stampSize);},{min:12,max:360,step:1});
  const rotationInput=control('Rotation','range',rotation,input=>{rotation=+input.value;if(draft.elements[selected]?.type!=='stroke')changeSelected('rotation',rotation);},{min:-180,max:180,step:1});
  const filled=control('Filled shapes','checkbox','',input=>{fill=input.checked;if(draft.elements[selected]?.type==='shape')changeSelected('fill',fill);});filled.checked=fill;
  const paper=control('Canvas color','color',draft.baseColor,input=>{checkpoint();draft.baseColor=input.value;repaint();});
  const text=control('Your text','text','VINTAGE',()=>{},{maxlength:80,placeholder:'Write something…'});
  sidebar.append(el('h3','','STICKERS & SYMBOLS'));
  const stickers=el('div','studio-stickers');
  for(const symbol of ['✦','★','✧','♥','☾','☀','✿','♛','♜','⚡','∞','✈','☯','✓','✕','▲','◆','●','🪐','🚀','🌙','🌍','⭐','🔥','💎','👑','🎮','🛸','👾','🦋','🌸','💀']){
    const b=button(symbol,()=>{stamp=symbol;chooseTool('sticker');for(const other of stickers.children)other.classList.toggle('active',other===b);},stickers);b.setAttribute('aria-label','Sticker '+symbol);
  }
  sidebar.append(stickers);
  const history=el('div','studio-history');
  const restore=(from,to)=>{if(!from.length)return;to.push(clone(draft));draft=from.pop();selected=-1;dirty=true;paper.value=draft.baseColor;repaint();};
  const undoButton=button('Undo',()=>restore(undo,redo),history),redoButton=button('Redo',()=>restore(redo,undo),history);
  const deleteSelection=()=>{if(selected<0)return;checkpoint();draft.elements.splice(selected,1);selected=-1;repaint();};
  const deleteButton=button('Delete selected',deleteSelection,history);
  button('Clear canvas',()=>{if(!draft.elements.length)return;checkpoint();draft.elements=[];selected=-1;repaint();},history);
  sidebar.append(history,el('p','studio-hint','Draw or drag a shape on the canvas. Choose a sticker, then click to place it. Select an element to move, recolor or rotate it. Undo restores cleared artwork.'));
  const canvas=el('canvas','studio-canvas');canvas.width=1024;canvas.height=1024;canvas.tabIndex=0;canvas.setAttribute('aria-label','Background drawing canvas');
  const ctx=canvas.getContext('2d'),wrap=el('div','studio-canvas-wrap');wrap.appendChild(canvas);
  const status=el('p','studio-status');status.setAttribute('role','status');
  stage.append(el('p','studio-stage-title','YOUR WORLD, YOUR CANVAS'),wrap,status,el('p','studio-hint','Save & use replaces the game image or URL. Turn Use my drawing off to return to your previous background.'));
  body.append(sidebar,stage);root.append(header,body);host.appendChild(root);

  function bounds(item){
    if(item.type==='stroke'){
      const xs=item.points.map(p=>p[0]),ys=item.points.map(p=>p[1]);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
    }
    const textItem=item.type!=='shape',w=textItem?Math.min(1000,item.size*Math.max(1,Array.from(item.text).length)*.65):item.w,h=textItem?item.size:item.h;
    const left=textItem?-w/2:Math.min(0,w),top=textItem?-h/2:Math.min(0,h),a=(item.rotation||0)*Math.PI/180;
    const corners=[[left,top],[left+Math.abs(w),top],[left,top+Math.abs(h)],[left+Math.abs(w),top+Math.abs(h)]].map(([x,y])=>[item.x+x*Math.cos(a)-y*Math.sin(a),item.y+x*Math.sin(a)+y*Math.cos(a)]);
    const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
  }
  const point=event=>{const b=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1024,(event.clientX-b.left)/b.width*1024)),y:Math.max(0,Math.min(1024,(event.clientY-b.top)/b.height*1024))};};
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;event.preventDefault();canvas.focus();canvas.setPointerCapture(event.pointerId);
    const p=point(event);
    if(tool==='select'){
      selected=draft.elements.findLastIndex(item=>{const b=bounds(item),pad=Math.max(12,item.width||0);return p.x>=b.x-pad&&p.x<=b.x+b.w+pad&&p.y>=b.y-pad&&p.y<=b.y+b.h+pad;});
      if(selected>=0){
        const item=draft.elements[selected];ink=item.color;width=item.width||width;opacity=item.opacity;stampSize=item.size||stampSize;rotation=item.rotation||0;fill=item.fill??fill;
        color.value=ink;hex.value=ink.slice(1).toUpperCase();widthInput.value=width;opacityInput.value=opacity*100;sizeInput.value=stampSize;rotationInput.value=rotation;filled.checked=fill;
        drag={mode:'move',start:p,original:clone(item),changed:false};
      }
      repaint();return;
    }
    if(draft.elements.length>=maxElements){status.textContent='Canvas is full. Delete an element or undo before adding more.';return;}
    const pointCount=draft.elements.reduce((sum,item)=>sum+(item.points?.length||0),0);
    if(['draw','eraser'].includes(tool)&&pointCount>=maxPoints){status.textContent='Drawing point limit reached. Start with fewer strokes or delete an old stroke.';return;}
    checkpoint();selected=-1;
    let item;
    if(['draw','eraser'].includes(tool))item={type:'stroke',points:[[p.x,p.y]],width,color:ink,opacity,erase:tool==='eraser'};
    else if(['sticker','text'].includes(tool))item={type:tool,x:p.x,y:p.y,size:stampSize,text:tool==='text'?(text.value.trim()||'VINTAGE'):stamp,color:ink,opacity,rotation};
    else item={type:'shape',shape:tool,x:p.x,y:p.y,w:1,h:1,width,color:ink,opacity,fill,rotation};
    draft.elements.push(item);
    if(!['sticker','text'].includes(tool))drag={mode:'draw',item,start:p,remaining:Math.min(1200,maxPoints-pointCount)};
    repaint();
  });
  canvas.addEventListener('pointermove',event=>{
    if(!drag)return;
    const p=point(event);
    if(drag.mode==='move'){
      const dx=p.x-drag.start.x,dy=p.y-drag.start.y;
      if(!drag.changed&&Math.hypot(dx,dy)<=1)return;
      if(!drag.changed&&Math.hypot(dx,dy)>1){checkpoint();drag.changed=true;}
      const item=draft.elements[selected];
      if(item.type==='stroke')item.points=drag.original.points.map(([x,y])=>[x+dx,y+dy]);else{item.x=drag.original.x+dx;item.y=drag.original.y+dy;}
    }else if(drag.item.type==='stroke'){
      const last=drag.item.points.at(-1);
      if(drag.item.points.length<drag.remaining&&Math.hypot(p.x-last[0],p.y-last[1])>=1)drag.item.points.push([p.x,p.y]);
    }else{drag.item.w=p.x-drag.start.x;drag.item.h=p.y-drag.start.y;}
    repaint();
  });
  const end=event=>{drag=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);};
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();save(false);return;}
    if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();restore(event.shiftKey?redo:undo,event.shiftKey?undo:redo);}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();restore(redo,undo);}
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();deleteSelection();}
  });
  chooseTool('draw');repaint();canvas.focus({preventScroll:true});
  return {close};
}
