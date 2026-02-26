'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

/**
 * Minimal JSX transform — converts JSX to React.createElement calls.
 * Handles: tags, self-closing, props, expressions, fragments, imports/exports.
 */
function transformJSX(code) {
  // Transform import/export statements to CommonJS
  code = transformModules(code);
  // Transform JSX syntax
  code = transformJSXSyntax(code);
  return code;
}

function transformModules(code) {
  // import X from 'mod' → const X = require('mod').default || require('mod')
  code = code.replace(
    /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?/g,
    (_, name, mod) => `const ${name} = (function() { var _m = require('${mod}'); return _m && _m.__esModule ? _m.default : _m; })();`
  );

  // import { X, Y } from 'mod' → const { X, Y } = require('mod')
  code = code.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g,
    (_, names, mod) => `const { ${names.trim()} } = require('${mod}');`
  );

  // import * as X from 'mod' → const X = require('mod')
  code = code.replace(
    /import\s*\*\s*as\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?/g,
    (_, name, mod) => `const ${name} = require('${mod}');`
  );

  // import 'mod' → require('mod')
  code = code.replace(
    /import\s+['"]([^'"]+)['"]\s*;?/g,
    (_, mod) => `require('${mod}');`
  );

  // export default X → module.exports.default = X; module.exports = ...
  code = code.replace(
    /export\s+default\s+function\s+(\w+)/g,
    'function $1'
  );
  code = code.replace(
    /export\s+default\s+/g,
    'module.exports = '
  );
  // Put default function export at end
  const defaultFnMatch = code.match(/^function\s+(\w+)/m);
  if (defaultFnMatch && !code.includes('module.exports')) {
    code += `\nmodule.exports = ${defaultFnMatch[1]};`;
  }

  // export function X → function X ... module.exports.X = X
  code = code.replace(
    /export\s+function\s+(\w+)/g,
    (_, name) => { return `function ${name}`; }
  );

  // export const X = → const X = ...; module.exports.X = X
  code = code.replace(
    /export\s+(const|let|var)\s+(\w+)/g,
    (_, decl, name) => `${decl} ${name}`
  );

  return code;
}

function transformJSXSyntax(code) {
  let result = '';
  let i = 0;

  while (i < code.length) {
    // Skip strings
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const quote = code[i];
      result += quote;
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') { result += code[i++]; }
        if (i < code.length) { result += code[i++]; }
      }
      if (i < code.length) { result += code[i++]; }
      continue;
    }

    // Skip single-line comments
    if (code[i] === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') result += code[i++];
      continue;
    }

    // Skip multi-line comments
    if (code[i] === '/' && code[i + 1] === '*') {
      result += '/*';
      i += 2;
      while (i < code.length - 1 && !(code[i] === '*' && code[i + 1] === '/')) {
        result += code[i++];
      }
      if (i < code.length - 1) { result += '*/'; i += 2; }
      continue;
    }

    // JSX detection: < followed by uppercase letter, lowercase letter, or >
    if (code[i] === '<' && i + 1 < code.length) {
      const next = code[i + 1];
      // Fragment: <>
      if (next === '>') {
        const jsx = parseJSXFragment(code, i);
        if (jsx) {
          result += jsx.output;
          i = jsx.end;
          continue;
        }
      }
      // Tag: <Component or <div
      if (/[a-zA-Z_]/.test(next)) {
        // Check if this is JSX (not a comparison like a < b)
        const before = result.trimEnd();
        const lastChar = before[before.length - 1];
        const isComparison = lastChar && /[a-zA-Z0-9_$)\]]/.test(lastChar) && !/return|case|in|of|typeof|instanceof|void|delete|throw|new|yield|await/.test(getLastWord(before));

        if (!isComparison) {
          const jsx = parseJSXElement(code, i);
          if (jsx) {
            result += jsx.output;
            i = jsx.end;
            continue;
          }
        }
      }
    }

    result += code[i++];
  }

  return result;
}

function getLastWord(str) {
  const match = str.match(/(\w+)\s*$/);
  return match ? match[1] : '';
}

function parseJSXFragment(code, start) {
  let i = start + 2; // skip <>
  const children = [];

  while (i < code.length) {
    // End fragment: </>
    if (code.substr(i, 3) === '</>') {
      const childStr = children.length > 0 ? ', ' + children.join(', ') : '';
      return {
        output: `React.createElement(React.Fragment, null${childStr})`,
        end: i + 3
      };
    }

    const child = parseJSXChild(code, i);
    if (child) {
      if (child.output.trim()) children.push(child.output);
      i = child.end;
    } else {
      break;
    }
  }
  return null;
}

