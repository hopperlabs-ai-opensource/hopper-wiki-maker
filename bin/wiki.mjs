#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import readline from 'node:readline';
import {ops,operate,readers} from '../src/operations.mjs';
const [name,location='wiki.json',...params]=process.argv.slice(2);
const write=value=>process.stdout.write(JSON.stringify(value)+'\n');
const readJSON=s=>s?.startsWith('@')?JSON.parse(fs.readFileSync(s.slice(1),'utf8')):JSON.parse(s||'{}');
function list(){return (location.startsWith('https://')?readers:Object.keys(ops)).map(key=>({name:'wiki_'+key,description:ops[key][0],inputSchema:{type:'object',properties:ops[key][1],required:ops[key][2],additionalProperties:false}}));}
async function rpc(m){
 const result=value=>({jsonrpc:'2.0',id:m.id,result:value});
 if(m.jsonrpc!=='2.0')throw Error('Invalid JSON-RPC');
 if(m.id===undefined)return;
 if(m.method==='initialize'){const versions=['2025-11-25','2025-06-18','2025-03-26','2024-11-05'];return result({protocolVersion:versions.includes(m.params?.protocolVersion)?m.params.protocolVersion:versions[0],capabilities:{tools:{}},serverInfo:{name:'hopper-wiki-maker',version:'0.1.2'}});}
 if(m.method==='ping')return result({});
 if(m.method==='tools/list')return result({tools:list()});
 if(m.method==='tools/call'){
  try{const tool=list().find(t=>t.name===m.params?.name);if(!tool)throw Error('Unknown tool');const v=await operate(location,tool.name.slice(5),m.params.arguments||{});return result({content:[{type:'text',text:JSON.stringify(v)}]});}
  catch(e){return result({isError:true,content:[{type:'text',text:e.message}]});}
 }
 return {jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'Unknown method'}};
}
try{
 if(name==='mcp'){for await(const line of readline.createInterface({input:process.stdin})){try{const r=await rpc(JSON.parse(line));if(r)write(r);}catch(e){write({jsonrpc:'2.0',id:null,error:{code:-32700,message:e.message}});}}}
 else if(name==='serve'){
  // The local HTTP surface is read-only. Local editorial work runs through CLI or stdio.
  const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');const key=u.pathname.slice(5);if(req.method!=='GET'||!u.pathname.startsWith('/api/')||!readers.includes(key))throw Error('Unknown read operation');const value=await operate(location,key,Object.fromEntries(u.searchParams));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
  server.listen(Number(params[0]||8787),'127.0.0.1',()=>console.error('Listening on http://127.0.0.1:'+server.address().port));
 }else if(name==='help'||!name)console.log('wiki-maker OP GRAPH [JSON or @file]\nOperations: '+Object.keys(ops).join(', ')+'\nwiki-maker mcp GRAPH | wiki-maker serve GRAPH [port]');
 else write(await operate(location,name,readJSON(params[0])));
}catch(e){console.error(e.message);process.exitCode=1;}
