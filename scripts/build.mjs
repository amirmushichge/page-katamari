import {copyFileSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const version=JSON.parse(readFileSync(resolve(root,'extension/manifest.json'),'utf8')).version;
mkdirSync(resolve(root,'docs/assets'),{recursive:true});
for(const [from,to] of [['extension/content.js','docs/assets/katamari.js'],['extension/overlay.css','docs/assets/overlay.css'],['extension/assets/Manrope-VariableFont_wght.ttf','docs/assets/Manrope-VariableFont_wght.ttf'],['extension/assets/OFL.txt','docs/assets/OFL.txt']])copyFileSync(resolve(root,from),resolve(root,to));
// Small deterministic ZIP writer. Stored entries keep packaging dependency-free.
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=buf=>{let crc=0xffffffff;for(const n of buf)crc=crcTable[(crc^n)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};
function list(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?list(resolve(dir,e.name)):[resolve(dir,e.name)]);}
const entries=list(resolve(root,'extension')).sort().map(path=>({name:'page-katamari/'+relative(resolve(root,'extension'),path).replaceAll('\\','/'),data:/\.(?:js|css|json|html|md|txt)$/i.test(path)?Buffer.from(readFileSync(path,'utf8').replaceAll('\r\n','\n')):readFileSync(path)}));
entries.push({name:'page-katamari/LICENSE',data:Buffer.from(readFileSync(resolve(root,'LICENSE'),'utf8').replaceAll('\r\n','\n'))});
const parts=[],directory=[];let offset=0;
for(const {name,data} of entries){const n=Buffer.from(name);const crc=crc32(data);const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(33,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(n.length,26);parts.push(h,n,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(33,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);directory.push(c,n);offset+=h.length+n.length+data.length;}
const central=Buffer.concat(directory);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);
const zip=Buffer.concat([...parts,central,end]);
mkdirSync(resolve(root,'docs/downloads'),{recursive:true});
const filename=`page-katamari-v${version}.zip`;
writeFileSync(resolve(root,'docs/downloads',filename),zip);
writeFileSync(resolve(root,'docs/downloads/SHA256SUMS.txt'),`${createHash('sha256').update(zip).digest('hex')}  ${filename}\n`);
writeFileSync(resolve(root,'docs/.nojekyll'),'');
console.log(`Built demo and ${filename} (${zip.length} bytes).`);
