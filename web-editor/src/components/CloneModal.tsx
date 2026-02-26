import React, { useState } from 'react'
import { theme } from '../styles/theme'
import { XIcon, GitBranchIcon } from './Icons'
import * as gitService from '../services/git'

interface CloneModalProps {
  onClose: () => void
  onCloned: (projectName: string) => void
}

export function CloneModal({ onClose, onCloned }: CloneModalProps) {
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  const handleClone = async () => {
    if (!url.trim()) return
    
    setLoading(true)
    setError('')
    setProgress('Connecting...')
    
    try {
      const repoName = url.split('/').pop()?.replace('.git', '') || 'project'
      const dir = `/projects/${repoName}`
      
      await gitService.clone({
        url,
        dir,
        credentials: username ? { username, password } : undefined,
        onProgress: (p) => {
          setProgress(`${p.phase}: ${Math.round((p.loaded / (p.total || 1)) * 100)}%`)
        },
      })
      
      onCloned(repoName)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      setProgress('')
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <GitBranchIcon size={20} color={theme.colors.accentBlue} />
          <h2 style={styles.title}>Clone Repository</h2>
          <button onClick={onClose} style={styles.closeBtn}>
            <XIcon size={20} color={theme.colors.textSecondary} />
          </button>
        </div>

        <div style={styles.content}>
          <div style={styles.field}>
            <label style={styles.label}>Repository URL</label>
            <input
              autoFocus
              placeholder="https://github.com/user/repo.git"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.divider}>
            <span style={styles.dividerText}>Authentication (optional)</span>
          </div>

          <div style={styles.row}>
            <div style={{ ...styles.field, flex: 1 }}>
              <input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={{ ...styles.field, flex: 1 }}>
              <input
                placeholder="Token"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={styles.input}
              />
            </div>
          </div>

          {error && <div style={styles.error}>{error}</div>}
          {progress && <div style={styles.progress}>{progress}</div>}

          <button
            onClick={handleClone}
            disabled={!url.trim() || loading}
            style={{
              ...styles.cloneBtn,
              opacity: !url.trim() || loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Cloning...' : 'Clone Repository'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    zIndex: 100,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    background: theme.colors.bgSecondary,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  title: {
    flex: 1,
    margin: 0,
    fontSize: theme.fontSize.lg,
    fontWeight: 600,
    color: theme.colors.text,
  },
  closeBtn: {
    padding: theme.spacing.xs,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  content: {
    padding: theme.spacing.md,
  },
  field: {
    marginBottom: theme.spacing.md,
  },
  label: {
    display: 'block',
    marginBottom: theme.spacing.xs,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  input: {
    width: '100%',
    padding: theme.spacing.sm,
    background: theme.colors.bg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.font.sans,
    outline: 'none',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: `${theme.spacing.md}px 0`,
  },
  dividerText: {
    padding: `0 ${theme.spacing.sm}px`,
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
    background: theme.colors.bgSecondary,
    position: 'relative',
  },
  row: {
    display: 'flex',
    gap: theme.spacing.sm,
  },
  error: {
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    background: 'rgba(248, 81, 73, 0.15)',
    borderRadius: theme.radius.sm,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
  },
  progress: {
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    background: theme.colors.bg,
    borderRadius: theme.radius.sm,
    color: theme.colors.accentBlue,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  cloneBtn: {
    width: '100%',
    padding: theme.spacing.md,
    background: theme.colors.accent,
    border: 'none',
    borderRadius: theme.radius.sm,
    color: 'white',
    fontSize: theme.fontSize.md,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
