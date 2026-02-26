import React, { useState } from 'react'
import * as gitService from '../services/git'

interface GitPanelProps {
  projectDir: string
  onRefresh: () => void
}

export function GitPanel({ projectDir, onRefresh }: GitPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [commitMsg, setCommitMsg] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [status, setStatus] = useState<Array<{ file: string; status: string }>>([])
  const [showClone, setShowClone] = useState(false)

  const refreshStatus = async () => {
    try {
      const isRepo = await gitService.isGitRepo(projectDir)
      if (isRepo) {
        const s = await gitService.status(projectDir)
        setStatus(s)
      }
    } catch (err) {
      console.error('Failed to get status:', err)
    }
  }

  const handleClone = async () => {
    if (!cloneUrl) return
    setLoading(true)
    setMessage('Cloning...')
    try {
      const repoName = cloneUrl.split('/').pop()?.replace('.git', '') || 'project'
      const dir = `/projects/${repoName}`
      
      await gitService.clone({
        url: cloneUrl,
        dir,
        credentials: credentials.username ? credentials : undefined,
        onProgress: (p) => setMessage(`${p.phase}: ${p.loaded}/${p.total || '?'}`),
      })
      
      setMessage('Cloned successfully!')
      setCloneUrl('')
      setShowClone(false)
      onRefresh()
    } catch (err: any) {
      setMessage(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePull = async () => {
    setLoading(true)
    setMessage('Pulling...')
    try {
      await gitService.pull(
        projectDir,
        credentials.username ? credentials : undefined
      )
      setMessage('Pulled successfully!')
      onRefresh()
      refreshStatus()
    } catch (err: any) {
      setMessage(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCommit = async () => {
    if (!commitMsg) return
    setLoading(true)
    setMessage('Committing...')
    try {
      await gitService.addAll(projectDir)
      await gitService.commit({
        dir: projectDir,
        message: commitMsg,
        author: { name: 'Mobile IDE', email: 'mobile-ide@local' },
      })
      setMessage('Committed!')
      setCommitMsg('')
      refreshStatus()
    } catch (err: any) {
      setMessage(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePush = async () => {
    if (!credentials.username || !credentials.password) {
      setMessage('Credentials required for push')
      return
    }
    setLoading(true)
    setMessage('Pushing...')
    try {
      await gitService.push(projectDir, credentials)
      setMessage('Pushed successfully!')
    } catch (err: any) {
      setMessage(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    if (isOpen && projectDir) {
      refreshStatus()
    }
  }, [isOpen, projectDir])

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} style={styles.toggleBtn}>
        Git
      </button>
    )
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span>Git</span>
        <button onClick={() => setIsOpen(false)} style={styles.closeBtn}>×</button>
      </div>

      {message && <div style={styles.message}>{message}</div>}

      {/* Credentials */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Credentials (for private repos)</div>
        <input
          placeholder="Username"
          value={credentials.username}
          onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
          style={styles.input}
        />
        <input
          placeholder="Token/Password"
          type="password"
          value={credentials.password}
          onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
          style={styles.input}
        />
      </div>

      {/* Clone */}
      {showClone ? (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Clone Repository</div>
          <input
            placeholder="https://github.com/user/repo.git"
            value={cloneUrl}
            onChange={(e) => setCloneUrl(e.target.value)}
            style={styles.input}
          />
          <div style={styles.btnRow}>
            <button onClick={handleClone} disabled={loading} style={styles.btn}>
              Clone
            </button>
            <button onClick={() => setShowClone(false)} style={styles.btnSecondary}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowClone(true)} style={styles.btn}>
          Clone Repo
        </button>
      )}

      {/* Status */}
      {status.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Changes</div>
          {status.map((s) => (
            <div key={s.file} style={styles.statusItem}>
              <span style={{ color: s.status === 'added' ? '#4caf50' : s.status === 'deleted' ? '#f44336' : '#ffeb3b' }}>
                {s.status[0].toUpperCase()}
              </span>
              {' '}{s.file}
            </div>
          ))}
        </div>
      )}

      {/* Commit */}
      <div style={styles.section}>
        <input
          placeholder="Commit message"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          style={styles.input}
        />
        <button onClick={handleCommit} disabled={loading || !commitMsg} style={styles.btn}>
          Commit
        </button>
      </div>

      {/* Pull / Push */}
      <div style={styles.btnRow}>
        <button onClick={handlePull} disabled={loading} style={styles.btn}>
          Pull
        </button>
        <button onClick={handlePush} disabled={loading} style={styles.btn}>
          Push
        </button>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  toggleBtn: {
    position: 'fixed',
    bottom: 10,
    right: 10,
    padding: '8px 16px',
    background: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    zIndex: 1000,
  },
  panel: {
    position: 'fixed',
    bottom: 0,
    right: 0,
    width: 300,
    maxHeight: '60vh',
    background: '#252526',
    borderTopLeftRadius: 8,
    padding: 12,
    overflowY: 'auto',
    zIndex: 1000,
    boxShadow: '-2px -2px 10px rgba(0,0,0,0.3)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    fontWeight: 'bold',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#fff',
    fontSize: 20,
    cursor: 'pointer',
  },
  message: {
    padding: 8,
    marginBottom: 8,
    background: '#333',
    borderRadius: 4,
    fontSize: 12,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    padding: 8,
    marginBottom: 6,
    background: '#1e1e1e',
    border: '1px solid #444',
    borderRadius: 4,
    color: '#fff',
    fontSize: 13,
  },
  btn: {
    padding: '6px 12px',
    background: '#0e639c',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    marginRight: 6,
  },
  btnSecondary: {
    padding: '6px 12px',
    background: '#444',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  btnRow: {
    display: 'flex',
    gap: 6,
  },
  statusItem: {
    fontSize: 12,
    padding: '2px 0',
    fontFamily: 'monospace',
  },
}
