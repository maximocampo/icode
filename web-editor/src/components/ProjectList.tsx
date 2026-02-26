import React, { useState, useEffect } from 'react'
import { theme } from '../styles/theme'
import { PlusIcon, TrashIcon, GitBranchIcon, XIcon } from './Icons'
import { listProjects, ensureDir, rmDir } from '../services/fs'
import { init as gitInit, isGitRepo, getRemoteUrl } from '../services/git'

interface ProjectListProps {
  currentProject: string | null
  onSelect: (project: string) => void
  onClone: () => void
  onClose?: () => void
}

interface ProjectInfo {
  name: string
  isGit: boolean
  remote?: string
}

export function ProjectList({ currentProject, onSelect, onClone, onClose }: ProjectListProps) {
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(true)

  const loadProjects = async () => {
    setLoading(true)
    try {
      await ensureDir('/projects')
      const names = await listProjects()
      const infos: ProjectInfo[] = await Promise.all(
        names.map(async (name) => {
          const dir = `/projects/${name}`
          const isGit = await isGitRepo(dir)
          const remote = isGit ? await getRemoteUrl(dir) : undefined
          return { name, isGit, remote }
        })
      )
      setProjects(infos)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  const createProject = async () => {
    if (!newName.trim()) return
    const dir = `/projects/${newName.trim()}`
    await ensureDir(dir)
    await gitInit(dir)
    setNewName('')
    setShowNew(false)
    await loadProjects()
    onSelect(newName.trim())
  }

  const deleteProject = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete "${name}"?`)) return
    await rmDir(`/projects/${name}`)
    await loadProjects()
  }

  const extractRepoName = (url?: string) => {
    if (!url) return null
    const match = url.match(/\/([^/]+?)(\.git)?$/)
    return match ? match[1] : null
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Projects</span>
        <div style={styles.headerActions}>
          <button onClick={() => setShowNew(true)} style={styles.headerBtn} title="New project">
            <PlusIcon size={16} color={theme.colors.text} />
          </button>
          {onClose && (
            <button onClick={onClose} style={styles.headerBtn} title="Close">
              <XIcon size={16} color={theme.colors.textSecondary} />
            </button>
          )}
        </div>
      </div>

      <div style={styles.content}>
        {/* Clone button */}
        <button onClick={onClone} style={styles.cloneBtn}>
          <GitBranchIcon size={14} color={theme.colors.accent} />
          <span>Clone repository</span>
        </button>

        {/* New project form */}
        {showNew && (
          <div style={styles.newForm}>
            <input
              autoFocus
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createProject()}
              style={styles.input}
            />
            <div style={styles.formActions}>
              <button onClick={() => setShowNew(false)} style={styles.cancelBtn}>
                Cancel
              </button>
              <button onClick={createProject} style={styles.createBtn}>
                Create
              </button>
            </div>
          </div>
        )}

        {/* Project list */}
        <div style={styles.list}>
          {projects.map((project) => (
            <button
              key={project.name}
              onClick={() => onSelect(project.name)}
              style={{
                ...styles.projectItem,
                ...(project.name === currentProject ? styles.projectItemActive : {}),
              }}
            >
              <div style={styles.projectInfo}>
                <span style={styles.projectName}>{project.name}</span>
                {project.remote && (
                  <span style={styles.projectMeta}>
                    {extractRepoName(project.remote)}
                  </span>
                )}
              </div>
              <div
                onClick={(e) => deleteProject(project.name, e)}
                style={styles.deleteBtn}
              >
                <TrashIcon size={14} color={theme.colors.textMuted} />
              </div>
            </button>
          ))}

          {projects.length === 0 && !loading && (
            <div style={styles.empty}>
              <p style={styles.emptyText}>No projects yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    maxHeight: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: `1px solid ${theme.colors.border}`,
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: 600,
    color: theme.colors.text,
    fontFamily: theme.font.sans,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  headerBtn: {
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
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: 8,
  },
  cloneBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    padding: '8px 10px',
    marginBottom: 8,
    background: theme.colors.bgTertiary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.font.sans,
    cursor: 'pointer',
  },
  newForm: {
    padding: 8,
    marginBottom: 8,
    background: theme.colors.bgTertiary,
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.colors.border}`,
  },
  input: {
    width: '100%',
    padding: '6px 8px',
    marginBottom: 6,
    background: theme.colors.bg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.font.sans,
    outline: 'none',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 4,
  },
  cancelBtn: {
    padding: '4px 10px',
    background: 'transparent',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.sm,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.font.sans,
    cursor: 'pointer',
  },
  createBtn: {
    padding: '4px 10px',
    background: theme.colors.accent,
    border: 'none',
    borderRadius: theme.radius.sm,
    color: '#fff',
    fontSize: theme.fontSize.xs,
    fontFamily: theme.font.sans,
    fontWeight: 600,
    cursor: 'pointer',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  projectItem: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '8px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: theme.radius.sm,
    cursor: 'pointer',
    textAlign: 'left',
  },
  projectItemActive: {
    background: theme.colors.bgTertiary,
  },
  projectInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  projectName: {
    fontSize: theme.fontSize.sm,
    fontWeight: 500,
    color: theme.colors.text,
    fontFamily: theme.font.sans,
  },
  projectMeta: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
    fontFamily: theme.font.sans,
    marginTop: 1,
  },
  deleteBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    cursor: 'pointer',
    opacity: 0.5,
    flexShrink: 0,
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    fontFamily: theme.font.sans,
  },
}
