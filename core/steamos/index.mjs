export function createSteamOsState(){return{schema:"frameulator.steamos/1",lifecycle:"stopped",ssh:{enabled:true,connected:false},devkit:{enabled:true,endpoint:"local"},processes:new Map(),flatpaks:new Map()};}
export function setSteamOsLifecycle(s,n){if(!new Set(["stopped","starting","running","suspended","error"]).has(n))throw new Error("Invalid SteamOS lifecycle: "+n);s.lifecycle=n;return n;}
