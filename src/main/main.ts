import { app, BrowserWindow, ipcMain, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as pty from 'node-pty'
import Store from 'electron-store'

const isDev = process.env.NODE_ENV !== 'production'

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

function resolveShell(): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return { command: 'powershell.exe', args: [] }
  }

  const candidates = [
    process.env.MOSAIC_SHELL,
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
  return store.get('theme', 'dark')
})

// Save theme
ipcMain.handle('store:saveTheme', (_event, theme: string) => {
  store.set('theme', theme)
  return { success: true }
})

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
