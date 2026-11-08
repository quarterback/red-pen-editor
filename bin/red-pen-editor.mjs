#!/usr/bin/env node
import fs from 'node:fs/promises';
import { inspect, applyEdits, editorialBrief } from '../src/index.mjs';
import { reviewWithOllama } from '../src/model.mjs';

const usage = `Red Pen Editor 0.2.1
Usage: red-pen-editor <inspect|brief|review|edit|apply> [file|-] [options]

inspect  Show possible repetition and basic structure (no model needed)
brief    Show editorial instructions and inspection (no model needed)
review   Propose substantive cuts with local Ollama; never changes the file
edit     Apply safe Ollama-proposed edits; print revision to stdout
apply    Apply JSON edits from --edits path; print revision to stdout

Options:
  --audience TEXT    Intended audience
  --purpose TEXT     Purpose of the copy
  --preserve TEXT    Preserve this exact phrase (repeatable)
  --model NAME       Ollama model (default: EDITOR_MODEL or llama3.2)
  --endpoint URL     Local Ollama address (default: http://127.0.0.1:11434)
  --edits PATH       JSON proposals for apply: array or {edits:[...]}
  --json             Show complete JSON result on stdout
  --help             Show help

Nothing overwrites the input file. review/edit require a running local Ollama.
`;
function arg(name,defaultValue) {
  const idx=process.argv.indexOf(name);
  return idx >= 0 ? (process.argv[idx+1] ?? defaultValue) : defaultValue;
}
function namedList(name) {
  const result=[];for(let i=2;i<process.argv.length;i++) if(process.argv[i]===name && process.argv[i+1]) result.push(process.argv[i+1]);return result;
}
const cmd=process.argv[2];
if (!cmd || cmd==='--help' || cmd==='help') {process.stdout.write(usage);process.exit(0);}
if (!['inspect','brief','review','edit','apply'].includes(cmd)) {process.stderr.write(usage);process.exit(2);}
let path=process.argv[3];
if (!path || path.startsWith('--')) path='-';
const readStdin=async()=>{let s='';for await (const chunk of process.stdin) s+=chunk;return s;};
try {
  const text=path==='-'?await readStdin():await fs.readFile(path,'utf8');
  if (!text.trim()) throw new Error('Empty input. Supply a file or pipe text on stdin.');
  const options={audience:arg('--audience','the intended reader'),purpose:arg('--purpose','answer the actual request'),
    preserve:namedList('--preserve'),model:arg('--model',process.env.EDITOR_MODEL),endpoint:arg('--endpoint',process.env.OLLAMA_URL)};
  let result;
  if(cmd==='inspect')result=inspect(text);
  else if(cmd==='brief')result={brief:editorialBrief(options),inspection:inspect(text)};
  else if(cmd==='apply'){
    const editsPath=arg('--edits');if(!editsPath)throw new Error('apply needs --edits path');
    const payload=JSON.parse(await fs.readFile(editsPath,'utf8'));
    result=applyEdits(text,Array.isArray(payload)?payload:payload.edits,options);
  }
  else result=await reviewWithOllama(text,options);
  if(cmd==='edit'||cmd==='apply'){
    if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(result,null,2)+'\n');
    else {
      process.stdout.write(result.revised+'\n');
      process.stderr.write(`${result.accepted.length} edits accepted, ${result.rejected.length} rejected; ${result.wordsRemoved} net words removed. Review before publishing.\n`);
    }
  }else process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(error){process.stderr.write(`Error: ${error.message}\n`);process.exitCode=1;}
