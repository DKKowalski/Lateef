// Original project helpers; independent of DOM and any course implementation.
(function(global){
 const clamp=x=>Math.max(0,Math.min(1,x));
 const ease=x=>{const p=clamp(x);return p*p*p*(p*(p*6-15)+10);};
 const between=(t,start,end)=>ease((t-start)/(end-start));
 function spring(t,omega=15,zeta=.73){if(t<=0)return 0;const a=Math.sqrt(1-zeta*zeta);return 1-Math.exp(-zeta*omega*t)*(Math.cos(omega*a*t)+zeta/a*Math.sin(omega*a*t));}
 function stepSpring(state,dt,{stiffness=420,damping=27}={}){
  let remaining=Math.max(0,Math.min(dt,.05));
  while(remaining>1e-8){const h=Math.min(remaining,1/120);state.v+=(-stiffness*(state.x-state.target)-damping*state.v)*h;state.x+=state.v*h;remaining-=h;}
  if(Math.abs(state.v)<.001&&Math.abs(state.x-state.target)<.001){state.x=state.target;state.v=0;}
  return state;
 }
 function cubicPoint(t,a,b,c,d){const u=1-t;return{x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};}
 global.LateefMotionMath=Object.freeze({clamp,ease,between,spring,stepSpring,cubicPoint});
})(globalThis);