function parseJSXElement(code, start) {
  let i = start + 1; // skip <

  // Parse tag name
  let tagName = '';
  while (i < code.length && /[a-zA-Z0-9_.$]/.test(code[i])) {
    tagName += code[i++];
  }
  if (!tagName) return null;

  // Is it a component (uppercase) or HTML element (lowercase)?
  const isComponent = /^[A-Z]/.test(tagName);
  const tagStr = isComponent ? tagName : `"${tagName}"`;

  // Parse props
  const props = [];
  let spreads = [];

  while (i < code.length) {
    // Skip whitespace
    while (i < code.length && /\s/.test(code[i])) i++;

    // Self-closing: />
    if (code[i] === '/' && code[i + 1] === '>') {
      const propsStr = buildPropsStr(props, spreads);
      return {
        output: `React.createElement(${tagStr}, ${propsStr})`,
        end: i + 2
      };
    }

    // End of opening tag: >
    if (code[i] === '>') {
      i++; // skip >
      break;
    }

    // Spread: {...expr}
    if (code[i] === '{' && code[i + 1] === '.' && code[i + 2] === '.' && code[i + 3] === '.') {
      i += 4; // skip {...
      const expr = parseExpression(code, i, '}');
      spreads.push(expr.value);
      i = expr.end + 1; // skip }
      continue;
    }

    // Prop name
    let propName = '';
    while (i < code.length && /[a-zA-Z0-9_-]/.test(code[i])) {
      propName += code[i++];
    }
    if (!propName) break;

    // Prop with value: name=...
    if (code[i] === '=') {
      i++; // skip =
      if (code[i] === '"' || code[i] === "'") {
        // String value
        const quote = code[i++];
        let val = '';
        while (i < code.length && code[i] !== quote) {
          val += code[i++];
        }
        i++; // skip closing quote
        props.push(`${normProp(propName)}: "${val}"`);
      } else if (code[i] === '{') {
        // Expression value
        i++; // skip {
        const expr = parseExpression(code, i, '}');
        props.push(`${normProp(propName)}: ${expr.value}`);
        i = expr.end + 1; // skip }
      }
    } else {
      // Boolean prop
      props.push(`${normProp(propName)}: true`);
    }
  }

  // Parse children
  const children = [];
  while (i < code.length) {
    // Closing tag: </tagName>
    const closeTag = `</${tagName}>`;
    if (code.substr(i, closeTag.length) === closeTag) {
      const propsStr = buildPropsStr(props, spreads);
      const childStr = children.length > 0 ? ', ' + children.join(', ') : '';
      return {
        output: `React.createElement(${tagStr}, ${propsStr}${childStr})`,
        end: i + closeTag.length
      };
    }

    const child = parseJSXChild(code, i);
    if (child) {
      if (child.output.trim()) children.push(child.output);
      i = child.end;
    } else {
      break;
    }
  }

  return null;
}

function parseJSXChild(code, i) {
  // Skip whitespace-only runs
  let ws = '';
  while (i < code.length && /[\s]/.test(code[i]) && code[i] !== '\n') {
    ws += code[i++];
  }

  // Closing tag check — don't consume it
  if (code[i] === '<' && code[i + 1] === '/') {
    return { output: '', end: i };
  }

  // Fragment child
  if (code[i] === '<' && code[i + 1] === '>') {
    return parseJSXFragment(code, i);
  }

  // JSX child element
  if (code[i] === '<' && /[a-zA-Z_]/.test(code[i + 1])) {
    return parseJSXElement(code, i);
  }

  // Expression child: {expr}
  if (code[i] === '{') {
    i++; // skip {
    const expr = parseExpression(code, i, '}');
    return { output: expr.value, end: expr.end + 1 };
  }

  // Text child
  let text = '';
  while (i < code.length && code[i] !== '<' && code[i] !== '{') {
    text += code[i++];
  }
  if (text.trim()) {
    return { output: JSON.stringify(text.trim()), end: i };
  }
  return { output: '', end: i };
}

