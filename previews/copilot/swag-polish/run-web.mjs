import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const files = JSON.parse(fs.readFileSync('previews/copilot/swag-timeline/web-final.json','utf8')).testResults.map(f => f.name.replaceAll('\\','/').split('/apps/web/')[1]);
const dir=path.resolve('previews/copilot/swag-polish');
if(fs.existsSync(path.join(dir,'web-final.json'))) fs.renameSync(path.join(dir,'web-final.json'),path.join(dir,`web-final.attempt-${Date.now()}.json`));
const log=fs.openSync(path.join(dir,'web-final.log'),'w');
const result=spawnSync(process.execPath,['../../node_modules/vitest/vitest.mjs','run',...files,'src/features/copilot/CopilotSwagPolish.test.tsx','--pool=threads','--maxWorkers=1','--reporter=json',`--outputFile=${path.join(dir,'web-final.json')}`],{cwd:path.resolve('apps/web'),env:{...process.env,GOMAXPROCS:'2',GOMEMLIMIT:'2GiB'},stdio:['ignore',log,log],windowsHide:true});
fs.closeSync(log);process.exitCode=result.status ?? 1;
