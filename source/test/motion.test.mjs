import test from 'node:test';
import assert from 'node:assert/strict';
import '../site/dist/motion-math.js';
const {spring,stepSpring,cubicPoint}=globalThis.LateefMotionMath;
test('authored spring starts at rest and settles without an initial velocity jump',()=>{
 assert.equal(spring(0),0);assert.equal(spring(-1),0);
 assert.ok(spring(.0001)<.00001);assert.ok(Math.abs(spring(4)-1)<.00001);
});
test('interactive spring preserves momentum when its target reverses and converges across frame rates',()=>{
 const state={x:0,v:0,target:1};for(let i=0;i<8;i++)stepSpring(state,1/120);assert.ok(state.v>0);
 const before=state.v;state.target=0;stepSpring(state,1/10000);assert.ok(state.v>0&&state.v<before,'retargeting decelerates existing velocity, rather than resetting it');
 const positions=[];for(const fps of [30,60,120]){const s={x:0,v:0,target:1};for(let i=0;i<fps*3;i++)stepSpring(s,1/fps);assert.ok(Number.isFinite(s.x)&&Number.isFinite(s.v));assert.equal(s.x,1);assert.equal(s.v,0);positions.push(s.x);}
});
test('route positions use the same cubic geometry from its origin to destination',()=>{
 const points=[{x:126,y:77},{x:160,y:77},{x:151,y:45},{x:192,y:45}];
 assert.deepEqual(cubicPoint(0,...points),points[0]);assert.deepEqual(cubicPoint(1,...points),points[3]);
 const middle=cubicPoint(.5,...points);assert.ok(middle.x>126&&middle.x<192&&middle.y>45&&middle.y<77);
});
