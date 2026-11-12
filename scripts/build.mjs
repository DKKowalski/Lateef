import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = new URL('../site/', import.meta.url);
const output = new URL('../dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(source, output, { recursive: true, errorOnExist: true });
const redirect = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0; url=../">
    <meta name="robots" content="noindex">
    <title>Lateef</title>
    <link rel="canonical" href="../">
  </head>
  <body>
    <p><a href="../">Open the Lateef website →</a></p>
  </body>
</html>
`;
await mkdir(new URL("site/", output), { recursive: true });
await writeFile(new URL("site/index.html", output), redirect);
console.log(`Built static site: ${fileURLToPath(output)}`);
