import React, { useState, useRef, useEffect, useCallback } from 'react'
import { theme } from '../styles/theme'
import { pfs, ensureDir } from '../services/fs'
import * as gitService from '../services/git'
import * as nodebridge from '../services/nodebridge'
import { syncProjectToNative, syncFromNative } from '../services/filesync'

interface TerminalProps {
  projectDir: string
  onFilesChanged?: () => void
}

interface Line {
  text: string
  type: 'input' | 'output' | 'error' | 'info'
}

export function Terminal({ projectDir, onFilesChanged }: TerminalProps) {
  const [lines, setLines] = useState<Line[]>([
    { text: `icode terminal — type "help" for commands`, type: 'info' },
  ])
  const [input, setInput] = useState('')
  const [cwd, setCwd] = useState(projectDir)
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [running, setRunning] = useState(false)
  const [activeProcessId, setActiveProcessId] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  // Update cwd when project changes
  useEffect(() => {
    setCwd(projectDir)
  }, [projectDir])

  const addLines = useCallback((newLines: Line[]) => {
    setLines(prev => [...prev, ...newLines])
  }, [])

  const resolvePath = useCallback((path: string): string => {
    if (path.startsWith('/')) return path
    if (path === '..') {
      const parts = cwd.split('/')
      parts.pop()
      return parts.join('/') || '/'
    }
    if (path.startsWith('./')) path = path.slice(2)
    return `${cwd}/${path}`.replace(/\/+/g, '/')
  }, [cwd])

  const handleStop = useCallback(async () => {
    if (activeProcessId) {
      try {
        await nodebridge.kill(activeProcessId)
      } catch {}
      setActiveProcessId(null)
      setRunning(false)
      addLines([{ text: '^C', type: 'error' }])
    }
  }, [activeProcessId, addLines])

  const runCommand = useCallback(async (cmd: string) => {
    const trimmed = cmd.trim()
    if (!trimmed) return

    addLines([{ text: `$ ${trimmed}`, type: 'input' }])
    setHistory(prev => [...prev, trimmed])
    setHistoryIdx(-1)
    setRunning(true)

    try {
      const parts = trimmed.split(/\s+/)
      const command = parts[0]
      const args = parts.slice(1)

      switch (command) {
        case 'help':
          addLines([
            { text: 'Commands:', type: 'info' },
            { text: '  ls, cat, pwd, cd, mkdir, rm, touch', type: 'output' },
            { text: '  git status/add/commit/log/branch/remote/init', type: 'output' },
            { text: '  npm install/init/start/run, node, npx', type: 'output' },
            { text: '  clear, help', type: 'output' },
          ])
          break

        case 'clear':
          setLines([])
          break

        case 'pwd':
          addLines([{ text: cwd, type: 'output' }])
          break

        case 'cd': {
          if (!args[0] || args[0] === '~') {
            setCwd(projectDir)
            break
          }
          const target = resolvePath(args[0])
          try {
            const stat = await pfs.stat(target)
            if (stat.isDirectory()) {
              setCwd(target)
            } else {
              addLines([{ text: `cd: not a directory: ${args[0]}`, type: 'error' }])
            }
          } catch {
            addLines([{ text: `cd: no such directory: ${args[0]}`, type: 'error' }])
          }
          break
        }

        case 'ls': {
          const target = args[0] ? resolvePath(args[0]) : cwd
          try {
            const entries = await pfs.readdir(target)
            const detailed: string[] = []
            for (const entry of entries) {
              try {
                const stat = await pfs.stat(`${target}/${entry}`)
                detailed.push(stat.isDirectory() ? `${entry}/` : entry)
              } catch {
                detailed.push(entry)
              }
            }
            if (detailed.length === 0) {
              addLines([{ text: '(empty directory)', type: 'info' }])
            } else {
              addLines(detailed.map(d => ({ text: d, type: 'output' as const })))
            }
          } catch {
            addLines([{ text: `ls: cannot access '${args[0] || cwd}'`, type: 'error' }])
          }
          break
        }

        case 'cat': {
          if (!args[0]) { addLines([{ text: 'usage: cat <file>', type: 'error' }]); break }
          const target = resolvePath(args[0])
          try {
            const content = await pfs.readFile(target, { encoding: 'utf8' }) as string
            addLines(content.split('\n').map(line => ({ text: line, type: 'output' as const })))
          } catch {
            addLines([{ text: `cat: ${args[0]}: No such file`, type: 'error' }])
          }
          break
        }

        case 'mkdir': {
          if (!args[0]) { addLines([{ text: 'usage: mkdir <dir>', type: 'error' }]); break }
          try {
            await ensureDir(resolvePath(args[0]))
            addLines([{ text: `Created ${args[0]}`, type: 'info' }])
          } catch (e: any) {
            addLines([{ text: `mkdir: ${e.message}`, type: 'error' }])
          }
          break
        }

        case 'rm': {
          if (!args[0]) { addLines([{ text: 'usage: rm <file>', type: 'error' }]); break }
          try {
            await pfs.unlink(resolvePath(args[0]))
            addLines([{ text: `Removed ${args[0]}`, type: 'info' }])
          } catch {
            addLines([{ text: `rm: ${args[0]}: No such file`, type: 'error' }])
          }
          break
        }

        case 'touch': {
          if (!args[0]) { addLines([{ text: 'usage: touch <file>', type: 'error' }]); break }
          try {
            await pfs.writeFile(resolvePath(args[0]), '', 'utf8')
            addLines([{ text: `Created ${args[0]}`, type: 'info' }])
            onFilesChanged?.()
          } catch (e: any) {
            addLines([{ text: `touch: ${e.message}`, type: 'error' }])
          }
          break
        }

        case 'git':
          await handleGit(args)
          break

        case 'npm':
        case 'npx':
        case 'node':
        case 'yarn':
        case 'pnpm':
        case 'bun': {
          if (!nodebridge.isAvailable()) {
            addLines([{ text: `${command} requires the native runtime`, type: 'error' }])
            break
          }

          const projectName = projectDir.split('/').filter(Boolean).pop() || 'project'

          try {
            if (!nodebridge.isReady()) {
              addLines([{ text: 'Waiting for Node.js runtime...', type: 'info' }])
              await nodebridge.waitForReady()
            }

            addLines([{ text: 'Syncing files...', type: 'info' }])
            const nativeCwd = await syncProjectToNative(projectDir, projectName)

            const { promise, processId } = nodebridge.exec(
              command,
              args,
              nativeCwd,
              (output) => {
                const outputLines = output.split('\n').filter(l => l.length > 0)
                addLines(outputLines.map(l => ({ text: l, type: 'output' as const })))
                // Forward stdout to LivePreview for dev server URL detection
                window.postMessage(JSON.stringify({ type: 'stdout', data: output }), '*')
              }
            )

            setActiveProcessId(processId)
            const exitCode = await promise
            setActiveProcessId(null)

            if (exitCode !== 0) {
              addLines([{ text: `Process exited with code ${exitCode}`, type: 'error' }])
            }

            // Sync native changes back to IndexedDB
            try {
              const synced = await syncFromNative(projectDir, projectName)
              if (synced.length > 0) {
                addLines([{ text: `Synced ${synced.length} file(s)`, type: 'info' }])
                onFilesChanged?.()
              }
            } catch {
              // Non-fatal
            }
          } catch (err: any) {
            addLines([{ text: `Error: ${err.message}`, type: 'error' }])
          }
          break
        }

        default:
          addLines([{ text: `command not found: ${command}`, type: 'error' }])
      }
    } catch (e: any) {
      addLines([{ text: e.message || 'Unknown error', type: 'error' }])
    } finally {
      setRunning(false)
      setActiveProcessId(null)
    }
  }, [cwd, projectDir, addLines, resolvePath, onFilesChanged])

  const handleGit = useCallback(async (args: string[]) => {
    const sub = args[0]
    const dir = projectDir

    switch (sub) {
      case 'status': {
        try {
          const changes = await gitService.status(dir)
          if (changes.length === 0) {
            addLines([{ text: 'nothing to commit, working tree clean', type: 'info' }])
          } else {
            addLines(changes.map(c => ({
              text: `  ${c.status.padEnd(10)} ${c.file}`,
              type: (c.status === 'added' ? 'info' : c.status === 'deleted' ? 'error' : 'output') as Line['type'],
            })))
          }
        } catch (e: any) {
          addLines([{ text: `fatal: ${e.message}`, type: 'error' }])
        }
        break
      }
      case 'add': {
        try {
          await gitService.addAll(dir)
          addLines([{ text: 'Changes staged', type: 'info' }])
        } catch (e: any) {
          addLines([{ text: `error: ${e.message}`, type: 'error' }])
        }
        break
      }
      case 'commit': {
        const msgIdx = args.indexOf('-m')
        if (msgIdx === -1 || !args[msgIdx + 1]) {
          addLines([{ text: 'usage: git commit -m "message"', type: 'error' }])
          break
        }
        const rawMsg = args.slice(msgIdx + 1).join(' ')
        const message = rawMsg.replace(/^["']|["']$/g, '')
        try {
          const oid = await gitService.commit({ dir, message, author: { name: 'icode', email: 'icode@local' } })
          addLines([{ text: `[${oid.slice(0, 7)}] ${message}`, type: 'info' }])
        } catch (e: any) {
          addLines([{ text: `error: ${e.message}`, type: 'error' }])
        }
        break
      }
      case 'log': {
        try {
          const commits = await gitService.log(dir)
          if (commits.length === 0) {
            addLines([{ text: 'No commits yet', type: 'info' }])
          } else {
            for (const c of commits) {
              addLines([
                { text: `${c.oid} ${c.message}`, type: 'output' },
                { text: `  ${c.author} — ${c.date.toLocaleDateString()}`, type: 'info' },
              ])
            }
          }
        } catch (e: any) {
          addLines([{ text: `error: ${e.message}`, type: 'error' }])
        }
        break
      }
      case 'branch': {
        try {
          const branch = await gitService.currentBranch(dir)
          addLines([{ text: `* ${branch || '(HEAD detached)'}`, type: 'info' }])
        } catch (e: any) {
          addLines([{ text: `error: ${e.message}`, type: 'error' }])
        }
        break
      }
      case 'remote': {
        try {
          const url = await gitService.getRemoteUrl(dir)
          if (url) {
            addLines([{ text: `origin  ${url}`, type: 'output' }])
          } else {
            addLines([{ text: 'No remotes configured', type: 'info' }])
          }
        } catch (e: any) {
          addLines([{ text: `error: ${e.message}`, type: 'error' }])
        }
        break
      }
      case 'init': {
        try {
          await gitService.init(dir)
          addLines([{ text: `Initialized git repository`, type: 'info' }])
        } catch (e: any) {
          addLines([{ text: `error: ${e.message}`, type: 'error' }])
        }
        break
      }
      default:
        addLines([{ text: `git: '${sub}' is not a git command`, type: 'error' }])
    }
  }, [projectDir, addLines])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !running) {
      runCommand(input)
      setInput('')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length === 0) return
      const newIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1)
      setHistoryIdx(newIdx)
      setInput(history[newIdx])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx === -1) return
      const newIdx = historyIdx + 1
      if (newIdx >= history.length) {
        setHistoryIdx(-1)
        setInput('')
      } else {
        setHistoryIdx(newIdx)
        setInput(history[newIdx])
      }
    }
  }

  const shortCwd = cwd.startsWith(projectDir)
    ? '~' + cwd.slice(projectDir.length)
    : cwd

  return (
    <div style={styles.container} onClick={() => inputRef.current?.focus()}>
      <div ref={scrollRef} style={styles.output}>
        {lines.map((line, i) => (
          <div key={i} style={{ ...styles.line, color: lineColor(line.type) }}>
            {line.text || '\u00A0'}
          </div>
        ))}

        {/* Input line */}
        <div style={styles.inputLine}>
          <span style={styles.prompt}>{shortCwd} $</span>
          {running && activeProcessId ? (
            <button onClick={handleStop} style={styles.stopBtn}>Stop</button>
          ) : (
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              style={styles.input}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              disabled={running}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function lineColor(type: Line['type']): string {
  switch (type) {
    case 'input': return theme.colors.accent
    case 'error': return theme.colors.danger
    case 'info': return theme.colors.success
    default: return theme.colors.text
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: theme.colors.bg,
    cursor: 'text',
  },
  output: {
    flex: 1,
    overflow: 'auto',
    padding: '4px 8px',
    WebkitOverflowScrolling: 'touch',
  },
  line: {
    fontFamily: theme.font.mono,
    fontSize: 12,
    lineHeight: '18px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  inputLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 18,
  },
  prompt: {
    fontFamily: theme.font.mono,
    fontSize: 12,
    color: theme.colors.accentPurple,
    flexShrink: 0,
    lineHeight: '18px',
  },
  input: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    color: theme.colors.text,
    fontFamily: theme.font.mono,
    fontSize: 12,
    lineHeight: '18px',
    padding: 0,
    margin: 0,
    caretColor: theme.colors.text,
  },
  stopBtn: {
    padding: '1px 8px',
    background: theme.colors.danger,
    border: 'none',
    borderRadius: theme.radius.sm,
    color: '#fff',
    fontSize: 11,
    fontFamily: theme.font.sans,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
