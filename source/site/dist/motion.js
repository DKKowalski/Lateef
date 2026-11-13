// Original project implementation. Consult docs/MOTION_GUIDE.md before changing timing.
// The gallery's drawings are CSS keyframes that rest in their finished state. This file only decides when they play,
// and runs the two input-driven effects (boops and stretching arrows) that have to survive being interrupted.
(function(){
const {stepSpring}=globalThis.LateefMotionMath;
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const fine=matchMedia('(hover: hover) and (pointer: fine)');
const PHYSICS=Object.freeze({control:{stiffness:420,damping:27}});
const PLAY_MS=2300,REDUCED_MS=400,BOOP_MS=150;
const instances=new WeakMap();let sequence=0;

// Masks, clips and gradients resolve by ID, so every mounted gallery gets its own prefix.
function namespaceSVG(scope,prefix){
 const ids=new Map();
 for(const el of scope.querySelectorAll('svg [id]')){const old=el.id;el.id=prefix+old;ids.set(old,el.id);}
 if(!ids.size)return;
 for(const el of scope.querySelectorAll('svg *'))for(const a of [...el.attributes]){
  if(a.value.includes('url(#'))el.setAttribute(a.name,a.value.replace(/url\(#([^)]+)\)/g,(_,id)=>`url(#${ids.get(id)||id})`));
  if(a.name==='href'&&a.value.startsWith('#')&&ids.has(a.value.slice(1)))el.setAttribute(a.name,'#'+ids.get(a.value.slice(1)));
 }
}

// A boop runs in full however briefly the pointer passes: the class goes on, and comes off on a timer, not on leave.
function boop(el){
 if(reduce.matches||!el)return;
 clearTimeout(el.boopTimer);el.classList.add('is-booped');
 el.boopTimer=setTimeout(()=>el.classList.remove('is-booped'),BOOP_MS);
}

function mount(gallery){
 if(instances.has(gallery))return instances.get(gallery);
 const events=new AbortController(),timers=new Set(),stages=[...gallery.querySelectorAll('[data-stage]')];
 const on=(el,type,fn)=>el.addEventListener(type,fn,{signal:events.signal});
 const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);return id;};
 namespaceSVG(gallery,`lateef-gallery-${++sequence}-`);

 // Removing the class, forcing a style flush and adding it again restarts every keyframe from its first frame.
 function play(stage){
  clearTimeout(stage.playTimer);timers.delete(stage.playTimer);
  stage.classList.remove('is-playing');void stage.offsetWidth;stage.classList.add('is-playing');
  stage.playTimer=later(()=>stage.classList.remove('is-playing'),reduce.matches?REDUCED_MS:PLAY_MS);
 }
 const playing=stage=>stage.classList.contains('is-playing');

 // Each stage plays once when it first comes into view. Neighbours in a row start a beat apart.
 const seen=new IntersectionObserver(entries=>{
  let order=0;
  for(const entry of entries){
   if(!entry.isIntersecting)continue;
   seen.unobserve(entry.target);
   if(!reduce.matches)later(()=>play(entry.target),140*order++);
  }
 },{threshold:.55});

 for(const stage of stages){
  const button=stage.querySelector('[data-play]');
  if(button){
   on(button,'click',()=>play(stage));
   on(button,'pointerenter',()=>boop(button));
   on(button,'focus',()=>boop(button));
  }
  // Hovering a drawing replays it: the motion shows what the tool does, so it is not limited to the button.
  on(stage,'pointerenter',event=>{if(event.pointerType==='mouse'&&fine.matches&&!playing(stage)&&!stage.hasAttribute('data-access'))play(stage);});
  if(!stage.hasAttribute('data-access'))seen.observe(stage);
 }

 // The access stage is a sample switch, not a product permission. Its two directions are styled separately in CSS.
 for(const stage of gallery.querySelectorAll('[data-access]')){
  const toggle=stage.querySelector('[data-access-toggle]'),status=stage.querySelector('[data-access-status]'),text=toggle.querySelector('[data-label]');
  on(toggle,'click',()=>{
   const shared=stage.dataset.access!=='shared';
   stage.dataset.access=shared?'shared':'revoked';
   toggle.setAttribute('aria-pressed',String(shared));
   text.textContent=shared?'Revoke sample access':'Share sample tab';
   status.textContent=shared?'Sample tab shared.':'Sample access revoked.';
  });
  on(toggle,'pointerenter',()=>boop(toggle));
 }

 const api={
  play(index){if(stages[index])play(stages[index]);},
  replayAll(){stages.filter(s=>!s.hasAttribute('data-access')).forEach((stage,i)=>later(()=>play(stage),reduce.matches?0:90*i));},
  destroy(){events.abort();seen.disconnect();for(const id of timers)clearTimeout(id);timers.clear();for(const s of stages)s.classList.remove('is-playing');instances.delete(gallery);}
 };
 instances.set(gallery,api);return api;
}

for(const gallery of document.querySelectorAll('[data-gallery]')){
 const api=mount(gallery);
 for(const button of document.querySelectorAll(`[data-replay-all="${gallery.id}"]`)){
  button.addEventListener('click',()=>api.replayAll());
  button.addEventListener('pointerenter',()=>boop(button));
 }
}
for(const el of document.querySelectorAll('[data-boop]')){
 el.addEventListener('pointerenter',()=>boop(el));el.addEventListener('focus',()=>boop(el));
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
globalThis.LateefMotion=Object.freeze({mount,boop});
})();
