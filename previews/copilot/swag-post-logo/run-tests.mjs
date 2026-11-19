import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
const dir=path.resolve('previews/copilot/swag-post-logo');
const suites={
  focused:['tests/copilot-swag-post-logo.test.js'],
  workflows:['tests/copilot-swag-design.test.js','tests/copilot-swag-chat.test.js','tests/copilot-swag-interactive.test.js','tests/copilot-response-format.test.js'],
  safety:['tests/copilot-write-state.test.js','tests/copilot-attachments.test.js','tests/swag-mockup-consistency.test.js','tests/collections.test.js','tests/collection-design-merge.test.js','tests/mcp-collection-publish.test.js'],
  bindings:['tests/copilot-mcp-catalog.test.js','tests/copilot-writes-registry.test.js','tests/copilot-anthropic-provider.test.js'],
  renderer:['tests/copilot-swag-artwork.renderer-check.js'],
  browser:['tests/copilot-swag-post-logo.browser-check.js'],
  'polish-browser':['tests/copilot-swag-polish.browser-check.js'],
};
const group=process.argv[2];
let files=suites[group],cwd=path.resolve('apps/api'),config;
if(group==='web'){
 files=JSON.parse(fs.readFileSync('previews/copilot/swag-polish/web-final.json','utf8')).testResults.map(f=>f.name.replaceAll('\\','/').split('/apps/web/')[1]);
 files.push('src/features/copilot/CopilotSwagPostLogo.test.tsx');cwd=path.resolve('apps/web');
}else if(group==='renderer')config=path.resolve('previews/copilot/swag-auto/vitest-artwork.config.mjs');
else if(group==='browser')config=path.resolve('previews/copilot/swag-post-logo/vitest-browser.config.mjs');
else if(group==='polish-browser')config=path.resolve('previews/copilot/swag-polish/vitest-browser.config.mjs');
if(!files)throw Error('Choose focused, workflows, safety, renderer, browser or web');
const report=path.join(dir,`${group}-final.json`);if(fs.existsSync(report))fs.renameSync(report,path.join(dir,`${group}.attempt-${Date.now()}.json`));
const env={...process.env,GOMAXPROCS:'2',GOMEMLIMIT:'2GiB'};delete env.MONGODB_TEST_URI;
for(const key of fs.readFileSync('apps/api/src/modules/copilot/copilotWriteFlags.js','utf8').match(/EMBEDDED_COPILOT_WRITE_[A-Z_]+/g)||[])env[key]='false';
env.SWAG_RENDERER_EXECUTABLE=['renderer','browser','polish-browser'].includes(group)?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':'';
if(group==='polish-browser'){env.SWAG_POLISH_PHASE='after';env.SWAG_POLISH_OUTPUT='../../previews/copilot/swag-post-logo/polish-browser';}
const log=fs.openSync(path.join(dir,`${group}.log`),'w');
const child=spawn(process.execPath,['--max-old-space-size=4096','../../node_modules/vitest/vitest.mjs','run',...files,...(config?['--config',config]:[]),'--pool=threads','--maxWorkers=1','--reporter=json',`--outputFile=${report}`],{cwd,env,windowsHide:true,stdio:['ignore',log,log]});
const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});fs.closeSync(log);
if(!fs.existsSync(report)){console.log(JSON.stringify({group,exitCode:code,report:false}));process.exitCode=1;}
else {const r=JSON.parse(fs.readFileSync(report,'utf8')),tests=r.testResults.flatMap(f=>f.assertionResults);const passed=code===0&&r.success&&!r.numFailedTests&&!r.numPendingTests&&tests.length===r.numTotalTests&&tests.every(t=>t.status==='passed');console.log(JSON.stringify({group,exitCode:code,passed:r.numPassedTests,failed:r.numFailedTests,pending:r.numPendingTests,complete:passed}));process.exitCode=passed?0:1;}
