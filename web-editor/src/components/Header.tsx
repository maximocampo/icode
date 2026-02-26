import React from 'react'
import { theme } from '../styles/theme'

interface HeaderProps {
  title: string
  subtitle?: string
  left?: React.ReactNode
  right?: React.ReactNode
}

export function Header({ title, subtitle, left, right }: HeaderProps) {
  return (
    <div style={styles.container}>
      <div style={styles.left}>{left}</div>
      <div style={styles.center}>
        <h1 style={styles.title}>{title}</h1>
        {subtitle && <span style={styles.subtitle}>{subtitle}</span>}
      </div>
      <div style={styles.right}>{right}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 36,
    padding: `0 ${theme.spacing.md}px`,
    background: theme.colors.bgSecondary,
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  left: {
    width: 60,
    display: 'flex',
    justifyContent: 'flex-start',
  },
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    overflow: 'hidden',
  },
  right: {
    width: 60,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  title: {
    margin: 0,
    fontSize: theme.fontSize.lg,
    fontWeight: 600,
    color: theme.colors.text,
    fontFamily: theme.font.sans,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  subtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textSecondary,
    fontFamily: theme.font.sans,
  },
}
