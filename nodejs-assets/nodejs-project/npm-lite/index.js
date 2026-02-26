'use strict';

const fs = require('fs');
const path = require('path');
const resolver = require('./resolver');
const installer = require('./installer');

/**
 * npm install [packages...]
 */
async function install(cwd, emit, signal, opts) {
  opts = opts || {};

  // npm install <specific packages>
  if (opts.packages && opts.packages.length > 0) {
    return installSpecific(opts.packages, cwd, emit, signal, opts);
  }

  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    emit.stderr('npm-lite ERR! No package.json found in ' + cwd + '\n');
    emit.stderr('Run "npm init" first.\n');
    return 1;
  }

  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); }
  catch (e) { emit.stderr(`npm-lite ERR! Invalid package.json: ${e.message}\n`); return 1; }

  const deps = pkg.dependencies || {};
  const devDeps = opts.production ? {} : (pkg.devDependencies || {});
  const all = { ...deps, ...devDeps };

  if (Object.keys(all).length === 0) {
    emit.stdout('No dependencies to install.\n');
    return 0;
  }

  emit.stdout(`Found ${Object.keys(all).length} dependencies\n`);

  try {
    const t0 = Date.now();
    const resolved = await resolver.resolve(pkg, { production: opts.production }, emit);
    emit.stdout(`Resolved ${resolved.size} packages (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);

    emit.stdout('Downloading and extracting...\n');
    await installer.installResolved(resolved, cwd, emit, signal);

    writeLockfile(resolved, cwd);
    emit.stdout(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
    return 0;
  } catch (err) {
    if (err.message === 'Installation cancelled') {
      emit.stderr('\nCancelled.\n');
      return 130;
    }
    emit.stderr(`\nnpm-lite ERR! ${err.message}\n`);
    return 1;
  }
}

async function installSpecific(packageNames, cwd, emit, signal, opts) {
  const pkgPath = path.join(cwd, 'package.json');
  let pkg = { name: path.basename(cwd), version: '1.0.0', dependencies: {} };
  if (fs.existsSync(pkgPath)) {
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch {}
  }

  emit.stdout(`Resolving ${packageNames.join(', ')}...\n`);

  try {
    const { resolved, newDeps } = await resolver.resolvePackages(packageNames, cwd, emit);
    if (resolved.size === 0) { emit.stderr('No packages resolved.\n'); return 1; }

    emit.stdout(`Resolved ${resolved.size} packages\nDownloading...\n`);
    await installer.installResolved(resolved, cwd, emit, signal);

    // Update package.json
    const key = opts.saveDev ? 'devDependencies' : 'dependencies';
    if (!pkg[key]) pkg[key] = {};
    Object.assign(pkg[key], newDeps);
    pkg[key] = sortObj(pkg[key]);
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    emit.stdout('Updated package.json\n');

    writeLockfile(resolved, cwd);
    return 0;
  } catch (err) {
    emit.stderr(`npm-lite ERR! ${err.message}\n`);
    return 1;
  }
}

/**
 * npm run <script>
 */
async function runScript(scriptName, args, cwd, emit, signal) {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    emit.stderr('npm-lite ERR! No package.json found\n');
    return 1;
  }

  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); }
  catch (e) { emit.stderr(`npm-lite ERR! Invalid package.json\n`); return 1; }

  if (!scriptName) {
    const scripts = pkg.scripts || {};
    if (Object.keys(scripts).length === 0) {
      emit.stdout('No scripts defined.\n');
    } else {
      emit.stdout('Available scripts:\n');
      for (const [n, c] of Object.entries(scripts)) emit.stdout(`  ${n}: ${c}\n`);
    }
    return 0;
  }

  const scripts = pkg.scripts || {};
  let script = scripts[scriptName];

  if (!script) {
    if (scriptName === 'start') {
      if (fs.existsSync(path.join(cwd, 'server.js'))) script = 'node server.js';
      else if (fs.existsSync(path.join(cwd, 'index.js'))) script = 'node index.js';
      else {
        // Default: run built-in dev server
        emit.stdout(`> Starting dev server...\n\n`);
        const devServer = require('../dev-server');
        return devServer.start(cwd, emit, signal);
      }
    }
    if (!script) {
      emit.stderr(`Missing script: "${scriptName}"\n`);
      emit.stderr(`Available: ${Object.keys(scripts).join(', ') || '(none)'}\n`);
      return 1;
    }
  }

  emit.stdout(`> ${pkg.name || 'project'}@${pkg.version || '0.0.0'} ${scriptName}\n`);
  emit.stdout(`> ${script}\n\n`);

  return executeScriptString(script, args || [], cwd, emit, signal);
}

async function executeScriptString(script, extraArgs, cwd, emit, signal) {
  // Handle && chaining
  const parts = script.split('&&').map(s => s.trim());
  for (const part of parts) {
    if (signal && signal.aborted) return 130;
    const code = await executeSingle(part, extraArgs, cwd, emit, signal);
    if (code !== 0) return code;
    extraArgs = []; // only pass extra args to last command
  }
  return 0;
}

async function executeSingle(cmdStr, extraArgs, cwd, emit, signal) {
  const scriptRunner = require('../script-runner');

  // Parse env vars: KEY=VALUE command args
  const tokens = tokenize(cmdStr);
  const envVars = {};
  let start = 0;
  for (let i = 0; i < tokens.length; i++) {
    const m = tokens[i].match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) { envVars[m[1]] = m[2]; start = i + 1; }
    else break;
  }

  const cmd = tokens[start];
  const args = [...tokens.slice(start + 1), ...extraArgs];
  if (!cmd) return 0;

  // Apply env vars
  const saved = {};
  for (const [k, v] of Object.entries(envVars)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }

  try {
    if (cmd === 'node') return await scriptRunner.runFile(args, cwd, emit, signal);

    // Check node_modules/.bin
    const binPath = path.join(cwd, 'node_modules', '.bin', cmd);
    if (fs.existsSync(binPath)) return await scriptRunner.runBin(cmd, args, cwd, emit, signal);

    // Shell builtins
    const shellCommands = require('../shell-commands');
    const builtins = ['ls', 'pwd', 'cat', 'mkdir', 'rm', 'echo', 'cp', 'mv', 'touch', 'which', 'env', 'head', 'tail', 'find', 'clear', 'true', 'false'];
    if (builtins.includes(cmd)) return shellCommands.run(cmd, args, cwd, emit);

    emit.stderr(`command not found: ${cmd}\n`);
    return 127;
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function tokenize(str) {
  const tokens = [];
  let cur = '', inSingle = false, inDouble = false, escaped = false;
  for (const ch of str) {
    if (escaped) { cur += ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if ((ch === ' ' || ch === '\t') && !inSingle && !inDouble) {
      if (cur) { tokens.push(cur); cur = ''; }
      continue;
    }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function init(cwd, emit, args) {
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) { emit.stderr('package.json already exists\n'); return 1; }

  const name = path.basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const pkg = {
    name,
    version: '1.0.0',
    description: '',
    main: 'index.js',
    scripts: { test: 'echo "Error: no test specified"', start: 'node index.js' },
    keywords: [],
    license: 'ISC',
  };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  emit.stdout(`Created package.json\n${JSON.stringify(pkg, null, 2)}\n`);
  return 0;
}

function list(cwd, emit) {
  const nmDir = path.join(cwd, 'node_modules');
  if (!fs.existsSync(nmDir)) { emit.stdout('(empty)\n'); return 0; }

  let pkg = {};
  try { pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')); } catch {}
  emit.stdout(`${pkg.name || 'project'}@${pkg.version || '0.0.0'} ${cwd}\n`);

  for (const entry of fs.readdirSync(nmDir).sort()) {
    if (entry.startsWith('.')) continue;
    if (entry.startsWith('@')) {
      const scopeDir = path.join(nmDir, entry);
      for (const se of fs.readdirSync(scopeDir).sort()) {
        const v = readVersion(path.join(scopeDir, se));
        emit.stdout(`  ${entry}/${se}@${v}\n`);
      }
    } else {
      emit.stdout(`  ${entry}@${readVersion(path.join(nmDir, entry))}\n`);
    }
  }
  return 0;
}

function uninstall(packages, cwd, emit) {
  if (packages.length === 0) { emit.stderr('Provide package name(s)\n'); return 1; }

  const pkgPath = path.join(cwd, 'package.json');
  let pkg = {};
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch {}

  for (const name of packages) {
    installer.removePackage(name, cwd);
    emit.stdout(`Removed ${name}\n`);
    if (pkg.dependencies) delete pkg.dependencies[name];
    if (pkg.devDependencies) delete pkg.devDependencies[name];
  }

  if (fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }
  return 0;
}

function readVersion(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version; }
  catch { return '?'; }
}

function writeLockfile(resolved, cwd) {
  const lock = { lockfileVersion: 1, dependencies: {} };
  for (const [name, pkg] of resolved) {
    lock.dependencies[name] = {
      version: pkg.version,
      resolved: pkg.tarball,
      integrity: pkg.integrity,
      requires: pkg.dependencies,
    };
  }
  fs.writeFileSync(path.join(cwd, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
}

function sortObj(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

module.exports = { install, runScript, init, list, uninstall };
