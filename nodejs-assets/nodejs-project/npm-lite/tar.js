'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/**
 * Extract a .tgz buffer to a destination directory.
 * npm tarballs contain a top-level `package/` directory which is stripped.
 */
async function extract(tgzBuffer, destDir) {
  const tarBuffer = await new Promise((resolve, reject) => {
    zlib.gunzip(tgzBuffer, (err, result) => err ? reject(err) : resolve(result));
  });

  let offset = 0;
  let paxPath = null;
  let gnuLongName = null;

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.slice(offset, offset + 512);
    if (isZeroBlock(header)) break;

    let name = readString(header, 0, 100);
    const size = readSize(header, 124, 12);
    const typeFlag = String.fromCharCode(header[156]);
    const linkname = readString(header, 157, 100);
    const prefix = readString(header, 345, 155);

    offset += 512;

    // PAX extended header
    if (typeFlag === 'x' || typeFlag === 'X') {
      const paxData = tarBuffer.slice(offset, offset + size).toString('utf8');
      const pathMatch = paxData.match(/\d+ path=(.+)\n/);
      if (pathMatch) paxPath = pathMatch[1];
      offset += padTo512(size);
      continue;
    }

    // Global PAX header — skip
    if (typeFlag === 'g') {
      offset += padTo512(size);
      continue;
    }

    // GNU long name
    if (typeFlag === 'L') {
      gnuLongName = tarBuffer.slice(offset, offset + size).toString('utf8').replace(/\0+$/, '');
      offset += padTo512(size);
      continue;
    }

    // Apply extended name if present
    if (paxPath) { name = paxPath; paxPath = null; }
    else if (gnuLongName) { name = gnuLongName; gnuLongName = null; }
    else if (prefix) { name = prefix + '/' + name; }

    // Strip the leading directory (usually "package/")
    const slashIdx = name.indexOf('/');
    const relativePath = slashIdx >= 0 ? name.slice(slashIdx + 1) : name;

    if (!relativePath || relativePath === '.' || relativePath === './') {
      offset += padTo512(size);
      continue;
    }

    // Security: prevent path traversal
    if (relativePath.includes('..')) {
      offset += padTo512(size);
      continue;
    }

    const fullPath = path.join(destDir, relativePath);

    if (typeFlag === '5' || name.endsWith('/')) {
      // Directory
      fs.mkdirSync(fullPath, { recursive: true });
    } else if (typeFlag === '2') {
      // Symlink
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      try { fs.symlinkSync(linkname, fullPath); } catch {}
    } else if (typeFlag === '0' || typeFlag === '\0' || typeFlag === '') {
      // Regular file
      if (size > 0) {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        const data = Buffer.alloc(size);
        tarBuffer.copy(data, 0, offset, offset + size);
        fs.writeFileSync(fullPath, data);
      } else if (relativePath) {
        // Empty file
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, '');
      }
    }

    offset += padTo512(size);
  }
}

function readString(buf, offset, length) {
  let end = offset;
  while (end < offset + length && buf[end] !== 0) end++;
  return buf.slice(offset, end).toString('utf8');
}

function readSize(buf, offset, length) {
  // Check for base-256 encoding (high bit set)
  if (buf[offset] & 0x80) {
    let val = 0;
    for (let i = offset + 1; i < offset + length; i++) {
      val = val * 256 + buf[i];
    }
    return val;
  }
  const str = readString(buf, offset, length).trim();
  return str ? parseInt(str, 8) || 0 : 0;
}

function isZeroBlock(buf) {
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] !== 0) return false;
  }
  return true;
}

function padTo512(size) {
  return size > 0 ? Math.ceil(size / 512) * 512 : 0;
}

module.exports = { extract };
