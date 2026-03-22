import { app, BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as pty from 'node-pty'
import Store from 'electron-store'

const isDev = process.env.NODE_ENV !== 'production'
const githubRepoUrl = 'https://github.com/pinkpixel-dev/sorbet'
const defaultPreferences = {
  defaultThemeId: 'sorbet',
  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
  fontSize: 13,
  lineHeight: 1.2,
  letterSpacing: 0,
  scrollback: 5000,
}
const themeTemplate = {
  id: 'custom-neon',
  name: 'Custom Neon',
  background: '#10161e',
  foreground: '#edf6ff',
  cursor: '#7ef9ff',
  cursorAccent: '#10161e',
  selectionBackground: '#7ef9ff33',
  black: '#202735',
  red: '#ff5fa2',
  green: '#b9ff6f',
  yellow: '#ffe66b',
  blue: '#7da6ff',
  magenta: '#d98cff',
  cyan: '#7ef9ff',
  white: '#edf6ff',
  brightBlack: '#526175',
  brightRed: '#ff8cbc',
  brightGreen: '#d2ff9a',
  brightYellow: '#fff19a',
  brightBlue: '#a6c1ff',
  brightMagenta: '#ebb2ff',
  brightCyan: '#b8fdff',
  brightWhite: '#ffffff',
  accent: '#ff5fa2',
}

if (process.platform === 'linux') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('use-gl', 'swiftshader')
  app.commandLine.appendSwitch('disable-features', 'Vulkan')
}

// ─── Store ────────────────────────────────────────────────────────────────────
const store = new Store()

// ─── PTY Session Map ──────────────────────────────────────────────────────────
interface PtySession {
  pty: pty.IPty
  sessionId: string
}

const sessions = new Map<string, PtySession>()
let themeDirectoryWatcher: fs.FSWatcher | null = null
let configChangedTimeout: NodeJS.Timeout | null = null

function resolveShell(): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return { command: 'powershell.exe', args: [] }
  }

  const candidates = [
    process.env.SORBET_SHELL,
    '/usr/bin/bash',
    '/bin/bash',
    '/usr/bin/zsh',
    '/bin/zsh',
    process.env.SHELL,
    '/bin/sh',
  ].filter((value): value is string => Boolean(value))

  const command = candidates.find((value) => fs.existsSync(value)) || '/bin/sh'
  const name = path.basename(command)

  if (name === 'bash' || name === 'zsh') {
    return { command, args: ['-i'] }
  }

  if (name === 'fish') {
    return { command, args: ['-i'] }
  }

  return { command, args: [] }
}

// ─── Window ───────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null

function openExternalUrl(url: string) {
  void shell.openExternal(url)
}

function getPreferencesPath() {
  return path.join(app.getPath('userData'), 'preferences.json')
}

function getThemesDirectoryPath() {
  return path.join(app.getPath('userData'), 'themes')
}

function writePrettyJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function ensureUserConfiguration() {
  fs.mkdirSync(getThemesDirectoryPath(), { recursive: true })

  if (!fs.existsSync(getPreferencesPath())) {
    writePrettyJson(getPreferencesPath(), defaultPreferences)
  }
}

function broadcastConfigChanged() {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send('config:changed')
    }
  })
}

function scheduleConfigChangedBroadcast() {
  if (configChangedTimeout) {
    clearTimeout(configChangedTimeout)
  }

  configChangedTimeout = setTimeout(() => {
    configChangedTimeout = null
    broadcastConfigChanged()
  }, 150)
}

function startConfigWatchers() {
  if (themeDirectoryWatcher) return

  fs.watchFile(getPreferencesPath(), { interval: 500 }, (current, previous) => {
    if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size) {
      scheduleConfigChangedBroadcast()
    }
  })

  themeDirectoryWatcher = fs.watch(getThemesDirectoryPath(), () => {
    scheduleConfigChangedBroadcast()
  })
}

function normalizePreferences(raw: unknown) {
  const data = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
  return {
    defaultThemeId: typeof data.defaultThemeId === 'string' ? data.defaultThemeId : defaultPreferences.defaultThemeId,
    fontFamily: typeof data.fontFamily === 'string' ? data.fontFamily : defaultPreferences.fontFamily,
    fontSize: typeof data.fontSize === 'number' ? data.fontSize : defaultPreferences.fontSize,
    lineHeight: typeof data.lineHeight === 'number' ? data.lineHeight : defaultPreferences.lineHeight,
    letterSpacing: typeof data.letterSpacing === 'number' ? data.letterSpacing : defaultPreferences.letterSpacing,
    scrollback: typeof data.scrollback === 'number' ? data.scrollback : defaultPreferences.scrollback,
  }
}

function readPreferences() {
  ensureUserConfiguration()

  try {
    const raw = JSON.parse(fs.readFileSync(getPreferencesPath(), 'utf8')) as unknown
    return normalizePreferences(raw)
  } catch {
    return defaultPreferences
  }
}

function isThemeRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== 'object' || value === null) return false

  const requiredKeys = [
    'id', 'name', 'background', 'foreground', 'cursor', 'cursorAccent',
    'selectionBackground', 'black', 'red', 'green', 'yellow', 'blue',
    'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen',
    'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
    'accent',
  ]

  return requiredKeys.every((key) => typeof (value as Record<string, unknown>)[key] === 'string')
}

function readCustomThemes() {
  ensureUserConfiguration()

  return fs
    .readdirSync(getThemesDirectoryPath(), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const filePath = path.join(getThemesDirectoryPath(), entry.name)
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
        return isThemeRecord(parsed) ? [parsed] : []
      } catch {
        return []
      }
    })
}

