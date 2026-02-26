import React, { useState, useEffect } from 'react'
import { theme } from '../styles/theme'
import { Header } from './Header'
import {
  GitBranchIcon,
  GitCommitIcon,
  DownloadIcon,
  UploadIcon,
} from './Icons'
import * as gitService from '../services/git'

interface GitViewProps {
  projectDir: string
  projectName: string
  onRefresh: () => void
}

interface StatusFile {
  file: string
  status: string
}

interface Commit {
  oid: string
  message: string
  author: string
  date: Date
}

export function GitView({ projectDir, projectName, onRefresh }: GitViewProps) {
  const [branch, setBranch] = useState<string>('')
  const [status, setStatus] = useState<StatusFile[]>([])
  const [commits, setCommits] = useState<Commit[]>([])
  const [commitMsg, setCommitMsg] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [showCredentials, setShowCredentials] = useState(false)

  const loadGitInfo = async () => {
    if (!projectDir) return
    try {
      const isRepo = await gitService.isGitRepo(projectDir)
      if (isRepo) {
        const b = await gitService.currentBranch(projectDir)
        setBranch(b || 'main')
        const s = await gitService.status(projectDir)
        setStatus(s)
        const c = await gitService.log(projectDir, 5)
        setCommits(c)
      }
    } catch (err) {
      console.error('Failed to load git info:', err)
    }
  }

  useEffect(() => {
    loadGitInfo()
  }, [projectDir])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleCommit = async () => {
    if (!commitMsg.trim()) return
    setLoading('commit')
    try {
      await gitService.addAll(projectDir)
      await gitService.commit({
        dir: projectDir,
        message: commitMsg,
        author: { name: 'Mobile IDE', email: 'mobile@ide.local' },
      })
      showMessage('success', 'Changes committed')
      setCommitMsg('')
      await loadGitInfo()
    } catch (err: any) {
      showMessage('error', err.message)
    } finally {
      setLoading(null)
    }
  }

  const handlePull = async () => {
    setLoading('pull')
    try {
      await gitService.pull(projectDir, credentials.username ? credentials : undefined)
      showMessage('success', 'Pulled successfully')
      onRefresh()
      await loadGitInfo()
    } catch (err: any) {
      showMessage('error', err.message)
    } finally {
      setLoading(null)
    }
  }

  const handlePush = async () => {
    if (!credentials.username || !credentials.password) {
      setShowCredentials(true)
      showMessage('error', 'Enter credentials to push')
      return
    }
    setLoading('push')
    try {
      await gitService.push(projectDir, credentials)
      showMessage('success', 'Pushed successfully')
    } catch (err: any) {
      showMessage('error', err.message)
    } finally {
      setLoading(null)
    }
  }

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'added':
        return theme.colors.added
      case 'deleted':
        return theme.colors.deleted
      case 'modified':
        return theme.colors.modified
      default:
        return theme.colors.textSecondary
    }
  }

  const formatDate = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(mins / 60)
    const days = Math.floor(hours / 24)

    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  return (
    <div style={styles.container}>
      <Header
        title="Source Control"
        subtitle={projectName}
      />

      <div style={styles.content}>
        {/* Message toast */}
        {message && (
          <div style={{ ...styles.toast, background: message.type === 'error' ? theme.colors.danger : theme.colors.accent }}>
            {message.text}
          </div>
        )}

        {/* Branch info */}
        <div style={styles.section}>
          <div style={styles.branchCard}>
            <GitBranchIcon size={18} color={theme.colors.accentBlue} />
            <span style={styles.branchName}>{branch || 'main'}</span>
          </div>
        </div>

        {/* Credentials (collapsible) */}
        <div style={styles.section}>
          <button onClick={() => setShowCredentials(!showCredentials)} style={styles.sectionHeader}>
            <span>Authentication</span>
            <span style={styles.sectionToggle}>{showCredentials ? '−' : '+'}</span>
          </button>
          {showCredentials && (
            <div style={styles.sectionContent}>
              <input
                placeholder="GitHub username"
                value={credentials.username}
                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                style={styles.input}
              />
              <input
                placeholder="Personal access token"
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                style={styles.input}
              />
            </div>
          )}
        </div>

        {/* Changes */}
        {status.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              Changes
              <span style={styles.badge}>{status.length}</span>
            </div>
            <div style={styles.changesList}>
              {status.map((s) => (
                <div key={s.file} style={styles.changeItem}>
                  <span style={{ ...styles.changeStatus, color: getStatusColor(s.status) }}>
                    {s.status[0].toUpperCase()}
                  </span>
                  <span style={styles.changeFile}>{s.file}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commit */}
        <div style={styles.section}>
          <textarea
            placeholder="Commit message"
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            style={styles.textarea}
            rows={2}
          />
          <button
            onClick={handleCommit}
            disabled={!commitMsg.trim() || loading === 'commit'}
            style={{
              ...styles.btnPrimary,
              opacity: !commitMsg.trim() || loading ? 0.5 : 1,
            }}
          >
            <GitCommitIcon size={16} color="white" />
            <span>{loading === 'commit' ? 'Committing...' : 'Commit'}</span>
          </button>
        </div>

        {/* Sync actions */}
        <div style={styles.section}>
          <div style={styles.actionRow}>
            <button onClick={handlePull} disabled={!!loading} style={styles.actionBtn}>
              <DownloadIcon size={18} color={theme.colors.text} />
              <span>Pull</span>
            </button>
            <button onClick={handlePush} disabled={!!loading} style={styles.actionBtn}>
              <UploadIcon size={18} color={theme.colors.text} />
              <span>Push</span>
            </button>
          </div>
        </div>

        {/* Recent commits */}
        {commits.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Recent Commits</div>
            <div style={styles.commitsList}>
              {commits.map((c) => (
                <div key={c.oid} style={styles.commitItem}>
                  <div style={styles.commitHeader}>
                    <span style={styles.commitOid}>{c.oid}</span>
                    <span style={styles.commitDate}>{formatDate(c.date)}</span>
                  </div>
                  <span style={styles.commitMsg}>{c.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: theme.colors.bg,
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: theme.spacing.md,
  },
  toast: {
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    borderRadius: theme.radius.sm,
    color: 'white',
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    background: theme.colors.bgSecondary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    cursor: 'pointer',
  },
  sectionToggle: {
    fontSize: theme.fontSize.lg,
    fontWeight: 300,
  },
  sectionContent: {
    padding: theme.spacing.sm,
    background: theme.colors.bgSecondary,
    border: `1px solid ${theme.colors.border}`,
    borderTop: 'none',
    borderRadius: `0 0 ${theme.radius.sm}px ${theme.radius.sm}px`,
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    fontWeight: 600,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badge: {
    padding: '2px 8px',
    background: theme.colors.bgTertiary,
    borderRadius: theme.radius.full,
    fontSize: theme.fontSize.xs,
    color: theme.colors.text,
  },
  branchCard: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    background: theme.colors.bgSecondary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
  },
  branchName: {
    fontSize: theme.fontSize.md,
    fontWeight: 600,
    color: theme.colors.text,
    fontFamily: theme.font.mono,
  },
  input: {
    width: '100%',
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    background: theme.colors.bg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.font.sans,
    outline: 'none',
  },
  textarea: {
    width: '100%',
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    background: theme.colors.bgSecondary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.font.sans,
    outline: 'none',
    resize: 'none',
  },
  btnPrimary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    width: '100%',
    padding: theme.spacing.sm,
    background: theme.colors.accent,
    border: 'none',
    borderRadius: theme.radius.sm,
    color: 'white',
    fontSize: theme.fontSize.sm,
    fontWeight: 600,
    cursor: 'pointer',
  },
  actionRow: {
    display: 'flex',
    gap: theme.spacing.sm,
  },
  actionBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    background: theme.colors.bgSecondary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontWeight: 500,
    cursor: 'pointer',
  },
  changesList: {
    background: theme.colors.bgSecondary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  changeItem: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
    borderBottom: `1px solid ${theme.colors.borderMuted}`,
    fontFamily: theme.font.mono,
    fontSize: theme.fontSize.sm,
  },
  changeStatus: {
    width: 16,
    fontWeight: 600,
  },
  changeFile: {
    color: theme.colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  commitsList: {
    background: theme.colors.bgSecondary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
  },
  commitItem: {
    padding: theme.spacing.md,
    borderBottom: `1px solid ${theme.colors.borderMuted}`,
  },
  commitHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  commitOid: {
    fontFamily: theme.font.mono,
    fontSize: theme.fontSize.xs,
    color: theme.colors.accentBlue,
  },
  commitDate: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
  },
  commitMsg: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    lineHeight: 1.4,
  },
}
