import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { inspect, applyEdits, wordCount, editorialBrief } from '../src/index.mjs';
import { reviewWithOllama, reviewPrompt } from '../src/model.mjs';
import { processMessage } from '../src/protocol.mjs';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';

const source='The policy may change in 2027. The policy may change in 2027. Contact permits@city.gov.';

test('counts words and detects possible repeated sentences without cutting them',()=>{
  const output=inspect(source);
  assert.equal(output.sentences,3);
  assert.ok(output.possibleRepeatedSentences.length>=1);
  assert.equal(wordCount('Plain text, 10 days'),4);
  assert.match(output.note,/surface signals/);
});

test('applies one unique exact-span edit',()=>{
  const text='There are several issues to consider. Approvals start May 1.';
  const result=applyEdits(text,[{before:'There are several issues to consider. ',after:'',kind:'throat-clearing'}]);
  assert.equal(result.revised,'Approvals start May 1.');
  assert.equal(result.accepted.length,1);
  assert.equal(result.rejected.length,0);
});

test('does not choose an ambiguous source span',()=>{
  const result=applyEdits('repeat repeat',[{before:'repeat',after:''}]);
  assert.equal(result.accepted.length,0);
  assert.match(result.rejected[0].reason,/ambiguous/);
});

test('rejects overlapping replacements',()=>{
  const result=applyEdits('A block of explanatory words',[{before:'block of explanatory',after:'brief'},{before:'explanatory words',after:'words'}]);
  assert.equal(result.accepted.length,1);
  assert.match(result.rejected[0].reason,/Overlapping/);
});

test('preserves unique numbers and URL anchors',()=>{
  const text='Published June 2026. Visit https://city.gov/help for details.';
  const result=applyEdits(text,[{before:'Published June 2026. ',after:''}]);
  assert.equal(result.accepted.length,0);
  assert.match(result.rejected[0].reason,/2026/);
});

test('preserves explicitly protected language',()=>{
  const text='We may issue a decision. Review by a person is required.';
  const result=applyEdits(text,[{before:'Review by a person is required.',after:''}],{preserve:['Review by a person']});
  assert.equal(result.accepted.length,0);
  assert.equal(result.revised,text);
});

test('editorial brief starts with reader and purpose',()=>{
  const brief=editorialBrief({audience:'residents',purpose:'explain a rule'});
  assert.match(brief,/residents/);
  assert.match(brief,/Decide what deserves to exist/);
});

test('review prompt requires a unique exact source span',()=>{
  const prompt=reviewPrompt('Example source.',{});
  assert.match(prompt,/unique, exactly matching substring/);
  assert.match(prompt,/Zero edits is acceptable/);
});

test('MCP modern and legacy discovery plus tool application',async()=>{
  const discover=await processMessage({jsonrpc:'2.0',id:1,method:'server/discover',params:{}});
  assert.deepEqual(discover.result.supportedVersions,['2026-07-28']);
  const legacy=await processMessage({jsonrpc:'2.0',id:2,method:'initialize',params:{protocolVersion:'2025-11-25'}});
  assert.equal(legacy.result.protocolVersion,'2025-11-25');
  const listed=await processMessage({jsonrpc:'2.0',id:3,method:'tools/list',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}});
  assert.equal(listed.result.resultType,'complete');
  assert.ok(listed.result.tools.some(t=>t.name==='editorial_apply'));
  const reply=await processMessage({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'editorial_apply',arguments:{text:'This is a preface. The policy begins in June.',edits:[{before:'This is a preface. ',after:''}]},_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'}}});
  assert.equal(JSON.parse(reply.result.content[0].text).revised,'The policy begins in June.');
});

test('a mocked local Ollama response produces a guarded revision',async()=>{
  const server=createServer(async(req,res)=>{
    assert.equal(req.url,'/api/generate');
    let body='';for await(const chunk of req)body+=chunk;
    const data=JSON.parse(body);
    assert.ok(data.format.properties.edits);
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({response:JSON.stringify({assessment:'An unnecessary opener delays the point.',edits:[{before:'As a general observation, ',after:'',kind:'throat-clearing',reason:'No useful contribution.',priority:'high'}],protectedMeaning:[]})}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    const result=await reviewWithOllama('As a general observation, applications open Monday.',{endpoint:`http://127.0.0.1:${server.address().port}`,model:'test-model'});
    assert.equal(result.revised,'applications open Monday.');
    assert.equal(result.accepted.length,1);
  } finally {server.close();}
});

test('CLI apply works without installing packages',async()=>{
  const child=spawn(process.execPath,['bin/red-pen-editor.mjs','apply','examples/bloated.md','--edits','examples/edits.json'],{cwd:new URL('../',import.meta.url),stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  for await(const chunk of child.stdout) stdout+=chunk;
  for await(const chunk of child.stderr) stderr+=chunk;
  const [code]=await once(child,'close');
  assert.equal(code,0,stderr);
  assert.match(stdout,/Beginning May 1/);
  assert.doesNotMatch(stdout,/In conclusion/);
  assert.match(stderr,/edits accepted/);
});

test('MCP process speaks newline-delimited JSON-RPC on stdio',async()=>{
  const child=spawn(process.execPath,['bin/red-pen-editor-mcp.mjs'],{cwd:new URL('../',import.meta.url),stdio:['pipe','pipe','pipe']});
  try {
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:42,method:'ping',params:{}})+'\n');
    const promise = new Promise((resolve,reject)=>{
      let buf='';child.stdout.on('data',chunk=>{buf+=chunk;const line=buf.split('\n')[0];if(buf.includes('\n')) resolve(JSON.parse(line));});
      child.once('error',reject);
    });
    const response=await promise;
    assert.equal(response.id,42);
    assert.deepEqual(response.result,{});
  } finally {child.stdin.end();child.kill();}
});
