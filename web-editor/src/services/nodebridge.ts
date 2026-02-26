/**
 * Node.js Bridge — WebView-side client for communicating with the
 * native Node.js process via React Native message relay.
 *
 * WebView → postMessage → React Native → nodejs.channel → Node.js
 * Node.js → rn_bridge.channel → React Native → injectJavaScript → WebView
 */

type OutputCallback = (data: string) => void

interface PendingRequest {
  resolve: (value: any) => void
  reject: (reason: any) => void
  onOutput?: OutputCallback
}

let requestId = 0
const pendingRequests = new Map<number, PendingRequest>()
let nodeReady = false
let readyPromise: Promise<void> | null = null
let readyResolve: (() => void) | null = null

// Set up ready promise
readyPromise = new Promise<void>((resolve) => {
  readyResolve = resolve
})

// Listen for messages from React Native (relayed from Node.js)
window.addEventListener('message', (e) => {
  let msg: any
  try {
    msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
  } catch {
    return
  }

  // Node.js ready signal
  if (msg.type === 'ready' && msg.nodeVersion) {
    nodeReady = true
    readyResolve?.()
    console.log('[nodebridge] Node.js ready:', msg.nodeVersion)
    return
  }

  const pending = pendingRequests.get(msg.id)
  if (!pending) return

  switch (msg.type) {
    case 'stdout':
    case 'stderr':
      pending.onOutput?.(msg.data)
      break

    case 'exit':
      pending.resolve(msg.code ?? 0)
      pendingRequests.delete(msg.id)
      break

    case 'done':
    case 'killed':
      pending.resolve(undefined)
      pendingRequests.delete(msg.id)
      break

    case 'result':
      pending.resolve(msg.content ?? msg.entries ?? msg)
      pendingRequests.delete(msg.id)
      break

    case 'pong':
    case 'info':
      pending.resolve(msg)
      pendingRequests.delete(msg.id)
      break

    case 'error':
      pending.reject(new Error(msg.message))
      pendingRequests.delete(msg.id)
      break
  }
})

function sendToNode(msg: any): void {
  const payload = JSON.stringify({ ...msg, target: 'nodejs' })
  ;(window as any).ReactNativeWebView?.postMessage(payload)
}

/** Wait for Node.js to be ready */
export function waitForReady(): Promise<void> {
  if (nodeReady) return Promise.resolve()
  return readyPromise!
}

/** Check if Node.js is available */
export function isAvailable(): boolean {
  return !!(window as any).ReactNativeWebView
}

/** Check if Node.js is ready */
export function isReady(): boolean {
  return nodeReady
}

/** Ping the Node.js process */
export function ping(): Promise<any> {
  const id = ++requestId
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    sendToNode({ id, type: 'ping' })
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        reject(new Error('Ping timeout'))
      }
    }, 5000)
  })
}

/** Execute a command in the Node.js process */
export function exec(
  command: string,
  args: string[],
  cwd: string,
  onOutput: OutputCallback
): { promise: Promise<number>; processId: number } {
  const id = ++requestId
  const promise = new Promise<number>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject, onOutput })
    sendToNode({ id, type: 'exec', command, args, cwd })
  })
  return { promise, processId: id }
}

/** Kill a running process */
export function kill(processId: number): Promise<void> {
  const id = ++requestId
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    sendToNode({ id, type: 'kill', processId })
  })
}

/** Write a file to the native filesystem */
export function writeFile(filePath: string, content: string): Promise<void> {
  const id = ++requestId
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    sendToNode({ id, type: 'writeFile', path: filePath, content })
  })
}

/** Read a file from the native filesystem */
export function readFile(filePath: string): Promise<string> {
  const id = ++requestId
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    sendToNode({ id, type: 'readFile', path: filePath })
  })
}

/** Create a directory on the native filesystem */
export function mkdir(dirPath: string): Promise<void> {
  const id = ++requestId
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    sendToNode({ id, type: 'mkdir', path: dirPath })
  })
}

/** Read a directory from the native filesystem */
export function readDir(dirPath: string): Promise<{ name: string; isDirectory: boolean }[]> {
  const id = ++requestId
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    sendToNode({ id, type: 'readDir', path: dirPath })
  })
}

/** Get Node.js runtime info */
export function getInfo(): Promise<any> {
  const id = ++requestId
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject })
    sendToNode({ id, type: 'getInfo' })
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        reject(new Error('getInfo timeout'))
      }
    }, 5000)
  })
}