async function openPreferencesJson() {
  ensureUserConfiguration()
  const error = await shell.openPath(getPreferencesPath())
  if (error) {
    shell.showItemInFolder(getPreferencesPath())
  }
}

async function createThemeTemplateFile() {
  ensureUserConfiguration()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = path.join(getThemesDirectoryPath(), `theme-${timestamp}.json`)
  writePrettyJson(filePath, {
    ...themeTemplate,
    id: `custom-${timestamp.toLowerCase()}`,
    name: `Custom Theme ${timestamp}`,
  })
  scheduleConfigChangedBroadcast()
  const error = await shell.openPath(filePath)
  if (error) {
    shell.showItemInFolder(filePath)
  }
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin'
  const appSubmenu: MenuItemConstructorOptions[] = [
    { role: 'about' },
    { type: 'separator' },
    { role: 'services' },
    { type: 'separator' },
    { role: 'hide' },
    { role: 'hideOthers' },
    { role: 'unhide' },
    { type: 'separator' },
    { role: 'quit' },
  ]
  const fileSubmenu: MenuItemConstructorOptions[] = [
    {
      label: 'Preferences',
      submenu: [
        {
          label: 'Edit Preferences JSON',
          click: () => {
            void openPreferencesJson()
          },
        },
        {
          label: 'Create New Theme',
          click: () => {
            void createThemeTemplateFile()
          },
        },
      ],
    },
    { type: 'separator' },
    { role: 'close' },
  ]
  const editSubmenu: MenuItemConstructorOptions[] = isMac
    ? [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ]
    : [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ]
  const viewSubmenu: MenuItemConstructorOptions[] = [
    { role: 'reload' },
    { role: 'forceReload' },
    { role: 'toggleDevTools' },
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ]
  const windowSubmenu: MenuItemConstructorOptions[] = isMac
    ? [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ]
    : [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
      ]
  const helpSubmenu: MenuItemConstructorOptions[] = [
    {
      label: 'Sorbet on GitHub',
      click: () => openExternalUrl(githubRepoUrl),
    },
    {
      label: 'Report an Issue',
      click: () => openExternalUrl(`${githubRepoUrl}/issues/new`),
    },
    {
      label: 'Project README',
      click: () => openExternalUrl(`${githubRepoUrl}#readme`),
    },
  ]
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: appSubmenu,
        }]
      : []),
    {
      label: 'File',
      submenu: fileSubmenu,
    },
    {
      label: 'Edit',
      submenu: editSubmenu,
    },
    {
      label: 'View',
      submenu: viewSubmenu,
    },
    {
      label: 'Window',
      submenu: windowSubmenu,
    },
    {
      role: 'help',
      submenu: helpSubmenu,
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#09090b',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    // Kill all PTY sessions when window closes
    sessions.forEach((session) => {
      try { session.pty.kill() } catch {}
    })
    sessions.clear()
    mainWindow = null
  })

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Create a new PTY session
ipcMain.handle('pty:create', (event, sessionId: string, cols: number, rows: number) => {
  if (sessions.has(sessionId)) {
    return { success: false, error: 'Session already exists' }
  }

  try {
    const shell = resolveShell()
    const ptyProcess = pty.spawn(shell.command, shell.args, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: process.env.HOME || process.cwd(),
      env: {
        ...process.env,
        SHELL: shell.command,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      } as Record<string, string>,
    })

    ptyProcess.onData((data: string) => {
      if (!mainWindow?.isDestroyed()) {
        mainWindow?.webContents.send(`pty:data:${sessionId}`, data)
      }
    })

    ptyProcess.onExit(({ exitCode, signal }) => {
      if (!mainWindow?.isDestroyed()) {
        mainWindow?.webContents.send(`pty:exit:${sessionId}`, { exitCode, signal })
      }
      sessions.delete(sessionId)
    })

    sessions.set(sessionId, { pty: ptyProcess, sessionId })
    return { success: true, pid: ptyProcess.pid }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// Write input to a PTY session
ipcMain.on('pty:write', (_event, sessionId: string, data: string) => {
  const session = sessions.get(sessionId)
  if (session) {
    try { session.pty.write(data) } catch {}
  }
})

// Resize a PTY session
ipcMain.on('pty:resize', (_event, sessionId: string, cols: number, rows: number) => {
  const session = sessions.get(sessionId)
  if (session) {
    try { session.pty.resize(Math.max(2, cols), Math.max(2, rows)) } catch {}
  }
})

// Kill a PTY session
ipcMain.handle('pty:kill', (_event, sessionId: string) => {
  const session = sessions.get(sessionId)
  if (session) {
    try { session.pty.kill() } catch {}
    sessions.delete(sessionId)
  }
  return { success: true }
})

// Get saved layout from store
ipcMain.handle('store:getLayout', () => {
  return store.get('layout', null)
})

// Save layout to store
ipcMain.handle('store:saveLayout', (_event, layout: unknown) => {
  store.set('layout', layout)
  return { success: true }
})

// Get saved theme
ipcMain.handle('store:getTheme', () => {
  const preferences = readPreferences()
  return store.get('theme', preferences.defaultThemeId)
})

// Save theme
ipcMain.handle('store:saveTheme', (_event, theme: string) => {
  store.set('theme', theme)
  return { success: true }
})

ipcMain.handle('config:getPreferences', () => {
  return readPreferences()
})

ipcMain.handle('config:getCustomThemes', () => {
  return readCustomThemes()
})

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  ensureUserConfiguration()
  startConfigWatchers()
  buildAppMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  fs.unwatchFile(getPreferencesPath())
  themeDirectoryWatcher?.close()
  themeDirectoryWatcher = null
  if (configChangedTimeout) {
    clearTimeout(configChangedTimeout)
    configChangedTimeout = null
  }
})
