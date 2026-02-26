import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useEditor } from '../context/EditorContext'
import { theme } from '../styles/theme'

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
}

function buildTree(files: Record<string, string>): TreeNode[] {
  const root: TreeNode[] = []

  const sorted = Object.keys(files).sort()

  for (const filePath of sorted) {
    const parts = filePath.split('/').filter(Boolean)
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const isLast = i === parts.length - 1
      const partialPath = '/' + parts.slice(0, i + 1).join('/')

      let existing = current.find(n => n.name === name)
      if (!existing) {
        existing = {
          name,
          path: partialPath,
          isDir: !isLast,
          children: [],
        }
        current.push(existing)
      }
      current = existing.children
    }
  }

  return root
}

function FileTreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const { activeFile, setActiveFile } = useEditor()
  const [expanded, setExpanded] = useState(true)
  const isActive = !node.isDir && node.path === activeFile

  const handleClick = () => {
    if (node.isDir) {
      setExpanded(!expanded)
    } else {
      setActiveFile(node.path)
    }
  }

  return (
    <>
      <div
        onClick={handleClick}
        style={{
          ...styles.item,
          paddingLeft: 8 + depth * 12,
          background: isActive ? theme.colors.bgTertiary : 'transparent',
          color: isActive ? theme.colors.text : theme.colors.textSecondary,
        }}
      >
        {node.isDir && (
          <span style={{ ...styles.arrow, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            &#9656;
          </span>
        )}
        {!node.isDir && <span style={styles.arrow} />}
        <span style={{
          ...styles.icon,
          color: node.isDir ? theme.colors.accentBlue : fileColor(node.name),
        }}>
          {node.isDir ? (expanded ? '📂' : '📁') : fileEmoji(node.name)}
        </span>
        <span style={styles.name}>{node.name}</span>
      </div>
      {node.isDir && expanded && node.children.map(child => (
        <FileTreeItem key={child.path} node={child} depth={depth + 1} />
      ))}
    </>
  )
}

function fileEmoji(name: string): string {
  if (name.match(/\.[jt]sx?$/)) return '📄'
  if (name.endsWith('.css')) return '🎨'
  if (name.endsWith('.html')) return '🌐'
  if (name.endsWith('.json')) return '⚙️'
  if (name.endsWith('.md')) return '📝'
  return '📄'
}

function fileColor(name: string): string {
  if (name.match(/\.tsx?$/)) return '#3178c6'
  if (name.match(/\.jsx?$/)) return '#f7df1e'
  if (name.endsWith('.css')) return '#563d7c'
  if (name.endsWith('.json')) return '#a8a8a8'
  return theme.colors.textSecondary
}

interface FileTreeProps {
  creatingFile?: boolean
  onCreateDone?: () => void
}

export function FileTree({ creatingFile, onCreateDone }: FileTreeProps) {
  const { files, addFile } = useEditor()
  const tree = useMemo(() => buildTree(files), [files])
  const [newFileName, setNewFileName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (creatingFile) {
      setNewFileName('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [creatingFile])

  const handleCreate = () => {
    const trimmed = newFileName.trim()
    if (!trimmed) {
      onCreateDone?.()
      return
    }
    const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`

    if (path in files) {
      // File exists — just open it
      addFile(path, files[path])
    } else {
      addFile(path, '')
    }

    setNewFileName('')
    onCreateDone?.()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreate()
    } else if (e.key === 'Escape') {
      setNewFileName('')
      onCreateDone?.()
    }
  }

  return (
    <div style={styles.container} className="scrollable">
      {creatingFile && (
        <div style={styles.createInput}>
          <input
            ref={inputRef}
            value={newFileName}
            onChange={e => setNewFileName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleCreate}
            placeholder="filename.ts"
            style={styles.input}
            spellCheck={false}
            autoCapitalize="off"
          />
        </div>
      )}
      {tree.length === 0 && !creatingFile ? (
        <div style={styles.emptyState}>
          <span style={styles.emptyText}>No files yet</span>
          <span style={styles.emptyHint}>Tap + to create a file</span>
        </div>
      ) : (
        tree.map(node => (
          <FileTreeItem key={node.path} node={node} depth={0} />
        ))
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    overflow: 'auto',
    flex: 1,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '5px 8px',
    cursor: 'pointer',
    fontSize: theme.fontSize.xs,
    fontFamily: theme.font.sans,
    whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  arrow: {
    display: 'inline-block',
    width: 10,
    fontSize: 10,
    textAlign: 'center',
    transition: 'transform 0.15s ease',
    flexShrink: 0,
  },
  icon: {
    fontSize: 12,
    flexShrink: 0,
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  createInput: {
    padding: '4px 8px',
  },
  input: {
    width: '100%',
    background: theme.colors.bg,
    border: `1px solid ${theme.colors.accent}`,
    borderRadius: theme.radius.sm,
    color: theme.colors.text,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.font.sans,
    padding: '3px 6px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 12px',
    gap: 4,
  },
  emptyText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontFamily: theme.font.sans,
  },
  emptyHint: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontFamily: theme.font.sans,
  },
}
