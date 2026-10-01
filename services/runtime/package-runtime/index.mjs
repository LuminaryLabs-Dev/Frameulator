export function classifyPackage(name=""){const n=name.toLowerCase();if(n.endsWith(".apk"))return"apk";if(n.endsWith(".flatpak"))return"flatpak";return"unknown";}
