import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>readFileSync(resolve(root,p),'utf8');
const manifest=JSON.parse(read('extension/manifest.json'));
assert.deepEqual([...manifest.permissions].sort(),['activeTab','scripting']);
assert.equal(manifest.manifest_version,3);
assert.equal(manifest.host_permissions,undefined);
assert.equal(manifest.content_scripts,undefined);
assert.equal(manifest.version,JSON.parse(read('package.json')).version);
for(const p of ['background.js','popup.js','content.js']){const r=spawnSync(process.execPath,['--check',resolve(root,'extension',p)],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
for(const p of ['docs/site.js','tests/browser.js','tests/extension.test.mjs']){const r=spawnSync(process.execPath,['--check',resolve(root,p)],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
for(const [a,b] of [['extension/content.js','docs/assets/katamari.js'],['extension/overlay.css','docs/assets/overlay.css'],['extension/assets/Manrope-VariableFont_wght.ttf','docs/assets/Manrope-VariableFont_wght.ttf']])assert.equal(readFileSync(resolve(root,a)).compare(readFileSync(resolve(root,b))),0,`${b} is stale; run build`);
for(const p of Object.values(manifest.icons))assert.ok(existsSync(resolve(root,'extension',p)),p);
for(const p of ['README.md','AGENTS.md','CLAUDE.md','LICENSE','PRIVACY.md','CHANGELOG.md','extension/assets/OFL.txt','docs/assets/OFL.txt','docs/.nojekyll'])assert.ok(existsSync(resolve(root,p)),p);
const html=read('docs/index.html');
for(const [,url] of html.matchAll(/(?:href|src)="([^"]+)"/g)){
  if(/^(https?:|#)/.test(url))continue;
  assert.ok(existsSync(resolve(root,'docs',url)),`Missing site asset ${url}`);
}
assert.ok(html.includes(`v${manifest.version}`));
assert.ok(!/(?:localhost|127\.0\.0\.1|C:\\Users|placeholder|TODO)/.test(html));
const zip=`page-katamari-v${manifest.version}.zip`;
const digest=createHash('sha256').update(readFileSync(resolve(root,'docs/downloads',zip))).digest('hex');
assert.equal(read('docs/downloads/SHA256SUMS.txt'),`${digest}  ${zip}\n`);
assert.equal(readdirSync(resolve(root,'docs/downloads')).filter(x=>x.endsWith('.zip')).length,1);
const integration=spawnSync(process.execPath,[resolve(root,'tests/extension.test.mjs')],{encoding:'utf8'});
assert.equal(integration.status,0,integration.stderr||integration.stdout);
console.log(integration.stdout.trim());
console.log('Source, permissions, synchronized core, local assets and release checksum checks passed.');
