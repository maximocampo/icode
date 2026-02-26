import React from 'react'
import { useEditor } from '../context/EditorContext'
import { theme } from '../styles/theme'

function fileName(path: string): string {
  return path.split('/').pop() || path
}

function fileIcon(path: string): string {
  if (path.match(/\.[jt]sx?$/)) return 'JS'
  if (path.endsWith('.css')) return 'CS'
  if (path.endsWith('.html')) return 'HT'
  if (path.endsWith('.json')) return '{}'
  return '--'
}

function iconColor(path: string): string {
  if (path.match(/\.tsx?$/)) return '#3178c6'
  if (path.match(/\.jsx?$/)) return '#f7df1e'
  if (path.endsWith('.css')) return '#563d7c'
  if (path.endsWith('.html')) return '#e34c26'
  if (path.endsWith('.json')) return '#a8a8a8'
  return theme.colors.textMuted
}

export function FileTabs() {
  const { openFiles, activeFile, setActiveFile, closeFile } = useEditor()

  if (openFiles.length === 0) return null

  return (
    <div style={styles.container} className="scrollable">
      {openFiles.map((path) => (
        <div
          key={path}
          style={{
            ...styles.tab,
            ...(path === activeFile ? styles.tabActive : {}),
          }}
          onClick={() => setActiveFile(path)}
        >
          <span style={{ ...styles.icon, color: iconColor(path) }}>
            {fileIcon(path)}
          </span>
          <span style={styles.name}>{fileName(path)}</span>
          {openFiles.length > 1 && (
            <button
              style={styles.closeBtn}
              onClick={(e) => { e.stopPropagation(); closeFile(path) }}
            >
              &times;
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    background: theme.colors.bgSecondary,
    borderBottom: `1px solid ${theme.colors.border}`,
    overflowX: 'auto',
    overflowY: 'hidden',
    flexShrink: 0,
    height: 32,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '0 10px',
    height: 32,
    cursor: 'pointer',
    borderRight: `1px solid ${theme.colors.border}`,
    whiteSpace: 'nowrap',
    fontSize: theme.fontSize.xs,
    fontFamily: theme.font.sans,
    color: theme.colors.textSecondary,
    background: theme.colors.bgSecondary,
    flexShrink: 0,
  },
  tabActive: {
    color: theme.colors.text,
    background: theme.colors.bg,
    borderBottom: `1px solid ${theme.colors.bg}`,
    marginBottom: -1,
  },
  icon: {
    fontSize: 9,
    fontWeight: 700,
    fontFamily: theme.font.mono,
    opacity: 0.8,
  },
  name: {
    fontSize: theme.fontSize.xs,
  },
  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    marginLeft: 2,
    background: 'none',
    border: 'none',
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
    borderRadius: 2,
  },
}
