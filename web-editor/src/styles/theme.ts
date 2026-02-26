// Minimalist dark theme
export const theme = {
  colors: {
    // Backgrounds
    bg: '#1e1e1e',
    bgSecondary: '#252526',
    bgTertiary: '#2d2d2d',
    bgHover: '#383838',

    // Borders
    border: '#333',
    borderMuted: '#2a2a2a',

    // Text
    text: '#d4d4d4',
    textSecondary: '#858585',
    textMuted: '#5a5a5a',

    // Accent
    accent: '#007acc',
    accentHover: '#1a8ad4',
    accentBlue: '#007acc',
    accentPurple: '#c586c0',

    // Status
    success: '#4ec9b0',
    warning: '#cca700',
    danger: '#f44747',
    info: '#007acc',

    // Syntax
    added: '#4ec9b0',
    deleted: '#f44747',
    modified: '#cca700',
  },

  spacing: {
    xs: 2,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    xxl: 24,
  },

  radius: {
    sm: 3,
    md: 4,
    lg: 6,
    full: 9999,
  },

  font: {
    mono: "'SF Mono', SFMono-Regular, 'Consolas', 'Liberation Mono', Menlo, monospace",
    sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif",
  },

  fontSize: {
    xs: 11,
    sm: 12,
    md: 13,
    lg: 14,
    xl: 16,
    xxl: 20,
  },
}

export type Theme = typeof theme
