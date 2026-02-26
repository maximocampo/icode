import React, { useState, useEffect, useCallback, useRef } from 'react'
import { EditorProvider } from '../context/EditorContext'
import { theme } from '../styles/theme'
import { FolderIcon, SyncIcon, PlusIcon } from './Icons'
import { readDirRecursive } from '../services/fs'
import { CodeMirrorEditor } from './CodeMirrorEditor'
import { FileTabs } from './FileTabs'
import { FileTree } from './FileTree'
import { Terminal } from './Terminal'
import { LivePreview } from './LivePreview'

interface CodeEditorProps {
  projectDir: string
  projectName: string
  onOpenProjects?: () => void
}

const TerminalIcon = ({ size = 16, color = '#858585' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
    <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25Zm1.75-.25a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V2.75a.25.25 0 0 0-.25-.25ZM7.25 8a.749.749 0 0 1-.22.53l-2.25 2.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L5.44 8 3.72 6.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.25 2.25c.141.14.22.331.22.53Zm1.5 1.5h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1 0-1.5Z" />
  </svg>
)

const GlobeIcon = ({ size = 16, color = '#858585' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={color}>
    <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.78 8.75a9.64 9.64 0 0 0 .2 2.014c.312 1.386.789 2.167 1.272 2.496.17.116.35.2.536.241a6.5 6.5 0 0 0 4.458-3.488.75.75 0 0 0-.32-.292A6.504 6.504 0 0 0 5.78 8.75Zm-.504 0H1.543a6.507 6.507 0 0 0 4.666 5.058c-.544-.652-.974-1.67-1.2-2.906a11.14 11.14 0 0 1-.233-2.152Zm.504-1.5a9.64 9.64 0 0 0-.2-2.014C5.268 3.85 4.79 3.069 4.308 2.74A6.52 6.52 0 0 0 1.543 7.25h3.733Zm1.5 0h3.938A6.52 6.52 0 0 0 8.454 2.012c-.17.116-.35.2-.536.241-.528.087-1.087.766-1.42 2.244a11.14 11.14 0 0 0-.214 2.253ZM8 1.513c.544.652.974 1.67 1.2 2.906.095.422.16.868.2 1.331H6.6c.04-.463.105-.91.2-1.33.226-1.237.656-2.255 1.2-2.907Z" />
  </svg>
)


function EditorLayout({ projectDir, projectName, onReload, onOpenProjects }: {
  projectDir: string
  projectName: string
  onReload: () => void
  onOpenProjects?: () => void
}) {
  const [showSidebar, setShowSidebar] = useState(true)
  const [showPreview, setShowPreview] = useState(false)
  const [showTerminal, setShowTerminal] = useState(true)
  const [creatingFile, setCreatingFile] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Track visual viewport so content shrinks above the keyboard
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const el = containerRef.current
      if (!el) return
      el.style.height = `${vv.height}px`
      el.style.transform = `translateY(${vv.offsetTop}px)`
    }

    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  return (
    <div ref={containerRef} style={styles.container}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.topBarLeft}>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            style={styles.topBarBtn}
            title="Toggle sidebar"
          >
            <FolderIcon size={16} color={showSidebar ? theme.colors.text : theme.colors.textSecondary} />
          </button>
        </div>
        <button
          onClick={onOpenProjects}
          style={styles.projectTitle}
          title="Switch project"
        >
          {projectName}
        </button>
        <div style={styles.topBarRight}>
          <button
            onClick={() => setShowPreview(!showPreview)}
            style={styles.topBarBtn}
            title="Toggle preview"
          >
            <GlobeIcon size={16} color={showPreview ? theme.colors.text : theme.colors.textSecondary} />
          </button>
          <button
            onClick={() => setShowTerminal(!showTerminal)}
            style={styles.topBarBtn}
            title="Toggle terminal"
          >
            <TerminalIcon size={16} color={showTerminal ? theme.colors.text : theme.colors.textSecondary} />
          </button>
          <button onClick={onReload} style={styles.topBarBtn} title="Reload files">
            <SyncIcon size={16} color={theme.colors.textSecondary} />
          </button>
        </div>
      </div>

      {/* Workspace */}
      <div style={styles.workspace}>
        {/* Sidebar */}
        {showSidebar && (
          <div style={styles.sidebar} className="scrollable">
            <div style={styles.sidebarHeader}>
              <span style={styles.sidebarTitle}>EXPLORER</span>
              <button
                onClick={() => setCreatingFile(true)}
                style={styles.topBarBtn}
                title="New file"
              >
                <PlusIcon size={14} color={theme.colors.textSecondary} />
              </button>
            </div>
            <FileTree
              creatingFile={creatingFile}
              onCreateDone={() => setCreatingFile(false)}
            />
          </div>
        )}

        {/* Main area */}
        <div style={styles.mainArea}>
          {/* Editor + Preview row */}
          <div style={styles.editorRow}>
            {/* Editor panel */}
            <div style={styles.editorPanel}>
              <FileTabs />
              <CodeMirrorEditor style={{ flex: 1, minHeight: 0 }} />
            </div>

            {/* Preview panel */}
            {showPreview && (
              <div style={styles.previewPanel}>
                <LivePreview style={{ flex: 1, minHeight: 0 }} />
              </div>
            )}
          </div>

          {/* Terminal panel — always mounted, hidden with CSS */}
          <div style={{
            ...styles.terminalPanel,
            display: showTerminal ? 'flex' : 'none',
          }}>
            <div style={styles.terminalHeader}>
              <span style={styles.terminalHeaderLabel}>TERMINAL</span>
              <button
                onClick={() => setShowTerminal(false)}
                style={styles.topBarBtn}
                title="Hide terminal"
              >
                <span style={{ fontSize: 14, color: theme.colors.textSecondary }}>&#x2715;</span>
              </button>
            </div>
            <div style={styles.terminalContent}>
              <Terminal projectDir={projectDir} onFilesChanged={onReload} />
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div style={styles.statusBar}>
        <span style={styles.statusItem}>icode</span>
        <div style={{ flex: 1 }} />
        <span style={styles.statusItem}>{projectName}</span>
      </div>
    </div>
  )
}

