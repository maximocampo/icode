# React Mobile IDE 📱💻

A mobile IDE for building React projects on iPhone/iPad. Edit code, preview live, and manage Git repos — all from your phone.

## Architecture

```
┌─────────────────────────────────────────────────┐
│            React Native Shell (Expo)            │
│  - Native header & navigation                   │
│  - Secure credential storage                    │
│  - Share sheet integration                      │
├─────────────────────────────────────────────────┤
│              WebView (web-editor)               │
│  ┌─────────────────────────────────────────────┐│
│  │            LightningFS (IndexedDB)          ││
│  │  └─ isomorphic-git (clone/pull/push)        ││
│  ├─────────────────────────────────────────────┤│
│  │  Sandpack (CodeSandbox runtime)             ││
│  │  ┌──────────────┬───────────────────┐       ││
│  │  │   Editor     │     Preview       │       ││
│  │  │  (CodeMirror)│    (iframe)       │       ││
│  │  └──────────────┴───────────────────┘       ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

## Features

### MVP (Current)
- ✅ Create/manage projects
- ✅ Code editor with syntax highlighting
- ✅ Live preview (React apps)
- ✅ Git clone/pull/push
- ✅ File explorer
- ✅ Dark theme

### Coming Soon
- [ ] Multiple file tabs
- [ ] Export/share projects
- [ ] Templates (Tailwind, TypeScript, etc.)
- [ ] NPM package search
- [ ] Cloud sync
- [ ] Collaborative editing

## Getting Started

### Prerequisites
- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator or physical device

### Development

1. **Start the web editor** (in one terminal):
   ```bash
   cd web-editor
   npm install
   npm run dev
   ```
   This starts Vite on `http://localhost:5173`

2. **Start the Expo app** (in another terminal):
   ```bash
   npm install
   npx expo start
   ```

3. **Run on device/simulator**:
   - Press `i` for iOS simulator
   - Scan QR code with Expo Go for physical device

### Production Build

```bash
# Build web editor
cd web-editor
npm run build

# Build iOS app
cd ..
npx expo build:ios

# Or use EAS Build
eas build --platform ios
```

## Project Structure

```
react-mobile-ide/
├── App.tsx              # React Native entry point
├── web-editor/          # Embedded web app (Sandpack + Git)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Editor.tsx       # Sandpack wrapper
│   │   │   ├── GitPanel.tsx     # Git operations UI
│   │   │   └── ProjectSelector.tsx
│   │   ├── services/
│   │   │   ├── fs.ts           # LightningFS wrapper
│   │   │   ├── git.ts          # isomorphic-git wrapper
│   │   │   └── bridge.ts       # RN ↔ WebView communication
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
└── package.json
```

## How It Works

1. **File Storage**: Uses LightningFS (IndexedDB) in the browser to persist project files. Files survive app restarts.

2. **Code Editing**: Sandpack (by CodeSandbox) provides the editor and live preview. It bundles React code in the browser — no server needed.

3. **Git**: isomorphic-git is a pure JavaScript Git implementation. It can clone, pull, push, commit — all in the browser. Uses a CORS proxy for cloning from GitHub.

4. **Bridge**: The RN shell and WebView communicate via postMessage. The RN side handles secure storage (credentials) and native features (share sheet).

## Git Authentication

For private repos, enter your GitHub username and Personal Access Token (PAT) in the Git panel. Credentials are stored securely using Expo SecureStore.

**Creating a PAT:**
1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token with `repo` scope
3. Use the token as your password

## Known Limitations

- **iOS only** for now (Android WebView has some quirks)
- **No TypeScript IntelliSense** (Sandpack limitation)
- **Large repos may be slow** to clone (browser Git)
- **Offline commits work**, but push requires network

## Tech Stack

- **React Native** (Expo)
- **Sandpack** (@codesandbox/sandpack-react)
- **isomorphic-git** + **LightningFS**
- **Vite** (web editor bundler)
- **TypeScript**

## License

MIT
