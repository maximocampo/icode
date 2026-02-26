'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function run(command, args, cwd, emit) {
  try {
    switch (command) {
      case 'pwd':
        emit.stdout(cwd + '\n');
        return 0;

      case 'echo': {
        let noNewline = false;
        let echoArgs = args;
        if (echoArgs[0] === '-n') { noNewline = true; echoArgs = echoArgs.slice(1); }
        const text = echoArgs.join(' ');
        emit.stdout(noNewline ? text : text + '\n');
        return 0;
      }

      case 'ls': {
        let showAll = false, long = false, onePerLine = false;
        const targets = [];
        for (const a of args) {
          if (a.startsWith('-')) {
            if (a.includes('a')) showAll = true;
            if (a.includes('l')) long = true;
            if (a.includes('1')) onePerLine = true;
          } else {
            targets.push(a);
          }
        }
        const target = targets[0] ? resolve(targets[0], cwd) : cwd;

        let stat;
        try { stat = fs.statSync(target); } catch (e) {
          emit.stderr(`ls: ${targets[0] || '.'}: No such file or directory\n`);
          return 1;
        }
        if (!stat.isDirectory()) {
          emit.stdout((long ? formatLong(path.basename(target), stat) : path.basename(target)) + '\n');
          return 0;
        }

        const entries = fs.readdirSync(target);
        const filtered = showAll ? entries : entries.filter(e => !e.startsWith('.'));
        filtered.sort();

        if (long) {
          emit.stdout(`total ${filtered.length}\n`);
          for (const e of filtered) {
            try {
              const s = fs.statSync(path.join(target, e));
              emit.stdout(formatLong(e, s) + '\n');
            } catch {
              emit.stdout(`??????????  ${e}\n`);
            }
          }
        } else {
          const out = filtered.map(e => {
            try {
              return fs.statSync(path.join(target, e)).isDirectory() ? e + '/' : e;
            } catch { return e; }
          });
          emit.stdout(out.join(onePerLine || long ? '\n' : '  ') + '\n');
        }
        return 0;
      }

      case 'cat': {
        let numberLines = false;
        const files = [];
        for (const a of args) {
          if (a === '-n') numberLines = true;
          else if (!a.startsWith('-')) files.push(a);
        }
        if (files.length === 0) { emit.stderr('cat: missing operand\n'); return 1; }
        for (const f of files) {
          try {
            const content = fs.readFileSync(resolve(f, cwd), 'utf8');
            if (numberLines) {
              content.split('\n').forEach((line, i) => {
                emit.stdout(`${String(i + 1).padStart(6)}  ${line}\n`);
              });
            } else {
              emit.stdout(content);
              if (!content.endsWith('\n')) emit.stdout('\n');
            }
          } catch (e) {
            emit.stderr(`cat: ${f}: ${e.code === 'ENOENT' ? 'No such file or directory' : e.message}\n`);
            return 1;
          }
        }
        return 0;
      }

      case 'mkdir': {
        let recursive = false;
        const dirs = [];
        for (const a of args) {
          if (a === '-p') recursive = true;
          else if (!a.startsWith('-')) dirs.push(a);
        }
        if (dirs.length === 0) { emit.stderr('mkdir: missing operand\n'); return 1; }
        for (const d of dirs) fs.mkdirSync(resolve(d, cwd), { recursive });
        return 0;
      }

      case 'rm': {
        let recursive = false, force = false;
        const targets = [];
        for (const a of args) {
          if (a.startsWith('-')) {
            if (a.includes('r') || a.includes('R')) recursive = true;
            if (a.includes('f')) force = true;
          } else targets.push(a);
        }
        if (targets.length === 0 && !force) { emit.stderr('rm: missing operand\n'); return 1; }
        for (const t of targets) {
          try {
            const s = fs.statSync(resolve(t, cwd));
            if (s.isDirectory()) {
              if (!recursive) { emit.stderr(`rm: ${t}: is a directory\n`); return 1; }
              fs.rmSync(resolve(t, cwd), { recursive: true, force: true });
            } else {
              fs.unlinkSync(resolve(t, cwd));
            }
          } catch (e) {
            if (!force) { emit.stderr(`rm: ${t}: ${e.message}\n`); return 1; }
          }
        }
        return 0;
      }

      case 'touch':
        for (const f of args.filter(a => !a.startsWith('-'))) {
          const p = resolve(f, cwd);
          try { fs.utimesSync(p, new Date(), new Date()); }
          catch { fs.writeFileSync(p, '', { flag: 'a' }); }
        }
        return 0;

      case 'cp': {
        let recursive = false;
        const operands = [];
        for (const a of args) {
          if (a === '-r' || a === '-R' || a === '-rp') recursive = true;
          else if (!a.startsWith('-')) operands.push(a);
        }
        if (operands.length < 2) { emit.stderr('cp: missing operand\n'); return 1; }
        const dest = resolve(operands.pop(), cwd);
        for (const src of operands) {
          const s = resolve(src, cwd);
          if (fs.statSync(s).isDirectory()) {
            if (!recursive) { emit.stderr(`cp: ${src}: is a directory (use -r)\n`); return 1; }
            copyDir(s, dest);
          } else {
            fs.copyFileSync(s, dest);
          }
        }
        return 0;
      }

      case 'mv': {
        if (args.length < 2) { emit.stderr('mv: missing operand\n'); return 1; }
        const dest = resolve(args[args.length - 1], cwd);
        for (const src of args.slice(0, -1)) fs.renameSync(resolve(src, cwd), dest);
        return 0;
      }

      case 'which': {
        if (args.length === 0) return 1;
        const cmd = args[0];
        const binPath = path.join(cwd, 'node_modules', '.bin', cmd);
        if (fs.existsSync(binPath)) { emit.stdout(binPath + '\n'); return 0; }
        const builtins = ['node', 'npm', 'npx', 'ls', 'pwd', 'cat', 'mkdir', 'rm', 'echo', 'cp', 'mv', 'touch', 'which', 'env'];
        if (builtins.includes(cmd)) { emit.stdout(`(built-in) ${cmd}\n`); return 0; }
        emit.stderr(`${cmd} not found\n`);
        return 1;
      }

      case 'env':
        for (const [k, v] of Object.entries(process.env)) emit.stdout(`${k}=${v}\n`);
        return 0;

      case 'whoami':
        emit.stdout('mobile\n');
        return 0;

      case 'uname': {
        const flag = args[0] || '-s';
        if (flag === '-a') emit.stdout(`${os.type()} ${os.hostname()} ${os.release()} ${os.arch()}\n`);
        else if (flag === '-m') emit.stdout(os.arch() + '\n');
        else emit.stdout(os.type() + '\n');
        return 0;
      }

      case 'date':
        emit.stdout(new Date().toString() + '\n');
        return 0;

      case 'head': {
        let n = 10;
        const files = [];
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '-n' && args[i + 1]) n = parseInt(args[++i], 10);
          else if (!args[i].startsWith('-')) files.push(args[i]);
        }
        for (const f of files) {
          emit.stdout(fs.readFileSync(resolve(f, cwd), 'utf8').split('\n').slice(0, n).join('\n') + '\n');
        }
        return 0;
      }

      case 'tail': {
        let n = 10;
        const files = [];
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '-n' && args[i + 1]) n = parseInt(args[++i], 10);
          else if (!args[i].startsWith('-')) files.push(args[i]);
        }
        for (const f of files) {
          emit.stdout(fs.readFileSync(resolve(f, cwd), 'utf8').split('\n').slice(-n).join('\n') + '\n');
        }
        return 0;
      }

      case 'wc':
        for (const f of args.filter(a => !a.startsWith('-'))) {
          const c = fs.readFileSync(resolve(f, cwd), 'utf8');
          emit.stdout(`  ${c.split('\n').length}  ${c.split(/\s+/).filter(Boolean).length}  ${Buffer.byteLength(c)} ${f}\n`);
        }
        return 0;

      case 'find': {
        let searchPath = cwd, namePattern = null, typeFilter = null;
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '-name') namePattern = args[++i];
          else if (args[i] === '-type') typeFilter = args[++i];
          else if (!args[i].startsWith('-')) searchPath = resolve(args[i], cwd);
        }
        findRecursive(searchPath, searchPath, namePattern, typeFilter, emit);
        return 0;
      }

      case 'dirname':
        if (args[0]) { emit.stdout(path.dirname(args[0]) + '\n'); return 0; }
        emit.stderr('dirname: missing operand\n'); return 1;

      case 'basename':
        if (args[0]) { emit.stdout(path.basename(args[0], args[1]) + '\n'); return 0; }
        emit.stderr('basename: missing operand\n'); return 1;

      case 'realpath':
        if (args[0]) { emit.stdout(path.resolve(cwd, args[0]) + '\n'); return 0; }
        emit.stderr('realpath: missing operand\n'); return 1;

      case 'rmdir':
        for (const d of args.filter(a => !a.startsWith('-'))) {
          try { fs.rmdirSync(resolve(d, cwd)); } catch (e) { emit.stderr(`rmdir: ${d}: ${e.message}\n`); return 1; }
        }
        return 0;

      case 'clear':
        emit.stdout('\x1b[2J\x1b[H');
        return 0;

      case 'true': return 0;
      case 'false': return 1;

      default:
        emit.stderr(`${command}: command not implemented\n`);
        return 127;
    }
  } catch (err) {
    emit.stderr(`${command}: ${err.message}\n`);
    return 1;
  }
}

