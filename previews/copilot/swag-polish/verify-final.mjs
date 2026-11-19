import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const dir='previews/copilot/swag-polish';
const changedFiles=[
  'apps/web/src/features/copilot/SwagStepMessage.tsx',
  'apps/web/src/features/copilot/CopilotProductCards.tsx',
  'apps/web/src/features/copilot/CopilotPage.tsx',
  'apps/web/src/features/copilot/copilot.css',
  'apps/web/src/features/copilot/CopilotSwagTimeline.test.tsx',
  'apps/web/src/features/copilot/CopilotSwagPolish.test.tsx',
  'apps/api/tests/copilot-swag-polish.browser-check.js',
];
const allowed=new Set(changedFiles),before=JSON.parse(fs.readFileSync(`${dir}/before.json`,'utf8'));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const edited=[];
for(const [file,expected] of Object.entries(before)) {
  if(!fs.existsSync(file))throw Error(`Original file removed: ${file}`);
  if(hash(file)!==expected){if(!allowed.has(file))throw Error(`Unrelated change: ${file}`);edited.push(file);}
}
for(const f of execFileSync('rg',['--files','apps','-g','!node_modules','-g','!dist'],{encoding:'utf8'}).trim().split(/\r?\n/).map(f=>f.replaceAll('\\','/')))
  if(!before[f]&&!allowed.has(f))throw Error(`Unexpected new file: ${f}`);
execFileSync('git',['diff','--check','--',...changedFiles]);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const reports=[['frontend',`${dir}/web-final.json`],['browser-after',`${dir}/after/artwork-browser-final.json`]];
const results=reports.map(([name,file])=>{
  const r=read(file),tests=r.testResults.flatMap(f=>f.assertionResults);
  if(!r.success||r.numFailedTests||r.numFailedTestSuites||r.numPendingTests||tests.length!==r.numTotalTests||tests.some(t=>t.status!=='passed'))throw Error(`Incomplete final report: ${name}`);
  return {name,passed:tests.length,failed:0,pending:0};
});
if(results[0].passed!==338||results[1].passed!==1)throw Error('Frontend/browser inventory incomplete');
const evidence=read(`${dir}/after/browser-evidence.json`);
if(evidence.executeRequests!==0||evidence.collections!==0||evidence.liveCustomerDataUsed||evidence.errors.length)throw Error('Unsafe or incomplete browser evidence');
if(evidence.selected.border!==evidence.unselected.border||evidence.hovered.shadow==='none'||evidence.focus.shadow!=='none'||evidence.focus.outlineWidth!=='2px'||evidence.reduced.transition!=='0s'||evidence.continueStyle.width>=180||Math.abs(evidence.continueStyle.left-evidence.continueStyle.summaryLeft)>2)throw Error('Visual acceptance checks failed');
const screenshots=['01-unselected','02-selected','03-hovered','04-selected-summary','05-logo-prompt','06-mobile-cards-summary'];
for(const phase of ['before','after'])for(const name of screenshots){
  const png=fs.readFileSync(`${dir}/${phase}/${name}.png`);
  if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.length<1000)throw Error('Missing screenshot: '+name);
}
const diagnostics=file=>fs.readFileSync(file,'utf8').split(/\r?\n/).filter(l=>/error TS\d+/.test(l)).map(l=>l.replace(/\(\d+,\d+\)/,'')).sort();
const oldDiagnostics=diagnostics('previews/copilot/swag-timeline/typecheck.txt'),current=diagnostics(`${dir}/typecheck.txt`);
if(JSON.stringify(oldDiagnostics)!==JSON.stringify(current))throw Error('TypeScript diagnostic set changed');
const summary={status:'Focused frontend polish verified with isolated fixtures and mocked AI',passed:339,failed:0,pending:0,results,
  changedFiles,preservedExistingFiles:Object.keys(before).length-edited.length,modifiedExistingFiles:edited.length,newApplicationTestFiles:changedFiles.filter(f=>!before[f]).length,
  backendSourceUnchanged:true,existingTypeScriptDiagnostics:current.length,newTypeScriptDiagnostics:0,browserExecuteRequests:0,browserCollections:0,
  browserWidths:[1440,390,320],screenshots};
fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));
