const rn_bridge = require('rn-bridge');
const fs = require('fs');
const path = require('path');

const shellCommands = require('./shell-commands');
const scriptRunner = require('./script-runner');
const npmLite = require('./npm-lite');

const datadir = rn_bridge.app.datadir();
const projectsDir = path.join(datadir, 'projects');

// Ensure projects directory exists
try { fs.mkdirSync(projectsDir, { recursive: true }); } catch {}

// Track active tasks for kill support (AbortController-based)
const activeTasks = new Map();

function send(msg) {
  rn_bridge.channel.send(JSON.stringify(msg));
}

// Shell commands that we implement in-process
const SHELL_CMDS = [
  'ls', 'pwd', 'cat', 'mkdir', 'rm', 'rmdir', 'echo', 'cp', 'mv', 'touch',
  'which', 'env', 'whoami', 'uname', 'date', 'head', 'tail', 'wc', 'find',
  'dirname', 'basename', 'realpath', 'clear', 'true', 'false',
];

/**
 * Route a command to the appropriate in-process handler.
 * No child_process.spawn — safe for real iOS devices.
 */
async function executeCommand(command, args, cwd, emit, signal) {
  // Quick version responses
  if (command === 'node' && (args[0] === '-v' || args[0] === '--version')) {
    emit.stdout(process.version + '\n');
    return 0;
  }
  if (command === 'npm' && (args[0] === '-v' || args[0] === '--version')) {
    emit.stdout('0.1.0-lite\n');
    return 0;
  }

  // Shell commands
  if (SHELL_CMDS.includes(command)) {
    return shellCommands.run(command, args, cwd, emit);
  }

  // Node.js execution
  if (command === 'node') {
    return scriptRunner.runFile(args, cwd, emit, signal);
  }

  // npm commands
  if (command === 'npm') {
    return handleNpm(args, cwd, emit, signal);
  }

  // npx
  if (command === 'npx') {
    return scriptRunner.runBin(args[0], args.slice(1), cwd, emit, signal);
  }

  // yarn/pnpm/bun aliases → route to npm-lite
  if (command === 'yarn' || command === 'pnpm' || command === 'bun') {
    emit.stdout(`(using npm-lite instead of ${command})\n`);
    return handleNpm(args, cwd, emit, signal);
  }

  // Check node_modules/.bin
  const binPath = path.join(cwd, 'node_modules', '.bin', command);
  if (fs.existsSync(binPath)) {
    return scriptRunner.runBin(command, args, cwd, emit, signal);
  }

  emit.stderr(`command not found: ${command}\n`);
  return 127;
}

async function handleNpm(args, cwd, emit, signal) {
  const sub = args[0] || 'help';

  switch (sub) {
    case 'install':
    case 'i':
    case 'ci':
    case 'add':
      return npmLite.install(cwd, emit, signal, {
        saveDev: args.includes('--save-dev') || args.includes('-D'),
        production: args.includes('--production') || args.includes('--omit=dev'),
        packages: args.filter(a => !a.startsWith('-') && a !== 'install' && a !== 'i' && a !== 'ci' && a !== 'add'),
      });

    case 'run':
    case 'run-script':
      return npmLite.runScript(args[1], args.slice(2), cwd, emit, signal);

    case 'start':
      return npmLite.runScript('start', args.slice(1), cwd, emit, signal);

    case 'test':
    case 't':
      return npmLite.runScript('test', args.slice(1), cwd, emit, signal);

    case 'init':
      return npmLite.init(cwd, emit, args.slice(1));

    case 'ls':
    case 'list':
      return npmLite.list(cwd, emit);

    case 'uninstall':
    case 'remove':
    case 'rm':
    case 'un':
      return npmLite.uninstall(args.slice(1), cwd, emit);

    case 'help':
      emit.stdout('npm-lite — lightweight package manager for iCode\n\n');
      emit.stdout('Commands:\n');
      emit.stdout('  npm install [pkg...]   Install dependencies\n');
      emit.stdout('  npm run <script>       Run a script from package.json\n');
      emit.stdout('  npm start              Run the start script\n');
      emit.stdout('  npm test               Run the test script\n');
      emit.stdout('  npm init               Create package.json\n');
      emit.stdout('  npm ls                 List installed packages\n');
      emit.stdout('  npm uninstall <pkg>    Remove a package\n');
      return 0;

    default:
      emit.stderr(`npm-lite: unknown command "${sub}"\n`);
      emit.stderr('Run "npm help" for available commands.\n');
      return 1;
  }
}

// Handle incoming messages from React Native
rn_bridge.channel.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  const { id, type } = msg;

  switch (type) {
    case 'ping':
      send({ id, type: 'pong', nodeVersion: process.version, platform: process.platform });
      break;

    case 'exec': {
      const { command, args, cwd } = msg;
      const resolvedCwd = cwd || projectsDir;

      try { fs.mkdirSync(resolvedCwd, { recursive: true }); } catch {}

      const emit = {
        stdout: (data) => send({ id, type: 'stdout', data }),
        stderr: (data) => send({ id, type: 'stderr', data }),
      };

      const controller = new AbortController();
      activeTasks.set(id, { abort: () => controller.abort() });

      (async () => {
        try {
          const exitCode = await executeCommand(command, args || [], resolvedCwd, emit, controller.signal);
          send({ id, type: 'exit', code: exitCode ?? 0, signal: null });
        } catch (err) {
          if (err.name === 'AbortError') {
            send({ id, type: 'exit', code: 130, signal: 'SIGINT' });
          } else {
            send({ id, type: 'error', message: err.message || String(err) });
          }
        } finally {
          activeTasks.delete(id);
        }
      })();
      break;
    }

    case 'kill': {
      const task = activeTasks.get(msg.processId);
      if (task) {
        task.abort();
        activeTasks.delete(msg.processId);
        send({ id, type: 'killed' });
      } else {
        send({ id, type: 'error', message: 'Process not found' });
      }
      break;
    }

    case 'writeFile': {
      try {
        const dir = path.dirname(msg.path);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(msg.path, msg.content, 'utf8');
        send({ id, type: 'done' });
      } catch (err) {
        send({ id, type: 'error', message: err.message });
      }
      break;
    }

    case 'readFile': {
      try {
        const content = fs.readFileSync(msg.path, 'utf8');
        send({ id, type: 'result', content });
      } catch (err) {
        send({ id, type: 'error', message: err.message });
      }
      break;
    }

    case 'mkdir': {
      try {
        fs.mkdirSync(msg.path, { recursive: true });
        send({ id, type: 'done' });
      } catch (err) {
        send({ id, type: 'error', message: err.message });
      }
      break;
    }

    case 'readDir': {
      try {
        const entries = fs.readdirSync(msg.path, { withFileTypes: true });
        const result = entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
        send({ id, type: 'result', entries: result });
      } catch (err) {
        send({ id, type: 'error', message: err.message });
      }
      break;
    }

    case 'getInfo': {
      send({
        id,
        type: 'info',
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        datadir,
        projectsDir,
        execPath: process.execPath,
      });
      break;
    }

    default:
      send({ id, type: 'error', message: `Unknown message type: ${type}` });
  }
});

// Handle app lifecycle
rn_bridge.app.on('pause', (pauseLock) => {
  for (const [id, task] of activeTasks) {
    try { task.abort(); } catch {}
  }
  activeTasks.clear();
  pauseLock.release();
});

rn_bridge.app.on('resume', () => {});

// Signal ready
send({ type: 'ready', nodeVersion: process.version });