function resolve(p, cwd) {
  return path.isAbsolute(p) ? p : path.resolve(cwd, p);
}

function formatLong(name, stat) {
  const type = stat.isDirectory() ? 'd' : '-';
  const size = String(stat.size).padStart(8);
  const date = stat.mtime.toISOString().slice(0, 16).replace('T', ' ');
  const suffix = stat.isDirectory() ? '/' : '';
  return `${type}rwxr-xr-x  ${size} ${date} ${name}${suffix}`;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src)) {
    const s = path.join(src, e);
    const d = path.join(dest, e);
    fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

function findRecursive(base, current, namePattern, typeFilter, emit) {
  let entries;
  try { entries = fs.readdirSync(current); } catch { return; }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.git') continue;
    const full = path.join(current, e);
    try {
      const s = fs.statSync(full);
      const matchesName = !namePattern || matchGlob(e, namePattern);
      const matchesType = !typeFilter || (typeFilter === 'f' && !s.isDirectory()) || (typeFilter === 'd' && s.isDirectory());
      if (matchesName && matchesType) emit.stdout('./' + path.relative(base, full) + '\n');
      if (s.isDirectory()) findRecursive(base, full, namePattern, typeFilter, emit);
    } catch {}
  }
}

function matchGlob(str, pattern) {
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return re.test(str);
}

module.exports = { run };
