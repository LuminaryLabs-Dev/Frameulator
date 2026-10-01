export function createSshEndpoint({host="127.0.0.1",port=2222}={}){return{schema:"frameulator.ssh/1",host,port,status:"stopped",evidence:"portable-transport-contract"};}
