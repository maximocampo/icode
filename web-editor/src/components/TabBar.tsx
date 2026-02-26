import React from 'react'
import { theme } from '../styles/theme'
import { RepoIcon, CodeIcon, GitBranchIcon } from './Icons'

export type TabId = 'projects' | 'editor' | 'git'

interface TabBarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  hasChanges?: boolean
}

export function TabBar({ activeTab, onTabChange, hasChanges }: TabBarProps) {
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'projects', label: 'Projects', icon: <RepoIcon size={20} /> },
    { id: 'editor', label: 'Code', icon: <CodeIcon size={20} /> },
    { id: 'git', label: 'Git', icon: <GitBranchIcon size={20} /> },
  ]

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={styles.tab}
            >
              <div style={{ position: 'relative' }}>
                {React.cloneElement(tab.icon as React.ReactElement, {
                  color: isActive ? theme.colors.accentBlue : theme.colors.textSecondary,
                })}
                {tab.id === 'git' && hasChanges && <div style={styles.badge} />}
              </div>
              <span
                style={{
                  ...styles.label,
                  color: isActive ? theme.colors.accentBlue : theme.colors.textSecondary,
                }}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    flexShrink: 0,
    background: theme.colors.bgSecondary,
    borderTop: `1px solid ${theme.colors.border}`,
  },
  container: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 56,
    paddingBottom: 'env(safe-area-inset-bottom)',
  },
  tab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: '8px 24px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
  label: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.font.sans,
    fontWeight: 500,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -6,
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: theme.colors.accent,
  },
}
