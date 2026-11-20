import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const dir='previews/copilot/swag-post-logo';
const changedFiles=[
 'apps/api/src/modules/copilot/copilotChat.service.js',
 'apps/api/src/modules/copilot/copilotToolBindings.js',
 'apps/api/src/modules/copilot/swagDesignWorkflow.js',
 'apps/api/src/modules/copilot/swagTimeline.js',
 'apps/web/src/features/copilot/SwagStepMessage.tsx',
 'apps/web/src/features/copilot/useSwagConversation.ts',
 'apps/web/src/features/copilot/CopilotPage.tsx',
 'apps/web/src/features/copilot/CopilotSwagTimeline.test.tsx',
 'apps/web/src/features/copilot/CopilotSwagPostLogo.test.tsx',
 'apps/api/tests/copilot-swag-post-logo.test.js',
 'apps/api/tests/copilot-swag-post-logo.browser-check.js',
 'apps/api/tests/copilot-swag-polish.browser-check.js',
];
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const before=read(`${dir}/before.json`),allowed=new Set(changedFiles);
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const modified=[];
for(const [file,expected]of Object.entries(before)){
 if(!fs.existsSync(file))throw Error(`Original file missing: ${file}`);
 if(digest(fs.readFileSync(file))!==expected){if(!allowed.has(file))throw Error(`Unexpected modification: ${file}`);modified.push(file);}
}
const files=execFileSync('rg',['--files','apps','-g','!node_modules','-g','!dist'],{encoding:'utf8'}).trim().split(/\r?\n/).map(f=>f.replaceAll('\\','/'));
for(const file of files)if(!before[file]&&!allowed.has(file))throw Error(`Unexpected new file: ${file}`);
execFileSync('git',['diff','--check','--',...changedFiles]);
const config=read(`${dir}/local-renderer-config.json`),currentConfig=fs.readFileSync(config.file);
if(digest(currentConfig.subarray(0,config.originalBytes))!==config.beforeHash)throw Error('Original local configuration changed');
if(currentConfig.subarray(config.originalBytes).toString('utf8').trim()!==`SWAG_RENDERER_EXECUTABLE="${config.executable}"`)throw Error('Unexpected local configuration addition');
const seenFiles=new Set();
const groups=['focused','workflows','safety','bindings','renderer','web','browser','polish-browser'];
const tests=groups.map(group=>{
 const report=read(`${dir}/${group}-final.json`),assertions=report.testResults.flatMap(f=>f.assertionResults);
 if(!report.success||report.numFailedTests||report.numFailedTestSuites||report.numPendingTests||report.numPendingTestSuites||report.numTodoTests||assertions.length!==report.numTotalTests||assertions.some(t=>t.status!=='passed'))throw Error(`Failed or incomplete final report: ${group}`);
 for(const file of report.testResults){const name=file.name.replaceAll('\\','/');if(seenFiles.has(name))throw Error(`Double-counted suite: ${name}`);seenFiles.add(name);}
 return {group,passed:assertions.length,failed:0,pending:0};
});
const diagnostics=file=>fs.readFileSync(file,'utf8').split(/\r?\n/).filter(l=>/error TS\d+/.test(l)).map(l=>l.replace(/\(\d+,\d+\)/,'')).sort();
const old=diagnostics('previews/copilot/swag-polish/typecheck.txt'),now=diagnostics(`${dir}/typecheck.txt`);
if(JSON.stringify(old)!==JSON.stringify(now))throw Error('TypeScript diagnostics changed');
const browser=read(`${dir}/browser/browser-evidence.json`),polish=read(`${dir}/polish-browser/browser-evidence.json`);
if(browser.errors.length||browser.liveCustomerData!==false||browser.executeRequests!==2||browser.collections!==1||browser.listings!==2)throw Error('Browser acceptance evidence mismatch');
if(polish.errors.length||polish.executeRequests||polish.collections||polish.liveCustomerDataUsed!==false)throw Error('Polish preservation evidence mismatch');
const screenshots=['01-logo-received-desktop','02-logo-received-mobile','03-apply-confirmation','04-saved-branded-mockups','05-publishing-choice','06-single-product-guidance','07-store-options','08-final-publication-confirmation','09-published-desktop','10-published-mobile'];
for(const name of screenshots){const bytes=fs.readFileSync(`${dir}/browser/${name}.png`);if(bytes.length<1000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error(`Invalid screenshot: ${name}`);}
const summary={status:'Verified with isolated fixtures and mocked AI; local API restart required for renderer setting',passed:tests.reduce((n,r)=>n+r.passed,0),failed:0,pending:0,uniqueTestFiles:seenFiles.size,tests,
 changedFiles,additionalLocalConfiguration:config.file,modifiedExistingApplicationFiles:modified.length,newApplicationTestFiles:changedFiles.filter(f=>!before[f]).length,preservedExistingApplicationFiles:Object.keys(before).length-modified.length,
 rendererGeometryArtworkPersistenceAndFinancialSourcesUnchanged:true,existingTypeScriptErrors:now.length,newTypeScriptErrors:0,browserExecuteRequests:2,browserCollections:1,browserListings:2,liveCustomerDataUsed:false,liveClaudeTested:false,screenshots};
fs.writeFileSync(`${dir}/verification.json`,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
