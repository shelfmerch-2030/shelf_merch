import fs from 'node:fs';
import crypto from 'node:crypto';
const target='apps/api/.env',executable='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if(!fs.existsSync(executable))throw Error('Expected installed local renderer browser is missing');
const source=fs.readFileSync(target),content=source.toString('utf8');
if(/^\s*SWAG_RENDERER_EXECUTABLE\s*=/m.test(content))throw Error('An existing renderer configuration must not be overwritten');
const hash=crypto.createHash('sha256').update(source).digest('hex');
// Only this non-secret opt-in setting is appended; every original byte remains.
const ending=content.includes('\r\n')?'\r\n':'\n';
fs.appendFileSync(target,`${content.endsWith('\n')?'':ending}SWAG_RENDERER_EXECUTABLE="${executable}"${ending}`);
const after=fs.readFileSync(target);if(!after.subarray(0,source.length).equals(source))throw Error('Existing configuration bytes changed');
fs.writeFileSync('previews/copilot/swag-post-logo/local-renderer-config.json',JSON.stringify({file:target,setting:'SWAG_RENDERER_EXECUTABLE',executable,originalBytesPreserved:true,originalBytes:source.length,beforeHash:hash,localOnly:true,restartRequired:true},null,2));
console.log('Appended the installed Edge renderer path to local API configuration; all original configuration bytes preserved. API restart required.');
