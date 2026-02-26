import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { writeFiles } from '../services/fs'

interface EditorContextValue {
  files: Record<string, string>
  activeFile: string
  openFiles: string[]
  updateFile: (path: string, content: string) => void
  setActiveFile: (path: string) => void
  closeFile: (path: string) => void
  addFile: (path: string, content: string) => void
  deleteFile: (path: string) => void
}

const EditorContext = createContext<EditorContextValue | null>(null)

export function useEditor() {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditor must be used within EditorProvider')
  return ctx
}

interface EditorProviderProps {
  initialFiles: Record<string, string>
  projectDir: string
  children: React.ReactNode
}

function pickEntry(keys: string[]): string {
  return keys.includes('/App.js') ? '/App.js'
    : keys.includes('/App.tsx') ? '/App.tsx'
    : keys.includes('/index.js') ? '/index.js'
    : keys[0] || ''
}

export function EditorProvider({ initialFiles, projectDir, children }: EditorProviderProps) {
  const [files, setFiles] = useState(initialFiles)
  const [activeFile, setActiveFileState] = useState(() => pickEntry(Object.keys(initialFiles)))
  const [openFiles, setOpenFiles] = useState<string[]>(() => {
    const entry = pickEntry(Object.keys(initialFiles))
    return entry ? [entry] : []
  })

  const filesRef = useRef(files)
  filesRef.current = files

  // Sync files when parent reloads from disk
  const initialFilesRef = useRef(initialFiles)
  useEffect(() => {
    if (initialFiles === initialFilesRef.current) return
    initialFilesRef.current = initialFiles
    setFiles(initialFiles)

    // Clean up open files that were deleted on disk
    setOpenFiles(prev => {
      const next = prev.filter(f => f in initialFiles)
      if (next.length === 0 && Object.keys(initialFiles).length > 0) {
        return [pickEntry(Object.keys(initialFiles))]
      }
      return next
    })

    setActiveFileState(prev => {
      if (prev && prev in initialFiles) return prev
      return pickEntry(Object.keys(initialFiles))
    })
  }, [initialFiles])

  // Debounced save to filesystem
  useEffect(() => {
    const timeout = setTimeout(async () => {
      try {
        await writeFiles(projectDir, filesRef.current)
      } catch (err) {
        console.error('Failed to save:', err)
      }
    }, 1500)
    return () => clearTimeout(timeout)
  }, [files, projectDir])

  const updateFile = useCallback((path: string, content: string) => {
    setFiles(prev => ({ ...prev, [path]: content }))
  }, [])

  const setActiveFile = useCallback((path: string) => {
    setActiveFileState(path)
    setOpenFiles(prev => prev.includes(path) ? prev : [...prev, path])
  }, [])

  const closeFile = useCallback((path: string) => {
    setOpenFiles(prev => {
      const next = prev.filter(f => f !== path)
      return next
    })
    setActiveFileState(prev => {
      if (prev !== path) return prev
      const remaining = openFiles.filter(f => f !== path)
      return remaining[remaining.length - 1] || ''
    })
  }, [openFiles])

  const addFile = useCallback((path: string, content: string) => {
    setFiles(prev => ({ ...prev, [path]: content }))
    setActiveFile(path)
  }, [setActiveFile])

  const deleteFile = useCallback((path: string) => {
    setFiles(prev => {
      const next = { ...prev }
      delete next[path]
      return next
    })
    closeFile(path)
  }, [closeFile])

  return (
    <EditorContext.Provider value={{
      files,
      activeFile,
      openFiles,
      updateFile,
      setActiveFile,
      closeFile,
      addFile,
      deleteFile,
    }}>
      {children}
    </EditorContext.Provider>
  )
}
