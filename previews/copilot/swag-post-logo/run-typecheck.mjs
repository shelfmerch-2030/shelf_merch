import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const log = fs.openSync('previews/copilot/swag-post-logo/typecheck.txt','w');
const result = spawnSync(process.execPath,['node_modules/typescript/bin/tsc','--noEmit'],{cwd:path.resolve('apps/web'),env:{...process.env,GOMAXPROCS:'2',GOMEMLIMIT:'2GiB'},stdio:['ignore',log,log],windowsHide:true});
fs.closeSync(log);process.exitCode=result.status ?? 1;
