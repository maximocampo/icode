'use strict';

const registry = require('./registry');
const semver = require('./semver');

const packumentCache = new Map();

/**
 * Resolve all dependencies for a project.
 * Returns Map<name, { name, version, tarball, integrity, dependencies, bin }>
 */
async function resolve(packageJson, opts, emit) {
  const deps = { ...(packageJson.dependencies || {}) };
  if (!opts.production) Object.assign(deps, packageJson.devDependencies || {});

  const resolved = new Map();
  const resolving = new Set();
  const total = Object.keys(deps).length;
  let count = 0;

  for (const [name, range] of Object.entries(deps)) {
    await resolveDep(name, range, resolved, resolving, emit);
    count++;
    if (emit) emit.stdout(`\rResolving... ${count}/${total}`);
  }
  if (emit) emit.stdout('\n');
  return resolved;
}

async function resolveDep(name, range, resolved, resolving, emit, depth) {
  depth = depth || 0;
  if (depth > 50) return;

  // Already resolved at a satisfying version?
  if (resolved.has(name)) {
    const existing = resolved.get(name);
    if (semver.satisfies(existing.version, range)) return;
    // Conflict — keep first version, warn
    if (emit) emit.stderr(`\nwarn: ${name}@${range} conflicts with ${name}@${existing.version}\n`);
    return;
  }

  const key = `${name}@${range}`;
  if (resolving.has(key)) return; // circular
  resolving.add(key);

  try {
    let packument = packumentCache.get(name);
    if (!packument) {
      packument = await registry.fetchPackument(name);
      packumentCache.set(name, packument);
    }

    const versions = Object.keys(packument.versions || {});
    if (versions.length === 0) {
      if (emit) emit.stderr(`\nwarn: ${name} has no versions\n`);
      return;
    }

    // Resolve tags (latest, next, etc.)
    let effectiveRange = range;
    if (packument['dist-tags'] && packument['dist-tags'][range]) {
      effectiveRange = packument['dist-tags'][range];
    }

    const bestVersion = semver.maxSatisfying(versions, effectiveRange);
    if (!bestVersion) {
      if (emit) emit.stderr(`\nwarn: No version of ${name} satisfies ${range}\n`);
      return;
    }

    const vData = packument.versions[bestVersion];
    resolved.set(name, {
      name,
      version: bestVersion,
      tarball: vData.dist?.tarball,
      integrity: vData.dist?.integrity || vData.dist?.shasum || '',
      dependencies: vData.dependencies || {},
      bin: vData.bin || null,
    });

    // Recurse sub-dependencies
    for (const [sub, subRange] of Object.entries(vData.dependencies || {})) {
      await resolveDep(sub, subRange, resolved, resolving, emit, depth + 1);
    }
  } catch (err) {
    if (emit) emit.stderr(`\nwarn: Failed to resolve ${name}@${range}: ${err.message}\n`);
  } finally {
    resolving.delete(key);
  }
}

/**
 * Resolve specific packages for `npm install <pkg>`.
 * Returns { resolved, newDeps } where newDeps is { name: "^version" }.
 */
async function resolvePackages(packageNames, cwd, emit) {
  const resolved = new Map();
  const resolving = new Set();
  const newDeps = {};

  for (const spec of packageNames) {
    let name, range;
    const atIdx = spec.lastIndexOf('@');
    if (atIdx > 0 && !spec.startsWith('@')) {
      name = spec.slice(0, atIdx);
      range = spec.slice(atIdx + 1);
    } else if (spec.startsWith('@') && spec.indexOf('@', 1) > 0) {
      const idx = spec.indexOf('@', 1);
      name = spec.slice(0, idx);
      range = spec.slice(idx + 1);
    } else {
      name = spec;
      range = 'latest';
    }

    await resolveDep(name, range, resolved, resolving, emit);
    const pkg = resolved.get(name);
    if (pkg) newDeps[name] = `^${pkg.version}`;
  }

  return { resolved, newDeps };
}

function clearCache() {
  packumentCache.clear();
}

module.exports = { resolve, resolvePackages, clearCache };
