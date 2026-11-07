import { inspect, editorialBrief, applyEdits } from './index.mjs';
import { reviewWithOllama } from './model.mjs';

const VERSION = '0.2.0';
const INFO = {name:'red-pen-editor', version:VERSION};
const schemaText = { type:'string', minLength: 1 };
const commonProps = {
  text: schemaText,
  audience: {type:'string', description:'Who will read this?'},
  purpose: {type:'string', description:'What should this writing accomplish?'},
  preserve: {type:'array', items:{type:'string'}, description:'Literals or terminology that must remain exactly.'}
};
const opts = {
  type:'object', properties:commonProps, required:['text'], additionalProperties:false
};
const modelOpts = {type:'object', properties:{...commonProps,
  model:{type:'string',description:'Local Ollama model, e.g. llama3.2'},
  endpoint:{type:'string',description:'Local Ollama base URL (loopback only).'}
},required:['text'],additionalProperties:false};
const toolSpecs = [
  {name:'editorial_brief', title:'Editorial judgment brief',
    description:'Read the text and receive a substantive editing method plus possible sentence duplication signals. Use your OWN model to decide which claims to cut. No external model required.', inputSchema:opts},
  {name:'editorial_apply',title:'Apply justified editorial cuts',
    description:'Safely apply EXACT substring replacements or deletions proposed by the host agent; reject ambiguous, overlapping or fact-losing changes. Always show the revised text for human review.',
    inputSchema:{type:'object',properties:{...commonProps,
      edits:{type:'array', items:{type:'object',properties:{before:{type:'string'},after:{type:'string'},kind:{type:'string'},reason:{type:'string'},
        allowLoss:{type:'array',items:{type:'string'},description:'Protected numbers, dates, URLs or emails this edit may remove because the cut is justified. Cannot release anything listed in preserve.'}},required:['before','after'],additionalProperties:true}}
    },required:['text','edits'],additionalProperties:false}},
  {name:'editorial_review_local',title:'Review with a local language model',
    description:'Use Ollama on this computer to make a contextual editorial assessment and propose justified cuts. No commercial API or subscription.',inputSchema:modelOpts},
  {name:'editorial_edit_local',title:'Edit with a local language model',
    description:'Review with Ollama then apply safe, uniquely anchored edits; return the revision and rejected edits. Human review required.',inputSchema:modelOpts}
];

function toolContent(obj,isError=false,modern=false) {
  return { ...(modern ? {resultType:'complete'} : {}), content:[{type:'text',text:JSON.stringify(obj)}], isError };
}
function err(id,code,message,modern=false) {
  return {jsonrpc:'2.0',id,error:{code,message}, ...(modern?{_meta:{'io.modelcontextprotocol/serverInfo':INFO}}:{})};
}

export async function processMessage(msg) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return err(msg?.id ?? null,-32600,'Invalid Request');
  }
  if (msg.id === undefined) return null; // Notification, including legacy initialized
  const modern = msg.method === 'server/discover' || !!msg.params?._meta?.['io.modelcontextprotocol/protocolVersion'];
  const base = {jsonrpc:'2.0',id:msg.id};
  const stamp = modern ? {_meta:{'io.modelcontextprotocol/serverInfo':INFO}} : {};
  const done = result => ({...base,result,...stamp});
  switch (msg.method) {
    case 'server/discover': return done({resultType:'complete',supportedVersions:['2026-07-28'],capabilities:{tools:{listChanged:false}}});
    case 'initialize': return done({protocolVersion:'2025-11-25',capabilities:{tools:{listChanged:false}},serverInfo:INFO,
      instructions:'Use editorial_brief first and editorial_apply after your own substantive judgment. The local-model tools are optional.'});
    case 'ping': return done({});
    case 'tools/list': return done({...(modern?{resultType:'complete'}:{}),tools:toolSpecs});
    case 'tools/call': {
      const name=msg.params?.name, a=msg.params?.arguments ?? {};
      const tool=toolSpecs.find(x=>x.name===name);
      if (!tool) return err(msg.id,-32602,`Unknown tool: ${name}`,modern);
      if (typeof a.text !== 'string' || !a.text.trim()) return done(toolContent({error:'text must be a nonempty string'},true,modern));
      if (a.preserve !== undefined && (!Array.isArray(a.preserve) || a.preserve.some(p=>typeof p!=='string'))) {
        return done(toolContent({error:'preserve must be an array of strings'},true,modern));
      }
      try {
        let result;
        if (name==='editorial_brief') result={brief:editorialBrief(a),inspection:inspect(a.text),
          next:'Review the entire text. Propose specific deletions/replacements with exact before and after strings; then call editorial_apply.'};
        else if (name==='editorial_apply') {
          if (!Array.isArray(a.edits)) return done(toolContent({error:'edits must be an array'},true,modern));
          result=applyEdits(a.text,a.edits,{preserve:a.preserve});
        }
        else result=await reviewWithOllama(a.text,a);
        if (name==='editorial_review_local') {
          // Suggestions, not an applied change: surface the preview and any rejections.
          result={...result,preview:result.revised,revised:undefined,notice:'Preview only; source text has not been changed.'};
        }
        return done(toolContent(result,false,modern));
      } catch(e) { return done(toolContent({error:e.message},true,modern)); }
    }
    default: return err(msg.id,-32601,`Method not found: ${msg.method}`,modern);
  }
}
