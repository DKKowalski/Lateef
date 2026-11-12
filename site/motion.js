// Original project implementation. Consult MOTION_GUIDE.md before changing timing.
// The course is a learning reference, not a runtime dependency or copied asset source.
(function(){
const {clamp,between,spring,stepSpring,cubicPoint}=globalThis.LateefMotionMath;
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const instances=new WeakMap();let sequence=0;
const PHYSICS=Object.freeze({control:{stiffness:420,damping:27},arrival:{omega:14,zeta:.78},accent:{omega:18,zeta:.72}});
function namespaceSVG(scene,prefix){
 const ids=new Map();
 for(const el of scene.querySelectorAll('svg [id]')){const old=el.id;el.id=prefix+old;ids.set(old,el.id);}
 for(const el of scene.querySelectorAll('svg *'))for(const a of [...el.attributes]){
  if(a.value.includes('url(#'))el.setAttribute(a.name,a.value.replace(/url\(#([^)]+)\)/g,(_,id)=>`url(#${ids.get(id)||id})`));
  if(a.name==='href'&&a.value.startsWith('#')&&ids.has(a.value.slice(1)))el.setAttribute(a.name,'#'+ids.get(a.value.slice(1)));
 }
}
function mount(scene){
 if(instances.has(scene))return instances.get(scene);
 const root=scene.querySelector('.bento');if(!root)return;
 const $=s=>scene.querySelector(s), nodes={toggle:$('[data-motion-toggle]'),replay:$('[data-motion-replay]'),phase:$('[data-demo-phase]'),access:$('[data-access-toggle]'),status:$('[data-access-status]'),packet:$('.route-packet'),tab:$('.authorized'),beam:$('.scan-beam'),cursor:$('.demo-cursor'),travel:$('.file-travel'),sheet:$('.file-sheet'),fold:$('.file-fold'),fill:$('.file-fill'),seal:$('.file-seal')};
 const steps=[...scene.querySelectorAll('.tool-step')],events=new AbortController();
 namespaceSVG(scene,`tl-scene-${++sequence}-`);
 let paused=reduce.matches,clock=0,previous,raf=0,visible=true,destroyed=false,allowed=nodes.access.getAttribute('aria-pressed')!=='false',access=allowed?1:0,action;
 const routePoints=[{x:126,y:77},{x:160,y:77},{x:151,y:45},{x:192,y:45}];
 function draw(t){
  const p=t%16,ink=between(p,0,.55)*(1-between(p,14.3,15.85));
  root.style.setProperty('--demo-time',String(t));root.style.setProperty('--ink-opacity',ink);
  // Grant and revoke are different actions; denying access never produces a success tick.
  const amount=clamp(access),route=between(p,.9,2.55)*amount;
  root.style.setProperty('--route-offset',1-route);root.style.setProperty('--grant-offset',1-clamp(spring(p-.35,17,.78))*ink*amount);
  const packet=between(p,1.2,2.8),point=cubicPoint(packet,...routePoints);
  nodes.packet.setAttribute('cx',point.x);nodes.packet.setAttribute('cy',point.y);
  root.style.setProperty('--packet-opacity',ink*between(p,1.15,1.4)*(1-between(p,2.65,2.95))*amount);
  nodes.tab.setAttribute('transform',`translate(208 45) scale(${.95+.05*clamp(spring(p-.35,17,.78))*amount})`);
  const read=between(p,2.4,3.1),typing=between(p,4.5,6.1)*amount,upload=between(p,7.1,9.2)*amount,confirm=between(p,9.25,9.7)*amount;
  root.style.setProperty('--typed',`${typing*100}%`);root.style.setProperty('--caret',!paused&&p>4.1&&p<6.8?amount*(.5+.5*Math.sin(p*7)):0);
  root.style.setProperty('--upload',upload);root.style.setProperty('--scan-opacity',ink*between(p,2.25,2.55)*(1-between(p,4.1,4.6))*amount);root.style.setProperty('--scan-offset',1-read);
  nodes.beam.setAttribute('transform',`translate(${read*580} 0)`);
  const travel=between(p,3.5,4.3),press=between(p,4.3,4.43)*(1-between(p,4.43,4.68));
  nodes.cursor.style.opacity=ink*between(p,3.35,3.6)*(1-between(p,6.4,6.9))*amount;
  nodes.cursor.style.transform=`translate(${(1-travel)*24}px,${(1-travel)*18}px) scale(${1-.08*press})`;
  // Each group has one transform responsibility: trajectory, material response, then seal.
  const elapsed=Math.max(0,p-7.05),arrival=spring(p-7.05,PHYSICS.arrival.omega,PHYSICS.arrival.zeta);
  const strain=.045*Math.exp(-elapsed*5)*Math.sin(elapsed*13);
  nodes.travel.setAttribute('transform',`translate(${(1-arrival)*-8} ${(1-arrival)*-8})`);
  nodes.sheet.setAttribute('transform',`translate(22 25) rotate(${Math.exp(-elapsed*6)*Math.sin(elapsed*16)*1.8}) scale(${1+strain} ${1/(1+strain)}) translate(-22 -25)`);
  nodes.fold.setAttribute('transform',`translate(26 14) rotate(${-Math.exp(-elapsed*5)*Math.sin(elapsed*16-1)*3}) translate(-26 -14)`);
  nodes.fill.setAttribute('y',46-43*upload);
  const stamp=Math.max(.01,spring(p-9.2,PHYSICS.accent.omega,PHYSICS.accent.zeta));
  nodes.seal.style.opacity=ink*between(p,9.2,9.35)*amount;
  nodes.seal.setAttribute('transform',`translate(32 39) scale(${stamp}) translate(-32 -39)`);
  root.style.setProperty('--file-tick-offset',1-confirm);
  const completion=[between(p,3.2,3.7),between(p,6.2,6.7),between(p,9.25,9.7)];
  steps.forEach((el,i)=>{el.style.setProperty('--tick-offset',1-completion[i]*ink*amount);el.style.setProperty('--step-bg',ink*amount*(i===0?between(p,2,2.5)*(1-between(p,4,4.5)):i===1?between(p,4,4.5)*(1-between(p,7,7.5)):between(p,7,7.5)));});
  nodes.phase.textContent=!allowed?'Access revoked':p<3.8?'01 — Read':p<7?'02 — Fill':p<10?'03 — Attach':'04 — Complete';
 }
 function update(){nodes.toggle.setAttribute('aria-pressed',String(paused));nodes.toggle.innerHTML=paused?'Resume motion <span>▷</span>':'Pause motion <span>Ⅱ</span>';}
 function wake(){if(!raf&&!destroyed&&!document.hidden){raf=requestAnimationFrame(frame);}}
 function frame(now){raf=0;const dt=previous===undefined?0:Math.min((now-previous)/1000,.05);previous=now;
  const playing=!paused&&visible&&!document.hidden;
  if(playing)clock+=dt;
  if(action){const p=clamp((now-action.start)/action.duration);access=action.from+(action.to-action.from)*between(p,0,1);if(p===1)action=undefined;}
  if(playing||action||access!==(allowed?1:0))draw(clock);
  if(!action)access=allowed?1:0;
  if(playing||action)wake();else{draw(clock);previous=undefined;}
 }
 function setAccess(){allowed=!allowed;root.dataset.access=allowed?'shared':'revoked';nodes.access.setAttribute('aria-pressed',String(allowed));nodes.access.innerHTML=allowed?'Revoke sample access <span>↗</span>':'Share sample tab <span>↗</span>';nodes.status.textContent=allowed?'Sample tab shared.':'Sample access revoked. No file will be attached.';
  if(reduce.matches){access=allowed?1:0;action=undefined;draw(11);}else{action={from:access,to:allowed?1:0,start:performance.now(),duration:allowed?360:150};wake();}
 }
 const on=(el,type,fn)=>el.addEventListener(type,fn,{signal:events.signal});
 on(nodes.toggle,'click',()=>{paused=!paused;update();previous=undefined;wake();});
 on(nodes.replay,'click',()=>{clock=reduce.matches?11:0;previous=undefined;paused=reduce.matches;action=undefined;access=allowed?1:0;draw(clock);update();wake();});
 on(nodes.access,'click',setAccess);
 on(reduce,'change',()=>{paused=reduce.matches;clock=paused?11:clock;action=undefined;access=allowed?1:0;previous=undefined;draw(clock);update();wake();});
 on(document,'visibilitychange',()=>{previous=undefined;if(!document.hidden)wake();});
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;previous=undefined;if(visible)wake();},{threshold:.05});observer.observe(root);
 const api={seek(seconds){if(!Number.isFinite(seconds)||seconds<0)throw new Error('Time must be non-negative.');paused=true;clock=seconds;action=undefined;access=allowed?1:0;draw(clock);update();},destroy(){destroyed=true;cancelAnimationFrame(raf);events.abort();observer.disconnect();instances.delete(scene);}};
 instances.set(scene,api);clock=reduce.matches?11:0;draw(clock);update();wake();return api;
}
// Input-driven springs have velocity. Retargeting must not recreate a time curve.
for(const svg of document.querySelectorAll('.interactive-arrow')){
 const link=svg.closest('a,button');if(!link)continue;
 const state={x:0,v:0,target:0};let raf=0,last,timer;
 function paint(dt){stepSpring(state,dt,PHYSICS.control);const x=state.x,tx=18+2.2*x,ty=6-2.2*x,head=11-1.1*x;svg.querySelector('.arrow-shaft').setAttribute('d',`M5 19L${tx} ${ty}`);svg.querySelector('.arrow-head').setAttribute('d',`M${tx-head} ${ty}H${tx}V${ty+head}`);}
 function wake(){if(!raf&&!document.hidden)raf=requestAnimationFrame(frame);}
 function frame(now){raf=0;paint(last===undefined?0:(now-last)/1000);last=now;if(state.v!==0||state.x!==state.target)wake();else last=undefined;}
 function pulse(){if(reduce.matches)return;clearTimeout(timer);state.target=1;wake();timer=setTimeout(()=>{state.target=0;wake();},120);}
 link.addEventListener('pointerenter',pulse);link.addEventListener('focus',pulse);
 link.addEventListener('pointerdown',()=>{if(!reduce.matches){state.target=-.25;wake();}});
 for(const event of ['pointerleave','pointercancel','blur'])link.addEventListener(event,()=>{clearTimeout(timer);state.target=0;wake();});
 link.addEventListener('pointerup',pulse);
 reduce.addEventListener('change',()=>{clearTimeout(timer);state.x=state.v=state.target=0;cancelAnimationFrame(raf);raf=0;last=undefined;paint(0);});
 document.addEventListener('visibilitychange',()=>{last=undefined;if(!document.hidden&&(state.v!==0||state.x!==state.target))wake();});
}
for(const scene of document.querySelectorAll('.demo-section'))mount(scene);
globalThis.LateefMotion=Object.freeze({mount});
})();
