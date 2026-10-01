const pose=()=>({position:[0,0,0],orientation:[0,0,0,1],valid:true});
export function createXrState(){return{schema:"frameulator.xr/1",lifecycle:"idle",frame:0,head:pose(),controllers:{left:pose(),right:pose()},buttons:{left:{},right:{}},trackingAvailable:true,recenterCount:0};}
export function setPose(s,src,p){if(!p||!Array.isArray(p.position)||!Array.isArray(p.orientation))throw new TypeError("Pose requires position and orientation arrays");if(src==="head")s.head=structuredClone(p);else if(src==="left"||src==="right")s.controllers[src]=structuredClone(p);else throw new Error("Unknown XR source: "+src);}
export function recenter(s){s.recenterCount++;s.head=pose();return s.recenterCount;}
