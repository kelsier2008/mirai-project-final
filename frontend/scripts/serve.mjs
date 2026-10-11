#!/usr/bin/env node
// Serves built portals locally the way Cloudflare Pages would: static files plus the
// headers from each build's _headers file (including the Content-Security-Policy), and
// index.html for paths without a file extension. For checking builds, not for production.
//
//   node frontend/scripts/serve.mjs --all [--host 127.0.0.1]
//       every built portal on its own port (its own browser origin, like separate
//       Pages projects): super-admin 5501, campus-manager 5502, advisor 5503,
//       coordinator 5504, student 5505
//   node frontend/scripts/serve.mjs <build-folder> [--port 5501] [--host 127.0.0.1]
//
// Build first, for example: node frontend/scripts/build-portal.mjs student --api-base-url http://127.0.0.1:8000
import {createServer} from 'node:http';
import {existsSync, statSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {PORTALS} = await import(pathToFileURL(path.join(FRONTEND, 'shared', 'config', 'portals.js')).href);
export const PREVIEW_PORTS = Object.freeze(Object.fromEntries(PORTALS.map((p, i) => [p.id, 5501 + i])));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

// The subset of the Pages _headers format the builds use: a path pattern (with *) on its
// own line, followed by indented "Name: value" lines.
export function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      const pattern = new RegExp('^' + line.trim().split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      current = {pattern, headers: []};
      rules.push(current);
    } else if (current) {
      const i = line.indexOf(':');
      if (i > 0) current.headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}

export async function startServer(root, {port, host = '127.0.0.1'}) {
  root = path.resolve(root);
  if (!existsSync(path.join(root, 'index.html'))) throw new Error(`${root} has no index.html. Build the portal first.`);
  const headersPath = path.join(root, '_headers');
  const rules = existsSync(headersPath) ? parseHeaders(await readFile(headersPath, 'utf8')) : [];
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = path.resolve(root, '.' + urlPath);
      if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(400).end(); return; }
      if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!existsSync(file)) {
        if (path.extname(urlPath)) { res.writeHead(404, {'content-type': 'text/plain'}).end('Not found'); return; }
        file = path.join(root, 'index.html');
      }
      if (path.basename(file) === '_headers') { res.writeHead(404).end(); return; }
      const headers = {'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store'};
      for (const rule of rules) if (rule.pattern.test(urlPath)) for (const [k, v] of rule.headers) headers[k.toLowerCase()] = v;
      res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch (e) {
      res.writeHead(500, {'content-type': 'text/plain'}).end(String(e.message || e));
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return server;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const host = flag('--host') || '127.0.0.1';
  try {
    if (args.includes('--all')) {
      for (const p of PORTALS) {
        const dir = path.join(FRONTEND, 'apps', p.id, 'dist');
        if (!existsSync(dir)) { console.log(`skip ${p.id}: not built (${path.relative(process.cwd(), dir)})`); continue; }
        await startServer(dir, {port: PREVIEW_PORTS[p.id], host});
        console.log(`${p.title.padEnd(22)} http://${host}:${PREVIEW_PORTS[p.id]}/`);
      }
    } else {
      const dir = args.find(a => !a.startsWith('--') && a !== flag('--port') && a !== flag('--host'));
      if (!dir) throw new Error('Usage: node frontend/scripts/serve.mjs <build-folder> [--port N] | --all');
      const port = Number(flag('--port') || 5501);
      await startServer(dir, {port, host});
      console.log(`Serving ${dir} at http://${host}:${port}/`);
    }
  } catch (e) {
    console.error(`serve: ${e.message || e}`);
    process.exit(1);
  }
}
