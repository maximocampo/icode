import React, { useEffect, useCallback, useRef } from 'react'
import { theme } from '../styles/theme'

const KEYS = [
  { label: 'Tab', value: '\t' },
  { label: '{', value: '{' },
  { label: '}', value: '}' },
  { label: '(', value: '(' },
  { label: ')', value: ')' },
  { label: '[', value: '[' },
  { label: ']', value: ']' },
  { label: '<', value: '<' },
  { label: '>', value: '>' },
  { label: '=', value: '=' },
  { label: ';', value: ';' },
  { label: ':', value: ':' },
  { label: '"', value: '"' },
  { label: "'", value: "'" },
  { label: '`', value: '`' },
  { label: '/', value: '/' },
  { label: '\\', value: '\\' },
  { label: '.', value: '.' },
  { label: '_', value: '_' },
  { label: '-', value: '-' },
  { label: '+', value: '+' },
  { label: '*', value: '*' },
  { label: '&', value: '&' },
  { label: '|', value: '|' },
  { label: '#', value: '#' },
  { label: '!', value: '!' },
  { label: '~', value: '~' },
  { label: '@', value: '@' },
]

const BAR_HEIGHT = 42

interface KeyboardAccessoryProps {
  editorRef: React.RefObject<any>
}

export function KeyboardAccessory({ editorRef }: KeyboardAccessoryProps) {
  const barRef = useRef<HTMLDivElement>(null)
  const isOpen = useRef(false)
  const hideTimeout = useRef<number>(0)

  // Track visual viewport and position bar with direct DOM updates for 60fps
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const bar = barRef.current
      if (!bar) return

      const keyboardHeight = window.innerHeight - vv.height - vv.offsetTop

      if (keyboardHeight > 100) {
        clearTimeout(hideTimeout.current)

        if (!isOpen.current) {
          isOpen.current = true
          bar.style.display = 'flex'
          // Force reflow before adding opacity for transition
          bar.offsetHeight
          bar.style.opacity = '1'
        }

        // Direct DOM update — no React re-render, tracks keyboard pixel-by-pixel
        bar.style.transform = `translateY(${vv.offsetTop + vv.height - window.innerHeight}px)`
      } else if (isOpen.current) {
        isOpen.current = false
        bar.style.opacity = '0'
        hideTimeout.current = window.setTimeout(() => {
          if (bar) bar.style.display = 'none'
        }, 300)
      }
    }

    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      clearTimeout(hideTimeout.current)
    }
  }, [])

  const insertText = useCallback((text: string) => {
    const cmView = editorRef.current?.getCodemirror?.()
    if (!cmView) return

    const { state } = cmView
    const { from, to } = state.selection.main

    cmView.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    })

    cmView.focus()
  }, [editorRef])

  const dismissKeyboard = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }, [])

  return (
    <div
      ref={barRef}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: BAR_HEIGHT,
        zIndex: 9999,
        display: 'none',
        opacity: 0,
        alignItems: 'center',
        background: 'rgba(30, 35, 42, 0.88)',
        WebkitBackdropFilter: 'blur(20px)',
        backdropFilter: 'blur(20px)',
        borderTop: '0.5px solid rgba(255, 255, 255, 0.08)',
        transition: 'opacity 0.2s ease',
        willChange: 'transform',
      }}
    >
      {/* Scrollable key row */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '0 6px',
          gap: 6,
          minWidth: 0,
          scrollbarWidth: 'none',
          alignItems: 'center',
          height: '100%',
        }}
      >
        {KEYS.map((key) => (
          <button
            key={key.label}
            onMouseDown={(e) => {
              e.preventDefault()
              insertText(key.value)
            }}
            onTouchStart={(e) => {
              e.preventDefault()
              insertText(key.value)
            }}
            style={{
              minWidth: key.label === 'Tab' ? 50 : 34,
              height: 30,
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: 5,
              color: '#e6edf3',
              fontSize: key.label === 'Tab' ? 11 : 16,
              fontFamily: key.label === 'Tab' ? theme.font.sans : theme.font.mono,
              fontWeight: key.label === 'Tab' ? 500 : 400,
              cursor: 'pointer',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
              letterSpacing: 0,
            }}
          >
            {key.label === 'Tab' ? '⇥ Tab' : key.label}
          </button>
        ))}
      </div>

      {/* Dismiss keyboard button */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          dismissKeyboard()
        }}
        onTouchStart={(e) => {
          e.preventDefault()
          e.stopPropagation()
          dismissKeyboard()
        }}
        onTouchEnd={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        style={{
          width: 44,
          height: BAR_HEIGHT,
          background: 'none',
          border: 'none',
          borderLeft: '0.5px solid rgba(255, 255, 255, 0.08)',
          color: theme.colors.accentBlue,
          cursor: 'pointer',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation',
        }}
      >
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="20" height="12" rx="2" />
          <line x1="6" y1="7" x2="6.01" y2="7" />
          <line x1="10" y1="7" x2="10.01" y2="7" />
          <line x1="14" y1="7" x2="14.01" y2="7" />
          <line x1="18" y1="7" x2="18.01" y2="7" />
          <line x1="6" y1="11" x2="6.01" y2="11" />
          <line x1="18" y1="11" x2="18.01" y2="11" />
          <line x1="9" y1="11" x2="15" y2="11" />
          <path d="M7 19l5-3.5L17 19" />
        </svg>
      </button>
    </div>
  )
}
