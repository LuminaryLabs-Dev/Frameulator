import{normalizeCapabilities}from"../../../services/driver-service/protocol/index.mjs";
export function createWindowsVirtualUsbDriver(){return{
async probe(){return{platform:"win32",available:false,reason:"native driver not implemented",hardwareProven:false};},
async install(){throw Object.assign(new Error("native driver not implemented"),{code:"DRIVER_UNPROVEN"});},
async uninstall(){throw Object.assign(new Error("native driver not implemented"),{code:"DRIVER_UNPROVEN"});},
async start(){throw Object.assign(new Error("native driver not implemented"),{code:"DRIVER_UNPROVEN"});},
async stop(){return{running:false};},
async publishDevice(){throw Object.assign(new Error("native driver not implemented"),{code:"DRIVER_UNPROVEN"});},
async removeDevice(){return{removed:false,reason:"device-not-published"};},
async status(){return{running:false,implemented:false,hardwareProven:false};},
async capabilities(){return normalizeCapabilities({adbTcp:true,nativeDeviceIntegration:"planned",virtualUsb:false});}
};}
