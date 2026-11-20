import fs from 'node:fs';
const file='apps/api/src/modules/copilot/swagDesignWorkflow.js';
let source=fs.readFileSync(file,'utf8');
const replacements=[
 ['The displayed Apply action is explicit approval; EXECUTE remains UI-only.', 'A typed Yes or Apply it after upload prepares the existing artwork approval; it never executes. Only the confirmation card Apply click executes.'],
 ['When automation is unavailable keep Save Design and the existing editor. After automatic application review saved mockups and continue to stores. Looks good or publish it means advance to store selection if no store is selected; never execute from prose.', 'When automation is unavailable explain the actual limitation and offer the existing designer through a confirmed save. After automatic application show actual saved product mockups and ask whether to publish or make changes. After Looks good on branded designs ask whether to publish the entire collection or only a selected product. If full-collection intent is already clear, resolve stores and proceed directly to the verified final preview. Never execute from prose. Publishing is collection-based: for only one product, explain the separate one-product collection alternative using existing services, preserve the original collection and all other saved products, and clarify before starting it. Never remove products from the original collection or prepare full publication for a subset request.'],
];
for(const [before,after] of replacements){if(!source.includes(before))throw Error('Expected existing guidance missing');source=source.replace(before,after);}
fs.writeFileSync(file,source);
