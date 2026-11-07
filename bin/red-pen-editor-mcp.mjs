#!/usr/bin/env node
/** Zero-dependency stdio MCP server. stdout is reserved for JSON-RPC. */
import readline from 'node:readline';
import { processMessage } from '../src/protocol.mjs';
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await (const line of lines) {
  if (!line.trim()) continue;
  try {
    const response = await processMessage(JSON.parse(line));
    if (response) process.stdout.write(JSON.stringify(response)+'\n');
  } catch(error) {
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:error.message}})+'\n');
  }
}
