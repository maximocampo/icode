'use strict';

const vm = require('vm');
const Module = require('module');
const path = require('path');
const fs = require('fs');
const util = require('util');

class ExitSignal extends Error {
  constructor(code) {
    super(`Process exited with code ${code}`);
    this.name = 'ExitSignal';
    this.exitCode = code;
  }
}

/**
 * Run a JS file in-process with proper module context.
 * args: [filename, ...scriptArgs]
 */
async function runFile(args, cwd, emit, signal) {
  if (!args[0]) { emit.stderr('Usage: node <file.js>\n'); return 1; }

  // node -e "code"
  if (args[0] === '-e' || args[0] === '--eval') {
    return runEval(args.slice(1).join(' '), cwd, emit, false);
  }
  // node -p "expression"
  if (args[0] === '-p' || args[0] === '--print') {
    return runEval(args.slice(1).join(' '), cwd, emit, true);
  }

  const filePath = path.resolve(cwd, args[0]);
  if (!fs.existsSync(filePath)) {
    emit.stderr(`Error: Cannot find module '${args[0]}'\n`);
    return 1;
  }

  // Clear require cache for user files (not node_modules in nodejs-project)
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(cwd) && !key.includes('nodejs-project')) {
      delete require.cache[key];
    }
  }

  // Save globals
  const origCwd = process.cwd;
  const origExit = process.exit;
  const origArgv = process.argv;
  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;
  const origInfo = console.info;
  const origDebug = console.debug;
  const origDir = console.dir;

  // Patch globals
  process.cwd = () => cwd;
  process.exit = (code) => { throw new ExitSignal(code || 0); };
  process.argv = ['node', filePath, ...args.slice(1)];
  console.log = (...a) => emit.stdout(fmtArgs(a) + '\n');
  console.error = (...a) => emit.stderr(fmtArgs(a) + '\n');
  console.warn = (...a) => emit.stderr(fmtArgs(a) + '\n');
  console.info = (...a) => emit.stdout(fmtArgs(a) + '\n');
  console.debug = (...a) => emit.stdout(fmtArgs(a) + '\n');
  console.dir = (obj) => emit.stdout(util.inspect(obj) + '\n');

  try {
    const mod = new Module(filePath, module);
    mod.filename = filePath;
    mod.paths = Module._nodeModulePaths(path.dirname(filePath));

    const code = fs.readFileSync(filePath, 'utf8');
    const wrapped = Module.wrap(code.replace(/^#!.*\n/, '\n')); // strip shebang
    const compiled = vm.runInThisContext(wrapped, { filename: filePath });

    const modRequire = (id) => mod.require(id);
    modRequire.resolve = (id) => Module._resolveFilename(id, mod);
    modRequire.cache = require.cache;
    modRequire.main = mod;

    compiled.call(mod.exports, mod.exports, modRequire, mod, filePath, path.dirname(filePath));

    // For long-running scripts (servers), wait for abort signal
    if (signal) {
      await new Promise((resolve) => {
        if (signal.aborted) return resolve();
        const timer = setImmediate(resolve);
        signal.addEventListener('abort', () => { clearImmediate(timer); resolve(); }, { once: true });
      });
    }

    return 0;
  } catch (err) {
    if (err instanceof ExitSignal) return err.exitCode;
    emit.stderr(formatError(err, filePath) + '\n');
    return 1;
  } finally {
    process.cwd = origCwd;
    process.exit = origExit;
    process.argv = origArgv;
    console.log = origLog;
    console.error = origError;
    console.warn = origWarn;
    console.info = origInfo;
    console.debug = origDebug;
    console.dir = origDir;
  }
}

/**
 * Run a bin command from node_modules/.bin.
 */
async function runBin(binName, args, cwd, emit, signal) {
  if (!binName) { emit.stderr('Usage: npx <command>\n'); return 1; }

  // Check node_modules/.bin
  const binPath = path.join(cwd, 'node_modules', '.bin', binName);
  if (fs.existsSync(binPath)) {
    const content = fs.readFileSync(binPath, 'utf8');

    // Our generated stubs: require('/path/to/file')
    const reqMatch = content.match(/require\(['"](.+?)['"]\)/);
    if (reqMatch) return runFile([reqMatch[1], ...args], cwd, emit, signal);

    // If it's a JS file with shebang
    if (content.startsWith('#!')) return runFile([binPath, ...args], cwd, emit, signal);
  }

  // Try finding the package directly
  const pkgDir = path.join(cwd, 'node_modules', binName);
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    let entry;
    if (pkg.bin) {
      entry = typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin[binName] || Object.values(pkg.bin)[0]);
    }
    if (!entry) entry = pkg.main || 'index.js';
    return runFile([path.resolve(pkgDir, entry), ...args], cwd, emit, signal);
  }

  emit.stderr(`command '${binName}' not found\nTry: npm install ${binName}\n`);
  return 127;
}

function runEval(code, cwd, emit, printResult) {
  const origCwd = process.cwd;
  const origLog = console.log;
  const origError = console.error;
  process.cwd = () => cwd;
  console.log = (...a) => emit.stdout(fmtArgs(a) + '\n');
  console.error = (...a) => emit.stderr(fmtArgs(a) + '\n');

  try {
    const result = vm.runInThisContext(code, { filename: '[eval]' });
    if (printResult && result !== undefined) emit.stdout(String(result) + '\n');
    return 0;
  } catch (err) {
    emit.stderr(err.message + '\n');
    return 1;
  } finally {
    process.cwd = origCwd;
    console.log = origLog;
    console.error = origError;
  }
}

function fmtArgs(args) {
  return args.map(a => typeof a === 'string' ? a : util.inspect(a, { depth: 4, colors: false })).join(' ');
}

function formatError(err, filePath) {
  if (!err.stack) return err.message || String(err);
  return err.stack.split('\n')
    .filter(l => !l.includes('script-runner.js') && !l.includes('internal/modules'))
    .join('\n');
}

module.exports = { runFile, runBin };