export function CodeEditor({ projectDir, projectName, onOpenProjects }: CodeEditorProps) {
  const [files, setFiles] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasMountedRef = useRef(false)

  const loadFiles = useCallback(async () => {
    if (!projectDir) return
    if (!hasMountedRef.current) {
      setLoading(true)
    }
    setError(null)
    try {
      const fileList = await readDirRecursive(projectDir)
      const filesMap: Record<string, string> = {}
      for (const f of fileList) {
        filesMap[f.path] = f.content
      }
      setFiles(filesMap)
      hasMountedRef.current = true
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [projectDir])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.centered}>
          <p style={styles.loadingText}>Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.centered}>
          <p style={styles.errorText}>{error}</p>
          <button onClick={loadFiles} style={styles.retryBtn}>Retry</button>
        </div>
      </div>
    )
  }

  const effectiveFiles = files || {}

  return (
    <EditorProvider initialFiles={effectiveFiles} projectDir={projectDir}>
      <EditorLayout
        projectDir={projectDir}
        projectName={projectName}
        onReload={loadFiles}
        onOpenProjects={onOpenProjects}
      />
    </EditorProvider>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: theme.colors.bg,
    overflow: 'hidden',
  },
  // Top bar
  topBar: {
    display: 'flex',
    alignItems: 'center',
    height: 36,
    background: theme.colors.bgTertiary,
    borderBottom: `1px solid ${theme.colors.border}`,
    flexShrink: 0,
    padding: '0 4px',
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  topBarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  projectTitle: {
    flex: 1,
    textAlign: 'center',
    background: 'none',
    border: 'none',
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.font.sans,
    fontWeight: 500,
    cursor: 'pointer',
    padding: '4px 8px',
  },
  topBarBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    background: 'none',
    border: 'none',
    borderRadius: theme.radius.sm,
    cursor: 'pointer',
  },
  // Workspace
  workspace: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
  },
  // Sidebar
  sidebar: {
    width: 220,
    flexShrink: 0,
    background: theme.colors.bgSecondary,
    borderRight: `1px solid ${theme.colors.border}`,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarHeader: {
    padding: '8px 8px 4px 12px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sidebarTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: theme.colors.textSecondary,
    fontFamily: theme.font.sans,
    letterSpacing: '0.5px',
  },
  // Main area
  mainArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
  // Editor + Preview row
  editorRow: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
  },
  editorPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
  previewPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    borderLeft: `1px solid ${theme.colors.border}`,
  },
  // Terminal
  terminalPanel: {
    height: 200,
    flexShrink: 0,
    flexDirection: 'column',
    borderTop: `1px solid ${theme.colors.border}`,
    overflow: 'hidden',
  },
  terminalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 28,
    padding: '0 8px',
    background: theme.colors.bgSecondary,
    borderBottom: `1px solid ${theme.colors.border}`,
    flexShrink: 0,
  },
  terminalHeaderLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: theme.colors.textSecondary,
    fontFamily: theme.font.sans,
    letterSpacing: '0.5px',
  },
  terminalContent: {
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },
  // Status bar
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    height: 22,
    background: theme.colors.accent,
    padding: '0 8px',
    flexShrink: 0,
  },
  statusItem: {
    fontSize: 11,
    color: '#fff',
    fontFamily: theme.font.sans,
  },
  // Loading/error states
  centered: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    fontFamily: theme.font.sans,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.md,
    fontFamily: theme.font.sans,
    marginBottom: theme.spacing.md,
  },
  retryBtn: {
    padding: '6px 16px',
    background: theme.colors.accent,
    border: 'none',
    borderRadius: theme.radius.sm,
    color: 'white',
    fontSize: theme.fontSize.sm,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
