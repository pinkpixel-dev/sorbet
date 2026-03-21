"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const pty = __importStar(require("node-pty"));
const electron_store_1 = __importDefault(require("electron-store"));
const isDev = process.env.NODE_ENV !== 'production';
if (process.platform === 'linux') {
    electron_1.app.disableHardwareAcceleration();
    electron_1.app.commandLine.appendSwitch('disable-gpu');
    electron_1.app.commandLine.appendSwitch('use-gl', 'swiftshader');
    electron_1.app.commandLine.appendSwitch('disable-features', 'Vulkan');
}
// ─── Store ────────────────────────────────────────────────────────────────────
const store = new electron_store_1.default();
const sessions = new Map();
function resolveShell() {
    if (process.platform === 'win32') {
        return { command: 'powershell.exe', args: [] };
    }
    const candidates = [
        process.env.MOSAIC_SHELL,
        '/usr/bin/bash',
        '/bin/bash',
        '/usr/bin/zsh',
        '/bin/zsh',
        process.env.SHELL,
        '/bin/sh',
    ].filter((value) => Boolean(value));
    const command = candidates.find((value) => fs.existsSync(value)) || '/bin/sh';
    const name = path.basename(command);
    if (name === 'bash' || name === 'zsh') {
        return { command, args: ['-i'] };
    }
    if (name === 'fish') {
        return { command, args: ['-i'] };
    }
    return { command, args: [] };
}
// ─── Window ───────────────────────────────────────────────────────────────────
let mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
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
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    mainWindow.on('closed', () => {
        // Kill all PTY sessions when window closes
        sessions.forEach((session) => {
            try {
                session.pty.kill();
            }
            catch { }
        });
        sessions.clear();
        mainWindow = null;
    });
    // Open external links in browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
}
// ─── IPC Handlers ─────────────────────────────────────────────────────────────
// Create a new PTY session
electron_1.ipcMain.handle('pty:create', (event, sessionId, cols, rows) => {
    if (sessions.has(sessionId)) {
        return { success: false, error: 'Session already exists' };
    }
    try {
        const shell = resolveShell();
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
            },
        });
        ptyProcess.onData((data) => {
            if (!mainWindow?.isDestroyed()) {
                mainWindow?.webContents.send(`pty:data:${sessionId}`, data);
            }
        });
        ptyProcess.onExit(({ exitCode, signal }) => {
            if (!mainWindow?.isDestroyed()) {
                mainWindow?.webContents.send(`pty:exit:${sessionId}`, { exitCode, signal });
            }
            sessions.delete(sessionId);
        });
        sessions.set(sessionId, { pty: ptyProcess, sessionId });
        return { success: true, pid: ptyProcess.pid };
    }
    catch (err) {
        return { success: false, error: String(err) };
    }
});
// Write input to a PTY session
electron_1.ipcMain.on('pty:write', (_event, sessionId, data) => {
    const session = sessions.get(sessionId);
    if (session) {
        try {
            session.pty.write(data);
        }
        catch { }
    }
});
// Resize a PTY session
electron_1.ipcMain.on('pty:resize', (_event, sessionId, cols, rows) => {
    const session = sessions.get(sessionId);
    if (session) {
        try {
            session.pty.resize(Math.max(2, cols), Math.max(2, rows));
        }
        catch { }
    }
});
// Kill a PTY session
electron_1.ipcMain.handle('pty:kill', (_event, sessionId) => {
    const session = sessions.get(sessionId);
    if (session) {
        try {
            session.pty.kill();
        }
        catch { }
        sessions.delete(sessionId);
    }
    return { success: true };
});
// Get saved layout from store
electron_1.ipcMain.handle('store:getLayout', () => {
    return store.get('layout', null);
});
// Save layout to store
electron_1.ipcMain.handle('store:saveLayout', (_event, layout) => {
    store.set('layout', layout);
    return { success: true };
});
// Get saved theme
electron_1.ipcMain.handle('store:getTheme', () => {
    return store.get('theme', 'dark');
});
// Save theme
electron_1.ipcMain.handle('store:saveTheme', (_event, theme) => {
    store.set('theme', theme);
    return { success: true };
});
// ─── App Lifecycle ────────────────────────────────────────────────────────────
electron_1.app.whenReady().then(() => {
    createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
