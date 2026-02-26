/**
 * File Sync — Syncs project files between LightningFS (IndexedDB)
 * and the native filesystem via the Node.js bridge.
 *
 * Forward:  WebView (IndexedDB) → Native — before running npm/node commands
 * Reverse:  Native → WebView (IndexedDB) — after commands create/modify files
 */

import { readDirRecursive, pfs, ensureDir } from './fs'
import * as nodebridge from './nodebridge'

const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', '.expo'])

const TEXT_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css',
  '.scss', '.md', '.txt', '.svg', '.mjs', '.cjs', '.yaml', '.yml',
  '.env', '.lock',
]

function isTextFile(filename: string): boolean {
  if (filename === 'package.json' || filename === 'package-lock.json') return true
  return TEXT_EXTENSIONS.some(ext => filename.endsWith(ext))
}

let cachedProjectsDir: string | null = null

/** Get the native projects directory path */
async function getNativeProjectsDir(): Promise<string> {
  if (cachedProjectsDir) return cachedProjectsDir

  try {
    const info = await nodebridge.getInfo()
    cachedProjectsDir = info.projectsDir
    return cachedProjectsDir!
  } catch {
    // Fallback path
    return '/var/mobile/projects'
  }
}

/**
 * Sync all project files from IndexedDB to the native filesystem.
 * Call this before running npm/node commands.
 */
export async function syncProjectToNative(
  projectDir: string,
  projectName: string
): Promise<string> {
  const nativeBase = await getNativeProjectsDir()
  const nativeProjectDir = `${nativeBase}/${projectName}`

  // Read all files from IndexedDB
  const files = await readDirRecursive(projectDir)

  // Write each file to the native filesystem
  for (const file of files) {
    const nativePath = `${nativeProjectDir}${file.path}`
    await nodebridge.writeFile(nativePath, file.content)
  }

  return nativeProjectDir
}

/**
 * Sync a single file change to the native filesystem.
 * Call this when the user edits a file and a dev server is running.
 */
export async function syncFileToNative(
  projectName: string,
  filePath: string,
  content: string
): Promise<void> {
  const nativeBase = await getNativeProjectsDir()
  const nativePath = `${nativeBase}/${projectName}${filePath}`
  await nodebridge.writeFile(nativePath, content)
}

/**
 * Read a file from the native filesystem back into the editor.
 * Useful for reading generated files (e.g., after npm install).
 */
export async function readNativeFile(
  projectName: string,
  filePath: string
): Promise<string> {
  const nativeBase = await getNativeProjectsDir()
  const nativePath = `${nativeBase}/${projectName}${filePath}`
  return nodebridge.readFile(nativePath)
}

/**
 * Sync files from the native filesystem back to IndexedDB.
 * Call this after npm/node commands that may create or modify files.
 * Skips node_modules, .git, and non-text files.
 * Returns the list of relative file paths that were synced.
 */
export async function syncFromNative(
  projectDir: string,
  projectName: string
): Promise<string[]> {
  const nativeBase = await getNativeProjectsDir()
  const nativeProjectDir = `${nativeBase}/${projectName}`
  const syncedFiles: string[] = []

  async function walkNative(nativeDir: string, relativePath: string) {
    let entries: { name: string; isDirectory: boolean }[]
    try {
      entries = await nodebridge.readDir(nativeDir)
    } catch {
      return
    }

    for (const entry of entries) {
      const nativeFullPath = `${nativeDir}/${entry.name}`
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name

      if (entry.isDirectory) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        await ensureDir(`${projectDir}/${relPath}`)
        await walkNative(nativeFullPath, relPath)
      } else {
        if (!isTextFile(entry.name)) continue
        try {
          const content = await nodebridge.readFile(nativeFullPath)
          const idbPath = `${projectDir}/${relPath}`
          const parentDir = idbPath.substring(0, idbPath.lastIndexOf('/'))
          await ensureDir(parentDir)
          await pfs.writeFile(idbPath, content, 'utf8')
          syncedFiles.push(`/${relPath}`)
        } catch {
          // Skip files that fail to read
        }
      }
    }
  }

  await walkNative(nativeProjectDir, '')
  return syncedFiles
}
