import git from 'isomorphic-git'
import http from 'isomorphic-git/http/web'
import { fs, pfs, ensureDir } from './fs'

export interface GitCredentials {
  username: string
  password: string // or personal access token
}

export interface CloneOptions {
  url: string
  dir: string
  credentials?: GitCredentials
  onProgress?: (progress: { phase: string; loaded: number; total: number }) => void
}

export interface CommitOptions {
  dir: string
  message: string
  author: { name: string; email: string }
}

// Clone a repository
export async function clone(options: CloneOptions): Promise<void> {
  const { url, dir, credentials, onProgress } = options

  await ensureDir(dir)

  await git.clone({
    fs,
    http,
    dir,
    url,
    corsProxy: 'https://cors.isomorphic-git.org',
    singleBranch: true,
    depth: 1,
    onAuth: credentials ? () => credentials : undefined,
    onProgress,
  })
}

// Pull latest changes
export async function pull(
  dir: string,
  credentials?: GitCredentials
): Promise<void> {
  await git.pull({
    fs,
    http,
    dir,
    corsProxy: 'https://cors.isomorphic-git.org',
    singleBranch: true,
    onAuth: credentials ? () => credentials : undefined,
    author: { name: 'Mobile IDE', email: 'mobile-ide@local' },
  })
}

// Push changes
export async function push(
  dir: string,
  credentials: GitCredentials
): Promise<void> {
  await git.push({
    fs,
    http,
    dir,
    corsProxy: 'https://cors.isomorphic-git.org',
    onAuth: () => credentials,
  })
}

// Stage all changes
export async function addAll(dir: string): Promise<void> {
  // Get status of all files
  const statuses = await git.statusMatrix({ fs, dir })

  for (const [filepath, , workdir, stage] of statuses) {
    // File has changes
    if (workdir !== stage) {
      if (workdir === 0) {
        // Deleted
        await git.remove({ fs, dir, filepath })
      } else {
        // Added or modified
        await git.add({ fs, dir, filepath })
      }
    }
  }
}

// Commit changes
export async function commit(options: CommitOptions): Promise<string> {
  const { dir, message, author } = options
  return git.commit({
    fs,
    dir,
    message,
    author,
  })
}

// Get current branch
export async function currentBranch(dir: string): Promise<string | undefined> {
  return git.currentBranch({ fs, dir }) as Promise<string | undefined>
}

// Get status (modified files)
export async function status(
  dir: string
): Promise<Array<{ file: string; status: string }>> {
  const statuses = await git.statusMatrix({ fs, dir })
  const results: Array<{ file: string; status: string }> = []

  for (const [filepath, head, workdir, stage] of statuses) {
    let status = 'unmodified'

    if (head === 0 && workdir === 2) status = 'added'
    else if (head === 1 && workdir === 0) status = 'deleted'
    else if (head === 1 && workdir === 2 && stage !== workdir) status = 'modified'
    else if (head === 0 && workdir === 0) status = 'deleted'

    if (status !== 'unmodified') {
      results.push({ file: filepath, status })
    }
  }

  return results
}

// Get log
export async function log(
  dir: string,
  depth = 10
): Promise<Array<{ oid: string; message: string; author: string; date: Date }>> {
  const commits = await git.log({ fs, dir, depth })
  return commits.map(c => ({
    oid: c.oid.slice(0, 7),
    message: c.commit.message.trim(),
    author: c.commit.author.name,
    date: new Date(c.commit.author.timestamp * 1000),
  }))
}

// Check if directory is a git repo
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await pfs.stat(`${dir}/.git`)
    return true
  } catch {
    return false
  }
}

// Initialize a new git repo
export async function init(dir: string): Promise<void> {
  await ensureDir(dir)
  await git.init({ fs, dir })
}

// Get remote URL
export async function getRemoteUrl(dir: string): Promise<string | undefined> {
  try {
    const remotes = await git.listRemotes({ fs, dir })
    const origin = remotes.find(r => r.remote === 'origin')
    return origin?.url
  } catch {
    return undefined
  }
}

// Add a remote
export async function addRemote(
  dir: string,
  name: string,
  url: string
): Promise<void> {
  await git.addRemote({ fs, dir, remote: name, url })
}
