import React, { useState, useEffect } from 'react'
import { ProjectList } from './components/ProjectList'
import { CodeEditor } from './components/CodeEditor'
import { CloneModal } from './components/CloneModal'
import { theme } from './styles/theme'
import { listProjects, ensureDir } from './services/fs'
import { bridge } from './services/bridge'

export default function App() {
  const [currentProject, setCurrentProject] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [ready, setReady] = useState(false)
  const [showProjects, setShowProjects] = useState(false)
  const [showCloneModal, setShowCloneModal] = useState(false)

  // Initialize
  useEffect(() => {
    async function init() {
      await ensureDir('/projects')
      const projects = await listProjects()

      if (projects.length > 0) {
        setCurrentProject(projects[0])
      } else {
        setShowProjects(true)
      }

      setReady(true)
      bridge.ready()
    }
    init()
  }, [])

  const handleSelectProject = (name: string) => {
    setCurrentProject(name)
    setShowProjects(false)
    setRefreshKey((k) => k + 1)
    bridge.projectChanged(name)
  }

  const handleCloned = (name: string) => {
    setShowCloneModal(false)
    handleSelectProject(name)
  }

  if (!ready) {
    return (
      <div style={styles.loading}>
        <p style={styles.loadingText}>icode</p>
      </div>
    )
  }

  return (
    <div style={styles.app}>
      {currentProject ? (
        <CodeEditor
          key={`${currentProject}-${refreshKey}`}
          projectDir={`/projects/${currentProject}`}
          projectName={currentProject}
          onOpenProjects={() => setShowProjects(true)}
        />
      ) : (
        <div style={styles.empty}>
          <p style={styles.emptyText}>No project open</p>
          <button onClick={() => setShowProjects(true)} style={styles.openBtn}>
            Open Project
          </button>
        </div>
      )}

      {/* Project switcher overlay */}
      {showProjects && (
        <div style={styles.overlay}>
          <div style={styles.overlayContent}>
            <ProjectList
              currentProject={currentProject}
              onSelect={handleSelectProject}
              onClone={() => setShowCloneModal(true)}
              onClose={() => setShowProjects(false)}
            />
          </div>
        </div>
      )}

      {showCloneModal && (
        <CloneModal
          onClose={() => setShowCloneModal(false)}
          onCloned={handleCloned}
        />
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    overflow: 'hidden',
    background: theme.colors.bg,
    position: 'relative',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: theme.colors.bg,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xl,
    fontFamily: theme.font.sans,
    fontWeight: 300,
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
    fontFamily: theme.font.sans,
  },
  openBtn: {
    padding: '8px 20px',
    background: theme.colors.accent,
    border: 'none',
    borderRadius: theme.radius.sm,
    color: '#fff',
    fontSize: theme.fontSize.sm,
    fontFamily: theme.font.sans,
    fontWeight: 500,
    cursor: 'pointer',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  overlayContent: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    background: theme.colors.bgSecondary,
    border: `1px solid ${theme.colors.border}`,
    display: 'flex',
    flexDirection: 'column',
  },
}
