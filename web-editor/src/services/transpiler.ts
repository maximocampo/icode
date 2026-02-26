import { transform } from 'sucrase'

export class BuildError extends Error {
  file: string
  line: number
  constructor(message: string, file: string, line: number) {
    super(message)
    this.name = 'BuildError'
    this.file = file
    this.line = line
  }
}

function transpileFile(code: string, filePath: string): string {
  const isTS = filePath.endsWith('.ts') || filePath.endsWith('.tsx')
  const transforms: ('jsx' | 'typescript' | 'imports')[] = ['imports']

  // .js and .jsx files may contain JSX; .tsx obviously does too
  if (!filePath.endsWith('.ts')) transforms.push('jsx')
  if (isTS) transforms.push('typescript')

  try {
    const result = transform(code, {
      transforms,
      jsxRuntime: 'automatic',
      production: false,
    })
    return result.code
  } catch (err: any) {
    throw new BuildError(
      err.message || 'Transpilation failed',
      filePath,
      err.loc?.line ?? 0,
    )
  }
}

export function buildPreviewHtml(files: Record<string, string>): string {
  const codeExtensions = ['.js', '.jsx', '.ts', '.tsx']
  const cssExtensions = ['.css']

  // Collect and transpile code files
  const transpiledModules: Record<string, string> = {}
  const fileList: string[] = []
  const cssBlocks: string[] = []

  for (const [path, content] of Object.entries(files)) {
    const ext = path.substring(path.lastIndexOf('.'))

    if (codeExtensions.includes(ext)) {
      transpiledModules[path] = transpileFile(content, path)
      fileList.push(path)
    } else if (cssExtensions.includes(ext)) {
      cssBlocks.push(content)
      fileList.push(path) // register so require('./x.css') resolves
    }
  }

  // Build the file registry as JSON for the module system
  const fileRegistryJSON = JSON.stringify(fileList)

  // Build module code registrations
  const moduleRegistrations = Object.entries(transpiledModules)
    .map(([path, code]) => {
      // Escape backticks and ${} in user code so template literal is safe
      const escaped = code
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$\{/g, '\\${')
      return `__moduleCode[${JSON.stringify(path)}] = function(module, exports, require) {\n${escaped}\n};`
    })
    .join('\n\n')

  // Detect entry file
  const entryFile =
    fileList.includes('/index.js') ? '/index.js'
    : fileList.includes('/index.tsx') ? '/index.tsx'
    : fileList.includes('/index.ts') ? '/index.ts'
    : fileList.includes('/index.jsx') ? '/index.jsx'
    : null

  const appFile =
    fileList.includes('/App.js') ? '/App.js'
    : fileList.includes('/App.tsx') ? '/App.tsx'
    : fileList.includes('/App.jsx') ? '/App.jsx'
    : fileList.includes('/App.ts') ? '/App.ts'
    : fileList[0] || null

  // Build entry script
  let entryScript: string
  if (entryFile) {
    entryScript = `__require(${JSON.stringify(entryFile)}, '/');`
  } else if (appFile) {
    entryScript = `
      var _app = __require(${JSON.stringify(appFile)}, '/');
      var _AppComponent = _app.default || _app;
      var _root = ReactDOM.createRoot(document.getElementById('root'));
      _root.render(React.createElement(_AppComponent));
    `
  } else {
    entryScript = `document.getElementById('root').innerHTML = '<p style="color:#888;padding:16px;">No entry file found</p>';`
  }

  const cssStyleTags = cssBlocks
    .map((css) => `<style>${css}</style>`)
    .join('\n')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: auto; -webkit-overflow-scrolling: touch; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #fff; }
    #root { min-height: 100%; }
  </style>
  ${cssStyleTags}
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"><\/script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>
</head>
<body>
  <div id="root"></div>
  <script>
  // ---- Module System ----
  var __moduleCode = {};
  var __moduleCache = {};
  var __fileList = ${fileRegistryJSON};

  var __builtins = {
    'react': function() { return window.React; },
    'react-dom': function() { return window.ReactDOM; },
    'react-dom/client': function() {
      return { createRoot: ReactDOM.createRoot, hydrateRoot: ReactDOM.hydrateRoot };
    },
    'react/jsx-runtime': function() {
      function jsx(type, props, key) {
        if (key !== undefined) props = Object.assign({}, props, { key: key });
        return React.createElement(type, props);
      }
      return { jsx: jsx, jsxs: jsx, Fragment: React.Fragment };
    },
    'react/jsx-dev-runtime': function() {
      function jsxDEV(type, props, key) {
        if (key !== undefined) props = Object.assign({}, props, { key: key });
        return React.createElement(type, props);
      }
      return { jsxDEV: jsxDEV, Fragment: React.Fragment };
    },
  };

  function __resolvePath(from, to) {
    var fromDir = from.substring(0, from.lastIndexOf('/'));
    var segments = (fromDir + '/' + to).split('/');
    var resolved = [];
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (seg === '.' || seg === '') continue;
      if (seg === '..') { resolved.pop(); continue; }
      resolved.push(seg);
    }
    return '/' + resolved.join('/');
  }

  function __resolveFile(from, specifier) {
    // Built-in?
    if (__builtins[specifier]) return { type: 'builtin', key: specifier };

    // Not a relative import? Treat as built-in (may return empty)
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      if (__builtins[specifier]) return { type: 'builtin', key: specifier };
      return { type: 'empty' };
    }

    var base = specifier.startsWith('/') ? specifier : __resolvePath(from, specifier);

    // CSS?
    if (base.endsWith('.css')) {
      return { type: 'css' };
    }

    // JSON?
    if (base.endsWith('.json')) {
      return { type: 'json', key: base };
    }

    // Try exact
    if (__moduleCode[base]) return { type: 'file', key: base };

    // Try extensions
    var exts = ['.js', '.jsx', '.ts', '.tsx'];
    for (var i = 0; i < exts.length; i++) {
      if (__moduleCode[base + exts[i]]) return { type: 'file', key: base + exts[i] };
    }

    // Try index files
    var idxExts = ['/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
    for (var i = 0; i < idxExts.length; i++) {
      if (__moduleCode[base + idxExts[i]]) return { type: 'file', key: base + idxExts[i] };
    }

    return { type: 'empty' };
  }

  function __require(specifier, from) {
    var resolved = __resolveFile(from || '/', specifier);

    if (resolved.type === 'builtin') return __builtins[resolved.key]();
    if (resolved.type === 'css' || resolved.type === 'empty') return {};

    // Cache check
    if (__moduleCache[resolved.key]) return __moduleCache[resolved.key].exports;

    // Execute
    var module = { exports: {} };
    __moduleCache[resolved.key] = module;

    try {
      __moduleCode[resolved.key](module, module.exports, function(spec) {
        return __require(spec, resolved.key);
      });
    } catch (err) {
      window.parent.postMessage({ type: 'preview-error', message: err.toString(), stack: err.stack || '' }, '*');
      throw err;
    }

    return __moduleCache[resolved.key].exports;
  }

  // ---- Register Modules ----
  ${moduleRegistrations}

  // ---- Runtime Error Handlers ----
  window.onerror = function(msg, src, line, col, err) {
    var message = err ? err.toString() : msg;
    var stack = err && err.stack ? err.stack : '';
    window.parent.postMessage({ type: 'preview-error', message: message, stack: stack }, '*');
    document.getElementById('root').innerHTML =
      '<pre style="color:#f44;padding:16px;font-size:13px;white-space:pre-wrap;font-family:monospace;">' +
      message + '</pre>';
  };

  window.onunhandledrejection = function(e) {
    var message = e.reason ? e.reason.toString() : 'Unhandled promise rejection';
    window.parent.postMessage({ type: 'preview-error', message: message }, '*');
  };

  // ---- Console Forwarding ----
  (function() {
    var origLog = console.log;
    var origWarn = console.warn;
    var origError = console.error;
    function forward(level, args) {
      var parts = [];
      for (var i = 0; i < args.length; i++) {
        try { parts.push(typeof args[i] === 'object' ? JSON.stringify(args[i]) : String(args[i])); }
        catch(e) { parts.push(String(args[i])); }
      }
      window.parent.postMessage({ type: 'preview-console', level: level, text: parts.join(' ') }, '*');
    }
    console.log = function() { forward('log', arguments); origLog.apply(console, arguments); };
    console.warn = function() { forward('warn', arguments); origWarn.apply(console, arguments); };
    console.error = function() { forward('error', arguments); origError.apply(console, arguments); };
  })();

  // ---- Fix vh units for nested iframes ----
  (function() {
    function setVh() {
      var vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', vh + 'px');
      // Override 100vh on #root to use real height
      document.getElementById('root').style.minHeight = window.innerHeight + 'px';
    }
    setVh();
    window.addEventListener('resize', setVh);
  })();

  // ---- Entry Point ----
  try {
    ${entryScript}
  } catch (err) {
    document.getElementById('root').innerHTML =
      '<pre style="color:#f44;padding:16px;font-size:13px;white-space:pre-wrap;font-family:monospace;">' +
      err.toString() + '</pre>';
    window.parent.postMessage({ type: 'preview-error', message: err.toString(), stack: err.stack || '' }, '*');
  }
  <\/script>
</body>
</html>`
}
