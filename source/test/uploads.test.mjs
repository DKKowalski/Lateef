import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { readUploads, MAX_UPLOAD_BYTES } from '../src/uploads.mjs';
test('uploads read exact regular-file bytes, reject oversize/count/relative paths, and directories; symlinks resolve to their target', async t => {
 const dir=await mkdtemp(join(tmpdir(),'lateef-upload-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const path=join(dir,'example.pdf');await writeFile(path,Buffer.from('%PDF-1.4\nfixture\n'));
 const [file]=await readUploads([path]);assert.equal(file.name,'example.pdf');assert.equal(file.type,'application/pdf');assert.equal(Buffer.from(file.data,'base64').toString(),'%PDF-1.4\nfixture\n');
 await assert.rejects(readUploads(['relative.pdf']),/absolute/);await assert.rejects(readUploads([]));await assert.rejects(readUploads([dir]),/regular/);
 await writeFile(join(dir,'large'),Buffer.alloc(MAX_UPLOAD_BYTES+1));await assert.rejects(readUploads([join(dir,'large')]),/25 MiB/);
 if(process.platform!=='win32'){await symlink(path,join(dir,'link'));assert.equal((await readUploads([join(dir,'link')]))[0].name,'example.pdf');}
});
test('uploads deny hidden paths and symlinks into them, and honour LATEEF_UPLOAD_ROOTS', async t => {
 const dir=await realpath(await mkdtemp(join(tmpdir(),'lateef-upload-')));t.after(()=>rm(dir,{recursive:true,force:true}));
 const saved=process.env.LATEEF_UPLOAD_ROOTS;t.after(()=>{if(saved===undefined)delete process.env.LATEEF_UPLOAD_ROOTS;else process.env.LATEEF_UPLOAD_ROOTS=saved;});delete process.env.LATEEF_UPLOAD_ROOTS;
 await mkdir(join(dir,'.secret'));await writeFile(join(dir,'.secret','key.txt'),'k');await writeFile(join(dir,'.dot.txt'),'k');await writeFile(join(dir,'ok.txt'),'ok');
 assert.equal((await readUploads([join(dir,'ok.txt')]))[0].name,'ok.txt');
 await assert.rejects(readUploads([join(dir,'.secret','key.txt')]),/hidden/);await assert.rejects(readUploads([join(dir,'.dot.txt')]),/hidden/);
 if(process.platform!=='win32'){await symlink(join(dir,'.secret'),join(dir,'via'));await assert.rejects(readUploads([join(dir,'via','key.txt')]),/hidden/);}
 const root=join(dir,'allowed'),other=join(dir,'other');await mkdir(join(root,'.ok'),{recursive:true});await mkdir(other);
 await writeFile(join(root,'.ok','a.txt'),'a');await writeFile(join(other,'b.txt'),'b');
 process.env.LATEEF_UPLOAD_ROOTS=[root,join(dir,'missing')].join(delimiter);
 assert.equal((await readUploads([join(root,'.ok','a.txt')]))[0].name,'a.txt');
 await assert.rejects(readUploads([join(other,'b.txt')]),/LATEEF_UPLOAD_ROOTS/);
});
