import{DRIVER_PROTOCOL,DriverOperations}from"../../../core/protocols/index.mjs";export{DRIVER_PROTOCOL};
export function validateDriverAdapter(a){const m=DriverOperations.filter(n=>typeof a?.[n]!=="function");if(m.length)throw new TypeError("Driver adapter missing methods: "+m.join(", "));return a;}
export function normalizeCapabilities(v={}){return{virtualUsb:false,deviceEnumeration:false,adbUsb:false,adbTcp:true,virtualHid:false,nativeDeviceIntegration:"none",...v};}
