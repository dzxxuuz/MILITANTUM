const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
};

function isInside(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function parseRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) return null;

  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

function createHandler(rootDirectory = __dirname) {
  const root = fs.realpathSync(rootDirectory);

  return async function handler(request, response) {
    const reply = (status, message, headers = {}) => {
      const body = Buffer.from(`${message}\n`);
      response.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': body.length,
        'X-Content-Type-Options': 'nosniff',
        ...headers,
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      reply(405, 'Method not allowed', { Allow: 'GET, HEAD' });
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent((request.url || '/').split(/[?#]/, 1)[0]);
    } catch {
      reply(400, 'Invalid URL');
      return;
    }

    const segments = pathname.split('/').filter(Boolean);
    if (!pathname.startsWith('/') || /[\\:\0]/.test(pathname) || segments.some(segment => segment.startsWith('.'))) {
      reply(403, 'Forbidden');
      return;
    }

    if (segments.length === 0) segments.push('index.html');
    const publicRootFile = segments.length === 1 && ['index.html', 'styles.css', 'scripts.js'].includes(segments[0]);
    const publicAsset = segments.length > 1 && ['images', 'audio'].includes(segments[0]);
    if (!publicRootFile && !publicAsset) {
      reply(404, 'Not found');
      return;
    }

    try {
      const requestedFile = path.resolve(root, ...segments);
      if (!isInside(root, requestedFile)) {
        reply(403, 'Forbidden');
        return;
      }

      const file = await fs.promises.realpath(requestedFile);
      if (!isInside(root, file) || path.relative(root, file).split(path.sep).some(segment => segment.startsWith('.'))) {
        reply(403, 'Forbidden');
        return;
      }

      const stat = await fs.promises.stat(file);
      if (!stat.isFile()) {
        reply(404, 'Not found');
        return;
      }

      const headers = {
        'Content-Type': MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
        'Last-Modified': stat.mtime.toUTCString(),
        'X-Content-Type-Options': 'nosniff',
      };
      let range;
      if (request.method === 'GET' && request.headers.range) {
        range = parseRange(request.headers.range, stat.size);
        if (!range) {
          reply(416, 'Range not satisfiable', {
            'Content-Range': `bytes */${stat.size}`,
            'Accept-Ranges': 'bytes',
          });
          return;
        }
        headers['Content-Length'] = range.end - range.start + 1;
        headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`;
      }

      response.writeHead(range ? 206 : 200, headers);
      if (request.method === 'HEAD') {
        response.end();
        return;
      }

      const stream = fs.createReadStream(file, range || {});
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') reply(404, 'Not found');
      else if (error.code === 'EACCES' || error.code === 'EPERM') reply(403, 'Forbidden');
      else reply(500, 'Unable to read file');
    }
  };
}

const handler = createHandler();
module.exports = { handler, createHandler };

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  const server = http.createServer(handler);
  server.on('error', error => {
    console.error(`Unable to start the preview: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Preview: http://127.0.0.1:${server.address().port}`);
  });
}
