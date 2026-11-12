// Original project implementation. Consult MOTION_GUIDE.md before changing timing.
// Original implementation of the landing-page demonstration timeline; it has no runtime dependencies.
(function(){
const {clamp,between,spring,stepSpring}=globalThis.LateefMotionMath;
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
const LOOP=14,REST=11; // REST is the meaningful static frame used for reduced motion.
function mount(scene){
 if(instances.has(scene))return instances.get(scene);
 const root=scene.querySelector('.bento');if(!root)return;
 const $=s=>scene.querySelector(s), nodes={toggle:$('[data-motion-toggle]'),replay:$('[data-motion-replay]'),phase:$('[data-demo-phase]'),access:$('[data-access-toggle]'),status:$('[data-access-status]'),agent:$('[data-agent-status]'),you:$('[data-you]'),field:$('[data-fill]'),out:$('[data-packet="out"]'),back:$('[data-packet="in"]'),tab:$('.authorized'),tabState:$('.tab-state'),travel:$('.file-travel'),sheet:$('.file-sheet'),fold:$('.file-fold'),fill:$('.file-fill'),seal:$('.file-seal')};
 const steps=[...scene.querySelectorAll('.tool-step')],events=new AbortController(),written=new Map();
 const yourText=nodes.you.dataset.you,fieldText=nodes.field.dataset.fill;
 namespaceSVG(scene,`tl-scene-${++sequence}-`);
 let paused=reduce.matches,clock=0,previous,raf=0,visible=true,destroyed=false,allowed=nodes.access.getAttribute('aria-pressed')!=='false',access=allowed?1:0,action,label;
 const set=(name,value)=>root.style.setProperty(name,value);
 // Text is revealed by whole characters and only touched when the count changes.
 function write(el,text,progress){const n=Math.round(text.length*clamp(progress));if(written.get(el)!==n){written.set(el,n);el.textContent=text.slice(0,n);}}
 function draw(t){
  const p=t%LOOP,ink=between(p,0,.5)*(1-between(p,13.1,13.9)),amount=clamp(access);
  set('--demo-time',String(t));set('--ink-opacity',ink);set('--spin',`${(t*320)%360}deg`);
  // Your tab: steady typing that never waits for, or reacts to, the agent.
  write(nodes.you,yourText,(p-.6)/9.6);set('--caret',p>.4&&p<10.6?(paused?1:.5+.5*Math.sin(p*7)):0);
  // Shared tab: the route stays inked while access holds and packets travel both ways.
  const grant=clamp(spring(p-.35,17,.78));
  set('--route-offset',1-between(p,.5,2.1)*amount);set('--grant-offset',1-grant*ink*amount);
  nodes.tab.setAttribute('transform',`translate(232 75) scale(${.95+.05*grant*amount})`);
  const live=ink*amount*between(p,2,2.3),q=(t*.55)%1,r=(q+.5)%1;
  nodes.out.setAttribute('cx',98+102*q);nodes.out.setAttribute('opacity',live*Math.sin(Math.PI*q));
  nodes.back.setAttribute('cx',200-102*r);nodes.back.setAttribute('opacity',live*Math.sin(Math.PI*r));
  // Grant and revoke are different actions; denying access never produces a success tick.
  const read=between(p,1.1,3.3)*amount,typing=clamp((p-4.2)/1.9)*amount,upload=between(p,7.1,9.2)*amount,confirm=between(p,9.25,9.7)*amount;
  set('--read',read);set('--scan-opacity',ink*amount*between(p,1,1.2)*(1-between(p,3.3,3.7)));set('--read-done',ink*amount*between(p,2.9,3.5));
  write(nodes.field,fieldText,typing);set('--fill-active',ink*amount*between(p,4,4.3)*(1-between(p,6.3,6.8)));
  set('--upload',upload);
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
  set('--file-tick-offset',1-confirm);
  // A step is reached, then busy, then ticked. The tab's own indicator summarises all three.
  const windows=[[1,3.7],[4,6.8],[7,9.9]],completion=[between(p,3.3,3.7),between(p,6.3,6.8),between(p,9.25,9.7)];
  steps.forEach((el,i)=>{const [start,end]=windows[i],reached=ink*amount*between(p,start,start+.4),on=reached*(1-between(p,end-.4,end));
   el.style.setProperty('--reached',reached);el.style.setProperty('--step-bg',on);el.style.setProperty('--busy',on*(1-completion[i]));el.style.setProperty('--tick-offset',1-completion[i]*ink*amount);});
  nodes.tabState.style.setProperty('--busy',ink*amount*between(p,1,1.3)*(1-completion[2]));nodes.tabState.style.setProperty('--tick-offset',1-completion[2]*ink*amount);
  // The connection tile only shows that a path exists; it is not gated by the sample access.
  const f=(t*.4)%1,g=(f+.5)%1;set('--flow',f);set('--flow-opacity',Math.sin(Math.PI*f));set('--flow2',g);set('--flow2-opacity',Math.sin(Math.PI*g));
  const next=!allowed?'Access revoked':p<1?'Waiting':p<3.8?'01 — Read':p<6.9?'02 — Fill':p<9.8?'03 — Attach':'04 — Complete';
  if(next!==label){label=next;nodes.phase.textContent=next;nodes.agent.textContent=!allowed?'No access':p<1?'Waiting':p<3.8?'Reading':p<6.9?'Filling':p<9.8?'Attaching':'Done';}
 }
 function update(){nodes.toggle.setAttribute('aria-pressed',String(paused));nodes.toggle.textContent=paused?'Resume':'Pause';}
 function wake(){if(!raf&&!destroyed&&!document.hidden){raf=requestAnimationFrame(frame);}}
 function frame(now){raf=0;const dt=previous===undefined?0:Math.min((now-previous)/1000,.05);previous=now;
  const playing=!paused&&visible&&!document.hidden;
  if(playing)clock+=dt;
  if(action){const p=clamp((now-action.start)/action.duration);access=action.from+(action.to-action.from)*between(p,0,1);if(p===1)action=undefined;}
  if(playing||action||access!==(allowed?1:0))draw(clock);
  if(!action)access=allowed?1:0;
  if(playing||action)wake();else{draw(clock);previous=undefined;}
 }
 function setAccess(){allowed=!allowed;root.dataset.access=allowed?'shared':'revoked';nodes.access.setAttribute('aria-pressed',String(allowed));nodes.access.textContent=allowed?'Revoke sample access':'Share sample tab';nodes.status.textContent=allowed?'Sample tab shared.':'Sample access revoked. No file will be attached.';
  if(reduce.matches){access=allowed?1:0;action=undefined;draw(REST);}else{action={from:access,to:allowed?1:0,start:performance.now(),duration:allowed?360:150};wake();}
 }
 const on=(el,type,fn)=>el.addEventListener(type,fn,{signal:events.signal});
 on(nodes.toggle,'click',()=>{paused=!paused;update();previous=undefined;wake();});
 on(nodes.replay,'click',()=>{clock=reduce.matches?REST:0;previous=undefined;paused=reduce.matches;action=undefined;access=allowed?1:0;draw(clock);update();wake();});
 on(nodes.access,'click',setAccess);
 on(reduce,'change',()=>{paused=reduce.matches;clock=paused?REST:clock;action=undefined;access=allowed?1:0;previous=undefined;draw(clock);update();wake();});
 on(document,'visibilitychange',()=>{previous=undefined;if(!document.hidden)wake();});
 const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;previous=undefined;if(visible)wake();},{threshold:.05});observer.observe(root);
 const api={seek(seconds){if(!Number.isFinite(seconds)||seconds<0)throw new Error('Time must be non-negative.');paused=true;clock=seconds;action=undefined;access=allowed?1:0;draw(clock);update();},destroy(){destroyed=true;cancelAnimationFrame(raf);events.abort();observer.disconnect();instances.delete(scene);}};
 instances.set(scene,api);clock=reduce.matches?REST:0;draw(clock);update();wake();return api;
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