function parseExpression(code, start, endChar) {
  let depth = 0;
  let i = start;
  let value = '';

  while (i < code.length) {
    if (code[i] === '{' || code[i] === '(' || code[i] === '[') depth++;
    if (code[i] === '}' || code[i] === ')' || code[i] === ']') {
      if (depth === 0 && code[i] === endChar) {
        return { value, end: i };
      }
      depth--;
    }

    // Skip strings in expressions
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const quote = code[i];
      value += quote;
      i++;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\') { value += code[i++]; }
        if (i < code.length) { value += code[i++]; }
      }
      if (i < code.length) { value += code[i++]; }
      continue;
    }

    // JSX inside expression
    if (code[i] === '<' && /[a-zA-Z_>]/.test(code[i + 1] || '')) {
      if (code[i + 1] === '>') {
        const jsx = parseJSXFragment(code, i);
        if (jsx) { value += jsx.output; i = jsx.end; continue; }
      } else {
        const jsx = parseJSXElement(code, i);
        if (jsx) { value += jsx.output; i = jsx.end; continue; }
      }
    }

    value += code[i++];
  }

  return { value, end: i };
}

function normProp(name) {
  // className → className (already fine)
  // Some JSX props need camelCase but most are fine as-is
  if (name.includes('-')) {
    return `"${name}"`;
  }
  return name;
}

function buildPropsStr(props, spreads) {
  if (props.length === 0 && spreads.length === 0) return 'null';
  let result = '';
  if (spreads.length > 0) {
    result = `Object.assign({}, ${spreads.map(s => s).join(', ')}, { ${props.join(', ')} })`;
  } else {
    result = `{ ${props.join(', ')} }`;
  }
  return result;
}

// ---- Dev Server ----

function readProjectFiles(projectDir) {
  const files = {};
  const exts = ['.js', '.jsx', '.ts', '.tsx', '.css', '.json'];

  function walk(dir, relative) {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return; }

    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const fullPath = path.join(dir, entry);
      const relPath = relative ? `${relative}/${entry}` : entry;

      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath, relPath);
        } else {
          const ext = path.extname(entry);
          if (exts.includes(ext)) {
            files[`/${relPath}`] = fs.readFileSync(fullPath, 'utf8');
          }
        }
      } catch {}
    }
  }

  walk(projectDir, '');
  return files;
}

function buildHTML(projectDir) {
  const files = readProjectFiles(projectDir);
  const codeExtensions = ['.js', '.jsx', '.ts', '.tsx'];
  const cssBlocks = [];
  const moduleRegistrations = [];
  const fileList = [];

  for (const [filePath, content] of Object.entries(files)) {
    const ext = path.extname(filePath);
    fileList.push(filePath);

    if (ext === '.css') {
      cssBlocks.push(content);
    } else if (codeExtensions.includes(ext)) {
      try {
        const transformed = transformJSX(content);
        const escaped = transformed
          .replace(/\\/g, '\\\\')
          .replace(/`/g, '\\`')
          .replace(/\$\{/g, '\\${');
        moduleRegistrations.push(
          `__moduleCode[${JSON.stringify(filePath)}] = function(module, exports, require) {\n${escaped}\n};`
        );
      } catch (err) {
        moduleRegistrations.push(
          `__moduleCode[${JSON.stringify(filePath)}] = function(module, exports, require) { throw new Error(${JSON.stringify('Transform error: ' + err.message)}); };`
        );
      }
    }
  }

  // Detect entry file
  const entryFile =
    fileList.includes('/index.js') ? '/index.js'
    : fileList.includes('/index.jsx') ? '/index.jsx'
    : fileList.includes('/index.tsx') ? '/index.tsx'
    : null;

  const appFile =
    fileList.includes('/App.js') ? '/App.js'
    : fileList.includes('/App.jsx') ? '/App.jsx'
    : fileList.includes('/App.tsx') ? '/App.tsx'
    : fileList[0] || null;

  let entryScript;
  if (entryFile) {
    entryScript = `__require(${JSON.stringify(entryFile)}, '/');`;
  } else if (appFile) {
    entryScript = `
      var _app = __require(${JSON.stringify(appFile)}, '/');
      var _AppComponent = _app.default || _app;
      var _root = ReactDOM.createRoot(document.getElementById('root'));
      _root.render(React.createElement(_AppComponent));
    `;
  } else {
    entryScript = `document.getElementById('root').innerHTML = '<p style="color:#888;padding:16px;">No entry file found. Create App.js or index.js</p>';`;
  }

  const cssStyleTags = cssBlocks.map(css => `<style>${css}</style>`).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: auto; }
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
  var __moduleCode = {};
  var __moduleCache = {};

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
    if (__builtins[specifier]) return { type: 'builtin', key: specifier };
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      if (__builtins[specifier]) return { type: 'builtin', key: specifier };
      return { type: 'empty' };
    }
    var base = specifier.startsWith('/') ? specifier : __resolvePath(from, specifier);
    if (base.endsWith('.css')) return { type: 'css' };
    if (__moduleCode[base]) return { type: 'file', key: base };
    var exts = ['.js', '.jsx', '.ts', '.tsx'];
    for (var i = 0; i < exts.length; i++) {
      if (__moduleCode[base + exts[i]]) return { type: 'file', key: base + exts[i] };
    }
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
    if (__moduleCache[resolved.key]) return __moduleCache[resolved.key].exports;
    var module = { exports: {} };
    __moduleCache[resolved.key] = module;
    try {
      __moduleCode[resolved.key](module, module.exports, function(spec) {
        return __require(spec, resolved.key);
      });
    } catch (err) {
      document.getElementById('root').innerHTML =
        '<pre style="color:#f44;padding:16px;font-size:13px;white-space:pre-wrap;">' + err.toString() + '</pre>';
      throw err;
    }
    return __moduleCache[resolved.key].exports;
  }

  ${moduleRegistrations.join('\n\n')}

  window.onerror = function(msg, src, line, col, err) {
    var message = err ? err.toString() : msg;
    document.getElementById('root').innerHTML =
      '<pre style="color:#f44;padding:16px;font-size:13px;white-space:pre-wrap;">' + message + '</pre>';
  };

  try {
    ${entryScript}
  } catch (err) {
    document.getElementById('root').innerHTML =
      '<pre style="color:#f44;padding:16px;font-size:13px;white-space:pre-wrap;">' + err.toString() + '</pre>';
  }

  // Auto-reload
  (function() {
    var lastCheck = Date.now();
    setInterval(function() {
      fetch('/__poll?since=' + lastCheck).then(function(r) {
        if (r.ok) return r.json();
      }).then(function(data) {
        if (data && data.changed) {
          lastCheck = Date.now();
          location.reload();
        }
      }).catch(function() {});
    }, 2000);
  })();
  <\/script>
