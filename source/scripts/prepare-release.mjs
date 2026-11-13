// Local review export only. No publishing, registry writes, or client reconfiguration.
import { cp, mkdir, readdir, readFile, writeFile, utimes, stat, chmod, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fullManifest } from '../src/install.mjs';
const exec = promisify(execFile);
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
// A fresh run directory avoids overwriting a review the user may have opened.
const output=join(root,'artifacts','review',`${pkg.name}-${pkg.version}-${Date.now()}`);
const source=join(output,'source');await mkdir(source,{recursive:true});
const allow=['package.json','package-lock.json','.gitignore','README.md','LICENSE','PRIVACY.md','SECURITY.md','CONTRIBUTING.md','CHANGELOG.md','MOTION_GUIDE.md','AGENTS.md','bin','src','extension','test','brand','.github','site'];
for(const file of allow) await cp(join(root,file),join(source,file),{recursive:true,filter:path=>!path.split(/[\\/]/).includes('downloads')});
await mkdir(join(source,'scripts'));await cp(fileURLToPath(import.meta.url),join(source,'scripts','prepare-release.mjs'));
await cp(join(root,'scripts','check-site.mjs'),join(source,'scripts','check-site.mjs')); 
async function files(dir){const all=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())all.push(...await files(path));else all.push(path);}return all.sort();}
const included=await files(source);
const privatePattern = new RegExp(homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|[A-Z0-9._%+-]+@(?:gmail|outlook)\\.com|\\b[0-9]{10}\\b', 'i');
for(const path of included){if(/\.(md|json|mjs|js|html|css|yml|svg|txt)$/.test(path)&&privatePattern.test(await readFile(path,'utf8')))throw Error(`Private test detail in release export: ${relative(source,path)}`);}
const epoch=new Date('2026-01-01T00:00:00Z');for(const path of included)await utimes(path,epoch,epoch);
await chmod(join(source,'bin','lateef.mjs'),0o755);
await exec('zip',['-X','-q',join(output,'lateef-source.zip'),...included.map(p=>relative(source,p))],{cwd:source});
const extfiles=await files(join(source,'extension'));
await exec('zip',['-X','-q',join(output,'lateef-extension.zip'),...extfiles.map(p=>relative(join(source,'extension'),p))],{cwd:join(source,'extension')});
// The full control build: the same extension with the debugger permission and its own name.
const fullDir=join(output,'extension-full');await cp(join(source,'extension'),fullDir,{recursive:true});
await writeFile(join(fullDir,'manifest.json'),JSON.stringify(fullManifest(JSON.parse(await readFile(join(fullDir,'manifest.json'),'utf8'))),null,2)+'\n');
await exec('zip',['-X','-q',join(output,'lateef-full-control-extension.zip'),...extfiles.map(p=>relative(join(source,'extension'),p))],{cwd:fullDir});
const pack=JSON.parse((await exec('npm',['pack','--ignore-scripts','--json','--pack-destination',output],{cwd:source,maxBuffer:1_000_000})).stdout)[0];
for(const file of pack.files)if(/node_modules|state\.json|artifacts|real-profile|real-world/.test(file.path))throw Error('Unexpected npm payload: '+file.path);
const downloads=join(root,'site','dist','downloads');await mkdir(downloads,{recursive:true});
for(const name of await readdir(downloads))if(name.endsWith('.tgz')&&name!==pack.filename)await rm(join(downloads,name));
for(const name of ['lateef-source.zip','lateef-extension.zip','lateef-full-control-extension.zip',pack.filename])await cp(join(output,name),join(downloads,name));
// Website bundle contains functional downloads, separate from the source archive.
await cp(join(root,'site','dist'),join(output,'website'),{recursive:true,filter:p=>!p.includes('/downloads/')||basename(p).startsWith('lateef')});
const sums=[];for(const name of ['lateef-source.zip','lateef-extension.zip','lateef-full-control-extension.zip',pack.filename])sums.push(createHash('sha256').update(await readFile(join(output,name))).digest('hex')+'  '+name);
await writeFile(join(output,'SHA256SUMS'),sums.join('\n')+'\n');
// The install page links to the checksums, so they ship beside the downloads as well.
await writeFile(join(downloads,'SHA256SUMS'),[...sums].sort((x,y)=>x.slice(66).localeCompare(y.slice(66))).join('\n')+'\n');
await writeFile(join(output,'release-report.json'),JSON.stringify({name:pkg.name,version:pkg.version,status:'local-review-only',sourceFiles:included.map(p=>relative(source,p)),npmFiles:pack.files.map(f=>f.path),privacyScan:'No known private test identifiers found in allowlisted textual source. This is not a full secret audit.',artifacts:['lateef-source.zip','lateef-extension.zip','lateef-full-control-extension.zip',pack.filename,'website/','SHA256SUMS']},null,2));
await writeFile(join(root,'artifacts','review','LATEST.txt'),output+'\n');
console.log(JSON.stringify({output,status:'Prepared locally; nothing published',sourceFiles:included.length,npmFiles:pack.files.length}));
