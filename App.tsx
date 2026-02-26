import React, { useRef, useState, useEffect, useCallback } from 'react'
import {
  StyleSheet,
  View,
  SafeAreaView,
  StatusBar,
  Text,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { WebView, WebViewMessageEvent } from 'react-native-webview'
import * as SecureStore from 'expo-secure-store'
import nodejs from 'nodejs-mobile-react-native'

// For development, we load from the Vite dev server
// Use your Mac's local IP (run: ipconfig getifaddr en0)
const DEV_URL = 'http://192.168.1.5:5173'
const PROD_URL = '' // TODO: Bundle the web editor

interface BridgeMessage {
  type: string
  target?: string
  payload?: any
  id?: string
}

export default function App() {
  const webViewRef = useRef<WebView>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentProject, setCurrentProject] = useState<string>('')
  const [nodeReady, setNodeReady] = useState(false)
  const nodeReadyRef = useRef(false)
  const nodeVersionRef = useRef('')

  // Start Node.js process on mount
  useEffect(() => {
    nodejs.start('main.js')

    // Listen for messages from Node.js and relay to WebView
    nodejs.channel.addListener('message', (msg: string) => {
      try {
        const parsed = JSON.parse(msg)

        // Handle Node.js ready signal
        if (parsed.type === 'ready') {
          nodeReadyRef.current = true
          nodeVersionRef.current = parsed.nodeVersion || 'active'
          setNodeReady(true)
          console.log('Node.js ready:', parsed.nodeVersion)
        }

        // Forward all Node.js messages to WebView
        webViewRef.current?.injectJavaScript(`
          window.postMessage(${JSON.stringify(msg)}, '*');
          true;
        `)
      } catch {
        // Non-JSON message, ignore
      }
    })
  }, [])

  // Handle messages from the WebView
  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const message: BridgeMessage = JSON.parse(event.nativeEvent.data)

      // Route messages targeted at Node.js
      if (message.target === 'nodejs') {
        nodejs.channel.send(event.nativeEvent.data)
        return
      }

      // Handle React Native bridge messages
      switch (message.type) {
        case 'ready':
          setIsReady(true)
          // If Node.js is already ready, re-send the ready signal to WebView
          // (it may have been sent before the WebView loaded)
          if (nodeReadyRef.current) {
            const readyMsg = JSON.stringify({ type: 'ready', nodeVersion: nodeVersionRef.current })
            webViewRef.current?.injectJavaScript(`
              window.postMessage(${JSON.stringify(readyMsg)}, '*');
              true;
            `)
          }
          break

        case 'projectChanged':
          setCurrentProject(message.payload?.projectName || '')
          break

        case 'getCredentials': {
          const username = await SecureStore.getItemAsync('git_username')
          const password = await SecureStore.getItemAsync('git_password')
          sendResponse(message.id!, { username, password })
          break
        }

        case 'saveCredentials':
          if (message.payload?.username) {
            await SecureStore.setItemAsync('git_username', message.payload.username)
          }
          if (message.payload?.password) {
            await SecureStore.setItemAsync('git_password', message.payload.password)
          }
          sendResponse(message.id!, { success: true })
          break

        case 'getNodeInfo':
          sendResponse(message.id!, { nodeReady })
          break

        case 'shareFile':
          console.log('Share file:', message.payload)
          sendResponse(message.id!, { success: true })
          break

        default:
          console.log('Unknown message type:', message.type)
      }
    } catch (err) {
      console.error('Failed to handle message:', err)
    }
  }, [nodeReady])

  // Send a response back to the WebView
  const sendResponse = (id: string, payload: any) => {
    const message = JSON.stringify({ id, type: 'response', payload })
    webViewRef.current?.injectJavaScript(`
      window.postMessage(${JSON.stringify(message)}, '*');
      true;
    `)
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1e1e1e" />

      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {currentProject ? `📁 ${currentProject}` : '📱 Mobile IDE'}
          </Text>
        </View>

        {/* WebView */}
        <WebView
          ref={webViewRef}
          source={{ uri: DEV_URL }}
          style={styles.webview}
          onMessage={handleMessage}
          onError={(e) => setError(e.nativeEvent.description)}
          onHttpError={(e) => setError(`HTTP ${e.nativeEvent.statusCode}`)}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowUniversalAccessFromFileURLs
          originWhitelist={['*']}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#0e639c" />
              <Text style={styles.loadingText}>Loading editor...</Text>
            </View>
          )}
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          scrollEnabled={false}
          bounces={false}
          onShouldStartLoadWithRequest={() => true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          mixedContentMode="always"
          webviewDebuggingEnabled={__DEV__}
        />

        {/* Error overlay */}
        {error && (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorTitle}>Failed to load editor</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorHint}>
              Make sure the web editor is running:{'\n'}
              cd web-editor && npm run dev
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  header: {
    height: 44,
    backgroundColor: '#252526',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  webview: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
  },
  loadingText: {
    marginTop: 12,
    color: '#888',
    fontSize: 14,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    padding: 24,
  },
  errorTitle: {
    color: '#f44336',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  errorHint: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
})
