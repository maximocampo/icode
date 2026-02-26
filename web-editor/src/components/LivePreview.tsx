import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useEditor } from '../context/EditorContext'
import { buildPreviewHtml, BuildError } from '../services/transpiler'
import { theme } from '../styles/theme'
import { SyncIcon } from './Icons'

type PreviewMode = 'idle' | 'sucrase' | 'devserver'

export function LivePreview({ style }: { style?: React.CSSProperties }) {
  const { files } = useEditor()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const devIframeRef = useRef<HTMLIFrameElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<PreviewMode>('idle')
  const [devServerUrl, setDevServerUrl] = useState<string | null>(null)
  const filesRef = useRef(files)
  filesRef.current = files

  // Auto-start sucrase preview if project has files
  useEffect(() => {
    if (mode === 'idle' && Object.keys(files).length > 0) {
      const hasCode = Object.keys(files).some(f => /\.[jt]sx?$/.test(f))
      if (hasCode) {
        setMode('sucrase')
      }
    }
  }, [files, mode])

  const build = useCallback(() => {
    try {
      const html = buildPreviewHtml(filesRef.current)
      setError(null)
      if (iframeRef.current) {
        iframeRef.current.srcdoc = html
      }
    } catch (err: any) {
      if (err instanceof BuildError) {
        setError(`${err.file}:${err.line} — ${err.message}`)
      } else {
        setError(err.message || String(err))
      }
    }
  }, [])

  // Build on mount (Sucrase mode)
  useEffect(() => {
    if (mode === 'sucrase') build()
  }, [build, mode])

  // Rebuild on file changes (debounced, Sucrase mode only)
  useEffect(() => {
    if (mode !== 'sucrase') return
    const timeout = setTimeout(() => build(), 400)
    return () => clearTimeout(timeout)
  }, [files, build, mode])

  // Listen for dev server URLs from Node.js stdout
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      let msg: any
      try {
        msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch { return }

      if (msg.type === 'stdout' && typeof msg.data === 'string') {
        const urlMatch = msg.data.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d+/)
        if (urlMatch) {
          const url = urlMatch[0].replace('0.0.0.0', 'localhost')
          setDevServerUrl(url)
          setMode('devserver')
        }
      }

      if (msg.type === 'preview-error') {
        setError(msg.message)
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const handleRefresh = () => {
    if (mode === 'devserver' && devIframeRef.current && devServerUrl) {
      devIframeRef.current.src = devServerUrl
    } else if (mode === 'sucrase') {
      build()
    }
  }

  const displayUrl = mode === 'devserver' && devServerUrl
    ? devServerUrl
    : mode === 'sucrase'
    ? 'preview://local'
    : ''

  return (
    <div style={{ ...styles.container, ...style }}>
      {/* Browser toolbar */}
      <div style={styles.toolbar}>
        <button onClick={handleRefresh} style={styles.navBtn} title="Refresh">
          <SyncIcon size={12} color={theme.colors.textSecondary} />
        </button>
        <div style={styles.urlBar}>
          <span style={styles.urlText}>{displayUrl}</span>
        </div>
      </div>

      {/* Idle state */}
      {mode === 'idle' && (
        <div style={styles.idle}>
          <p style={styles.idleText}>Run <code style={styles.code}>npm start</code> to preview</p>
          <p style={styles.idleHint}>or write code to see instant preview</p>
        </div>
      )}

      {/* Sucrase preview iframe */}
      <iframe
        ref={iframeRef}
        style={{
          ...styles.iframe,
          display: mode === 'sucrase' ? 'block' : 'none',
        }}
        title="Preview"
        sandbox="allow-scripts allow-same-origin"
      />

      {/* Dev server iframe */}
      {mode === 'devserver' && devServerUrl && (
        <iframe
          ref={devIframeRef}
          src={devServerUrl}
          style={styles.iframe}
          title="Dev Server Preview"
        />
      )}

      {/* Error overlay */}
      {error && (
        <div style={styles.errorOverlay}>
          <div style={styles.errorHeader}>
            <span style={styles.errorTitle}>Error</span>
            <button onClick={() => setError(null)} style={styles.errorDismiss}>&times;</button>
          </div>
          <pre style={styles.errorMessage}>{error}</pre>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '0 6px',
    height: 30,
    background: theme.colors.bgSecondary,
    borderBottom: `1px solid ${theme.colors.border}`,
    flexShrink: 0,
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    background: 'none',
    border: 'none',
    borderRadius: theme.radius.sm,
    cursor: 'pointer',
    flexShrink: 0,
  },
  urlBar: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    height: 22,
    padding: '0 8px',
    background: theme.colors.bg,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
  },
  urlText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontFamily: theme.font.mono,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  idle: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    background: theme.colors.bg,
  },
  idleText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
    fontFamily: theme.font.sans,
  },
  idleHint: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
    fontFamily: theme.font.sans,
  },
  code: {
    padding: '1px 4px',
    background: theme.colors.bgTertiary,
    borderRadius: 2,
    fontFamily: theme.font.mono,
    fontSize: 11,
  },
  iframe: {
    flex: 1,
    border: 'none',
    background: '#fff',
    width: '100%',
  },
  errorOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '60%',
    background: 'rgba(30, 30, 30, 0.97)',
    borderTop: `2px solid ${theme.colors.danger}`,
    overflow: 'auto',
    zIndex: 10,
  },
  errorHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 8px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  errorTitle: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontWeight: 600,
    fontFamily: theme.font.sans,
  },
  errorDismiss: {
    background: 'none',
    border: 'none',
    color: theme.colors.textSecondary,
    fontSize: 16,
    cursor: 'pointer',
    lineHeight: 1,
  },
  errorMessage: {
    padding: '4px 8px',
    color: theme.colors.text,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.font.mono,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
  },
}
