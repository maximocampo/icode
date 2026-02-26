'use strict';

const fs = require('fs');
const path = require('path');
const registry = require('./registry');
const tar = require('./tar');

const BATCH_SIZE = 4;

/**
 * Install resolved packages into node_modules.
 */
async function installResolved(resolved, cwd, emit, signal) {
  const nmDir = path.join(cwd, 'node_modules');
  const binDir = path.join(nmDir, '.bin');
  fs.mkdirSync(nmDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  const packages = Array.from(resolved.values());
  const total = packages.length;
  let installed = 0;

  for (let i = 0; i < packages.length; i += BATCH_SIZE) {
    if (signal && signal.aborted) throw new Error('Installation cancelled');

    const batch = packages.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (pkg) => {
      try {
        const dest = pkgDir(nmDir, pkg.name);

        // Skip if already installed at correct version
        if (isInstalled(dest, pkg.version)) {
          installed++;
          emit.stdout(`\r  ${installed}/${total} ${pkg.name} (cached)`);
          return;
        }

        // Download tarball
        const tarball = await registry.downloadTarball(pkg.tarball);

        // Clean destination and extract
        if (fs.existsSync(dest)) {
          fs.rmSync(dest, { recursive: true, force: true });
        }
        fs.mkdirSync(dest, { recursive: true });
        await tar.extract(tarball, dest);

        // Link bins
        if (pkg.bin) linkBins(pkg.name, pkg.bin, dest, binDir);

        installed++;
        emit.stdout(`\r  ${installed}/${total} ${pkg.name}@${pkg.version}`);
      } catch (err) {
        emit.stderr(`\nFailed: ${pkg.name}@${pkg.version}: ${err.message}\n`);
      }
    }));
  }
  emit.stdout('\n');
}

function pkgDir(nmDir, name) {
  if (name.startsWith('@')) {
    const [scope, pkg] = name.split('/');
    const scopeDir = path.join(nmDir, scope);
    fs.mkdirSync(scopeDir, { recursive: true });
    return path.join(scopeDir, pkg);
  }
  return path.join(nmDir, name);
}

function isInstalled(dest, version) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
    return pkg.version === version;
  } catch {
    return false;
  }
}

/**
 * Create bin stubs as JS files (not shell scripts) for iOS compatibility.
 */
function linkBins(packageName, bin, packageDir, binDir) {
  const entries = typeof bin === 'string'
    ? { [packageName.split('/').pop()]: bin }
    : bin;

  for (const [name, binPath] of Object.entries(entries)) {
    const target = path.resolve(packageDir, binPath);
    const stub = path.join(binDir, name);
    const content = `#!/usr/bin/env node\nrequire('${target.replace(/\\/g, '/')}');\n`;
    try { fs.writeFileSync(stub, content, { mode: 0o755 }); } catch {}
  }
}

function removePackage(name, cwd) {
  const nmDir = path.join(cwd, 'node_modules');
  const dest = pkgDir(nmDir, name);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });

  // Remove bin stubs that reference this package
  const binDir = path.join(nmDir, '.bin');
  if (fs.existsSync(binDir)) {
    for (const entry of fs.readdirSync(binDir)) {
      try {
        const content = fs.readFileSync(path.join(binDir, entry), 'utf8');
        if (content.includes(name)) fs.unlinkSync(path.join(binDir, entry));
      } catch {}
    }
  }
}

module.exports = { installResolved, removePackage };
