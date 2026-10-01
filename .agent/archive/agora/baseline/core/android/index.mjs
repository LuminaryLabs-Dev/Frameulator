export function createAndroidState(){return{schema:"frameulator.android/1",transport:"adb-tcp",connected:false,packages:new Map(),properties:new Map([["ro.product.manufacturer","Luminary Labs"],["ro.product.model","Frameulator Steam Frame"],["ro.product.cpu.abi","arm64-v8a"]]),logs:[]};}
export function installPackage(s,p){if(!p?.id||!p?.version)throw new TypeError("Package id and version are required");s.packages.set(p.id,{...p,installedAt:Date.now(),running:false});return s.packages.get(p.id);}
export const removePackage=(s,id)=>s.packages.delete(id);
export function setPackageRunning(s,id,r){const p=s.packages.get(id);if(!p)throw new Error("Unknown package: "+id);p.running=!!r;return{...p};}
