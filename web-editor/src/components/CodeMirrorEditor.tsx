import React, { useRef, useEffect, useMemo } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { useEditor } from '../context/EditorContext'
import { theme } from '../styles/theme'

function getLanguage(path: string) {
  if (path.match(/\.[jt]sx?$/)) {
    return javascript({
      jsx: true,
      typescript: path.endsWith('.ts') || path.endsWith('.tsx'),
    })
  }
  if (path.endsWith('.css')) return css()
  if (path.endsWith('.html') || path.endsWith('.htm')) return html()
  if (path.endsWith('.json')) return json()
  return []
}

export function CodeMirrorEditor({ style }: { style?: React.CSSProperties }) {
  const { activeFile } = useEditor()

  if (!activeFile) {
    return (
      <div style={{ ...baseStyle, ...style, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{
          color: theme.colors.textSecondary,
          fontSize: theme.fontSize.md,
          fontFamily: theme.font.sans,
        }}>
          No file open
        </span>
      </div>
    )
  }

  return <CodeMirrorEditorInner style={style} />
}

function CodeMirrorEditorInner({ style }: { style?: React.CSSProperties }) {
  const { files, activeFile, updateFile } = useEditor()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const languageCompartment = useMemo(() => new Compartment(), [])
  const activeFileRef = useRef(activeFile)
  activeFileRef.current = activeFile

  // Create editor on mount
  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const content = update.state.doc.toString()
        updateFile(activeFileRef.current, content)
      }
    })

    const state = EditorState.create({
      doc: files[activeFile] || '',
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        autocompletion(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        languageCompartment.of(getLanguage(activeFile)),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...closeBracketsKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        oneDark,
        updateListener,
        EditorView.theme({
          '&': { height: '100%', fontSize: '12px' },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
          },
          '.cm-gutters': { fontSize: '10px', minWidth: '28px' },
          '.cm-lineNumbers .cm-gutterElement': {
            fontSize: '10px',
            padding: '0 2px 0 4px',
            minWidth: '20px',
          },
        }),
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Switch document when activeFile changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const content = files[activeFile] || ''

    // Replace entire document
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: content,
      },
    })

    // Update language
    view.dispatch({
      effects: languageCompartment.reconfigure(getLanguage(activeFile)),
    })
  }, [activeFile]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={{ ...baseStyle, ...style }} />
}

const baseStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
}
