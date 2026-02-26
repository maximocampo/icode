import LightningFS from '@isomorphic-git/lightning-fs'

// Single filesystem instance for the app
export const fs = new LightningFS('react-mobile-ide')

// Promisified fs for easier use
export const pfs = fs.promises

// Helper to ensure a directory exists
export async function ensureDir(path: string): Promise<void> {
  try {
    await pfs.mkdir(path, { recursive: true } as any)
  } catch (e: any) {
    if (e.code !== 'EEXIST') throw e
  }
}

// Read all files in a directory recursively
export async function readDirRecursive(
  dir: string,
  base = ''
): Promise<{ path: string; content: string }[]> {
  const files: { path: string; content: string }[] = []
  const entries = await pfs.readdir(dir)

  for (const entry of entries) {
    const fullPath = `${dir}/${entry}`
    const relativePath = base ? `${base}/${entry}` : entry
    const stat = await pfs.stat(fullPath)

    if (stat.isDirectory()) {
      // Skip node_modules and hidden dirs
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const subFiles = await readDirRecursive(fullPath, relativePath)
      files.push(...subFiles)
    } else {
      // Only read text files
      if (isTextFile(entry)) {
        const content = await pfs.readFile(fullPath, { encoding: 'utf8' }) as string
        files.push({ path: `/${relativePath}`, content })
      }
    }
  }

  return files
}

function isTextFile(filename: string): boolean {
  const textExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', 
    '.scss', '.md', '.txt', '.svg', '.mjs', '.cjs'
  ]
  return textExtensions.some(ext => filename.endsWith(ext))
}

// Write files to the filesystem
export async function writeFiles(
  dir: string,
  files: Record<string, string>
): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const fullPath = `${dir}${path}`
    const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'))
    await ensureDir(dirPath)
    await pfs.writeFile(fullPath, content, 'utf8')
  }
}

// Delete a directory recursively
export async function rmDir(dir: string): Promise<void> {
  try {
    const entries = await pfs.readdir(dir)
    for (const entry of entries) {
      const fullPath = `${dir}/${entry}`
      const stat = await pfs.stat(fullPath)
      if (stat.isDirectory()) {
        await rmDir(fullPath)
      } else {
        await pfs.unlink(fullPath)
      }
    }
    await pfs.rmdir(dir)
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e
  }
}

// List projects (directories in /projects)
export async function listProjects(): Promise<string[]> {
  try {
    await ensureDir('/projects')
    const entries = await pfs.readdir('/projects')
    return entries.filter(e => !e.startsWith('.'))
  } catch {
    return []
  }
}