</body>
</html>`;
}

let lastModTime = Date.now();

function watchForChanges(projectDir) {
  // Use fs.watch if available, otherwise track via mtime
  try {
    const watcher = fs.watch(projectDir, { recursive: true }, () => {
      lastModTime = Date.now();
    });
    // Clean up after 60 seconds
    setTimeout(() => watcher.close(), 60000);
  } catch {
    // fs.watch not available — clients will poll and we track lastModTime
  }
}

/**
 * Start the dev server.
 * @param {string} projectDir - Absolute path to the project
 * @param {object} emit - { stdout, stderr } functions
 * @param {AbortSignal} signal - Abort signal for cleanup
 * @returns {Promise<number>} Exit code
 */
module.exports.start = function(projectDir, emit, signal) {
  return new Promise(function(resolve) {
    watchForChanges(projectDir);

    const server = http.createServer(function(req, res) {
      const url = req.url.split('?')[0];

      if (url === '/' || url === '/index.html') {
        try {
          const html = buildHTML(projectDir);
          res.writeHead(200, {
            'Content-Type': 'text/html',
            'Cache-Control': 'no-cache',
          });
          res.end(html);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Build error: ' + err.message);
        }
        return;
      }

      if (url === '/__poll') {
        // Simple polling — return changed:true if files changed since last check
        const since = parseInt(req.url.split('since=')[1]) || 0;
        if (lastModTime > since) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ changed: true }));
        } else {
          // Hold for a bit then respond
          setTimeout(function() {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ changed: lastModTime > since }));
          }, 2000);
        }
        return;
      }

      // Serve static files
      const filePath = path.join(projectDir, url);
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const content = fs.readFileSync(filePath);
          const ext = path.extname(filePath);
          const mimeTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
          };
          res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
          res.end(content);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      } catch {
        res.writeHead(500);
        res.end('Server error');
      }
    });

    server.listen(0, function() {
      const port = server.address().port;
      emit.stdout('Dev server running at http://localhost:' + port + '\n');
      emit.stdout('Watching for changes...\n');
    });

    server.on('error', function(err) {
      emit.stderr('Server error: ' + err.message + '\n');
      resolve(1);
    });

    if (signal) {
      signal.addEventListener('abort', function() {
        server.close();
        emit.stdout('Dev server stopped\n');
        resolve(0);
      }, { once: true });
    }
  });
};
