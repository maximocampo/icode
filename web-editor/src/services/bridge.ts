// Bridge for communication between WebView and React Native

type MessageHandler = (data: any) => void | Promise<void>

interface BridgeMessage {
  type: string
  payload?: any
  id?: string
}

class Bridge {
  private handlers: Map<string, MessageHandler> = new Map()
  private pendingRequests: Map<string, { resolve: (data: any) => void; reject: (err: Error) => void }> = new Map()
  private messageId = 0

  constructor() {
    // Listen for messages from React Native
    window.addEventListener('message', this.handleMessage.bind(this))
    
    // Also check for ReactNativeWebView (injected by RN)
    if ((window as any).ReactNativeWebView) {
      console.log('Bridge: Running in React Native WebView')
    }
  }

  private handleMessage(event: MessageEvent) {
    try {
      const message: BridgeMessage = typeof event.data === 'string' 
        ? JSON.parse(event.data) 
        : event.data

      // Check if this is a response to a pending request
      if (message.id && this.pendingRequests.has(message.id)) {
        const { resolve, reject } = this.pendingRequests.get(message.id)!
        this.pendingRequests.delete(message.id)
        
        if (message.type === 'error') {
          reject(new Error(message.payload?.message || 'Unknown error'))
        } else {
          resolve(message.payload)
        }
        return
      }

      // Handle incoming message
      const handler = this.handlers.get(message.type)
      if (handler) {
        Promise.resolve(handler(message.payload)).catch(err => {
          console.error(`Bridge handler error for ${message.type}:`, err)
        })
      }
    } catch (err) {
      console.error('Bridge: Failed to parse message', err)
    }
  }

  // Register a handler for a message type
  on(type: string, handler: MessageHandler): () => void {
    this.handlers.set(type, handler)
    return () => this.handlers.delete(type)
  }

  // Send a message to React Native
  send(type: string, payload?: any): void {
    const message: BridgeMessage = { type, payload }
    
    if ((window as any).ReactNativeWebView) {
      (window as any).ReactNativeWebView.postMessage(JSON.stringify(message))
    } else {
      // Fallback for web testing
      console.log('Bridge.send (no RN):', message)
    }
  }

  // Send a request and wait for response
  async request<T = any>(type: string, payload?: any): Promise<T> {
    const id = `req_${++this.messageId}`
    const message: BridgeMessage = { type, payload, id }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`Request timeout: ${type}`))
        }
      }, 30000)

      if ((window as any).ReactNativeWebView) {
        (window as any).ReactNativeWebView.postMessage(JSON.stringify(message))
      } else {
        // Fallback: immediately resolve with null for web testing
        setTimeout(() => {
          this.pendingRequests.delete(id)
          resolve(null as T)
        }, 100)
      }
    })
  }

  // Notify React Native that the editor is ready
  ready(): void {
    this.send('ready')
  }

  // Request credentials from secure storage
  async getCredentials(): Promise<{ username: string; password: string } | null> {
    return this.request('getCredentials')
  }

  // Request to save credentials
  async saveCredentials(username: string, password: string): Promise<void> {
    return this.request('saveCredentials', { username, password })
  }

  // Notify about project change
  projectChanged(projectName: string): void {
    this.send('projectChanged', { projectName })
  }

  // Request file share/export
  async shareFile(filename: string, content: string): Promise<void> {
    return this.request('shareFile', { filename, content })
  }
}

export const bridge = new Bridge()
