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
const child_process_1 = require("child_process");
const electron_store_1 = __importDefault(require("electron-store"));
const isDev = !electron_1.app.isPackaged;
const appId = 'dev.pinkpixel.sorbet';
const githubRepoUrl = 'https://github.com/pinkpixel-dev/sorbet';
const defaultPreferences = {
    defaultThemeId: 'sorbet',
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
    fontSize: 13,
    lineHeight: 1.2,
    letterSpacing: 0,
    scrollback: 5000,
    enableClipboardShortcuts: true,
    rightClickPaste: false,
    middleClickPaste: true,
    copyShortcut: 'CmdOrCtrl+Shift+C',
    pasteShortcut: 'CmdOrCtrl+Shift+V',
};
const preferencesTemplateVersion = 4;
const devServerPort = process.env.SORBET_DEV_PORT || '38173';
const devServerUrl = `http://localhost:${devServerPort}`;
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
};
if (process.platform === 'linux') {
    electron_1.app.disableHardwareAcceleration();
    electron_1.app.commandLine.appendSwitch('disable-gpu');
    electron_1.app.commandLine.appendSwitch('disable-gpu-compositing');
    electron_1.app.commandLine.appendSwitch('use-gl', 'swiftshader');
    electron_1.app.commandLine.appendSwitch('disable-features', 'AcceleratedVideoDecodeLinuxGL,VaapiVideoDecoder,Vulkan');
}
if (process.platform === 'win32') {
    electron_1.app.setAppUserModelId(appId);
}
// ─── Store ────────────────────────────────────────────────────────────────────
const store = new electron_store_1.default();
const sessions = new Map();
let themeDirectoryWatcher = null;
let configChangedTimeout = null;
function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function getFallbackThemeId() {
    return typeof store.get('theme') === 'string'
        ? String(store.get('theme'))
        : defaultPreferences.defaultThemeId;
}
function createTemplateLayoutItem(id, x, y, w, h, options = {}) {
    return {
        i: id,
        x,
        y,
        w,
        h,
        minW: options.minW ?? 12,
        minH: options.minH ?? 16,
    };
}
function createTemplateSession(id, title, options = {}) {
    return {
        id,
        title,
        isAlive: false,
        createdAt: 0,
        isMinimized: options.isMinimized ?? false,
        isPinned: options.isPinned ?? false,
        themeId: options.themeId,
        shellName: undefined,
        cwd: undefined,
    };
}
function createWorkspaceTemplate(id, name, description, category, accent, suggestedWorkspaceName, snapshot) {
    return {
        id,
        name,
        description,
        category,
        accent,
        suggestedWorkspaceName,
        snapshot: normalizeWorkspaceSnapshot(snapshot, snapshot.themeId || defaultPreferences.defaultThemeId),
    };
}
const builtInWorkspaceTemplates = [
    createWorkspaceTemplate('full-stack', 'Full-Stack Flow', 'A balanced four-terminal layout for app server work, frontend work, tests, and logs.', 'Development', '#ec4899', 'Full-Stack Workspace', {
        themeId: 'sorbet',
        layout: [
            createTemplateLayoutItem('api', 0, 0, 24, 30),
            createTemplateLayoutItem('web', 24, 0, 24, 30),
            createTemplateLayoutItem('tests', 0, 30, 18, 22),
            createTemplateLayoutItem('logs', 18, 30, 30, 22),
        ],
        sessions: [
            createTemplateSession('api', 'API Server', { themeId: 'sorbet' }),
            createTemplateSession('web', 'Web App', { themeId: 'tokyonight' }),
            createTemplateSession('tests', 'Tests', { themeId: 'nord', isPinned: true }),
            createTemplateSession('logs', 'Logs', { themeId: 'gruvbox' }),
        ],
    }),
    createWorkspaceTemplate('monitoring', 'Server Monitoring', 'A supervision layout for long-running services, metrics, incident notes, and deploy output.', 'Operations', '#7aa2f7', 'Monitoring Workspace', {
        themeId: 'dark',
        layout: [
            createTemplateLayoutItem('service', 0, 0, 20, 26),
            createTemplateLayoutItem('metrics', 20, 0, 28, 26),
            createTemplateLayoutItem('queue', 0, 26, 20, 26),
            createTemplateLayoutItem('deploy', 20, 26, 28, 26),
        ],
        sessions: [
            createTemplateSession('service', 'Primary Service', { themeId: 'dark' }),
            createTemplateSession('metrics', 'Metrics Watch', { themeId: 'nord' }),
            createTemplateSession('queue', 'Worker Queue', { themeId: 'dracula' }),
            createTemplateSession('deploy', 'Deploy Tail', { themeId: 'tokyonight' }),
        ],
    }),
    createWorkspaceTemplate('debugging', 'Debugging and Logs', 'A focused layout for reproduction, REPL work, trace output, and a pinned live log stream.', 'Diagnostics', '#f59e0b', 'Debug Workspace', {
        themeId: 'tokyonight',
        layout: [
            createTemplateLayoutItem('app', 0, 0, 24, 34),
            createTemplateLayoutItem('repl', 24, 0, 24, 20),
            createTemplateLayoutItem('trace', 24, 20, 24, 14),
            createTemplateLayoutItem('live-log', 0, 34, 48, 18),
        ],
        sessions: [
            createTemplateSession('app', 'Repro Terminal', { themeId: 'tokyonight' }),
            createTemplateSession('repl', 'Scratch REPL', { themeId: 'catppuccin' }),
            createTemplateSession('trace', 'Trace Output', { themeId: 'dracula' }),
            createTemplateSession('live-log', 'Live Logs', { themeId: 'gruvbox', isPinned: true }),
        ],
    }),
    createWorkspaceTemplate('writing', 'Documentation Writing', 'A calmer three-pane setup for drafting, previewing, and keeping research notes visible.', 'Writing', '#c084fc', 'Documentation Workspace', {
        themeId: 'catppuccin',
        layout: [
            createTemplateLayoutItem('draft', 0, 0, 22, 52),
            createTemplateLayoutItem('preview', 22, 0, 26, 30),
            createTemplateLayoutItem('research', 22, 30, 26, 22),
        ],
        sessions: [
            createTemplateSession('draft', 'Drafting', { themeId: 'catppuccin' }),
            createTemplateSession('preview', 'Preview / Build', { themeId: 'nord' }),
            createTemplateSession('research', 'Research Notes', { themeId: 'sorbet' }),
        ],
    }),
];
function normalizeLayoutItem(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const item = raw;
    if (typeof item.i !== 'string' ||
        typeof item.x !== 'number' ||
        typeof item.y !== 'number' ||
        typeof item.w !== 'number' ||
        typeof item.h !== 'number') {
        return null;
    }
    return {
        i: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: typeof item.minW === 'number' ? item.minW : undefined,
        minH: typeof item.minH === 'number' ? item.minH : undefined,
    };
}
function normalizeSession(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const session = raw;
    if (typeof session.id !== 'string')
        return null;
    return {
        id: session.id,
        title: typeof session.title === 'string' && session.title.trim() ? session.title : 'Terminal',
        pid: typeof session.pid === 'number' ? session.pid : undefined,
        isAlive: false,
        createdAt: typeof session.createdAt === 'number' ? session.createdAt : Date.now(),
        isMinimized: typeof session.isMinimized === 'boolean' ? session.isMinimized : false,
        isPinned: typeof session.isPinned === 'boolean' ? session.isPinned : false,
        themeId: typeof session.themeId === 'string' && session.themeId.trim() ? session.themeId : undefined,
        shellName: typeof session.shellName === 'string' && session.shellName.trim() ? session.shellName : undefined,
        cwd: typeof session.cwd === 'string' && session.cwd.trim() ? session.cwd : undefined,
    };
}
function readProcessCwd(pid) {
    if (!Number.isFinite(pid) || pid <= 0)
        return null;
    try {
        if (process.platform === 'linux') {
            return fs.readlinkSync(`/proc/${pid}/cwd`);
        }
        if (process.platform === 'darwin') {
            const result = spawnSyncSafe('lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn']);
            if (!result)
                return null;
            const cwdLine = result
                .split('\n')
                .find((line) => line.startsWith('n') && line.length > 1);
            return cwdLine ? cwdLine.slice(1) : null;
        }
    }
    catch {
        return null;
    }
    return null;
}
function spawnSyncSafe(command, args) {
    try {
        const result = (0, child_process_1.spawnSync)(command, args, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        if (result.error || result.status !== 0) {
            return null;
        }
        return result.stdout;
    }
    catch {
        return null;
    }
}
function startCwdPolling(session) {
    if (session.cwdPoller) {
        clearInterval(session.cwdPoller);
    }
    session.cwdPoller = setInterval(() => {
        const nextCwd = readProcessCwd(session.pty.pid);
        if (!nextCwd || nextCwd === session.cwd)
            return;
        session.cwd = nextCwd;
        const currentWindow = mainWindow;
        if (currentWindow && !currentWindow.isDestroyed()) {
            currentWindow.webContents.send(`pty:metadata:${session.sessionId}`, {
                shellName: session.shellName,
                cwd: session.cwd,
            });
        }
    }, 2000);
}
function normalizeWorkspaceSnapshot(raw, fallbackThemeId) {
    const data = raw && typeof raw === 'object' ? raw : {};
    const layout = Array.isArray(data.layout)
        ? data.layout.map(normalizeLayoutItem).filter((item) => Boolean(item))
        : [];
    const normalizedSessions = Array.isArray(data.sessions)
        ? data.sessions.map(normalizeSession).filter((session) => Boolean(session))
        : [];
    const sessionsById = new Map(normalizedSessions.map((session) => [session.id, session]));
    const sessions = layout.map((item) => {
        const existing = sessionsById.get(item.i);
        return (existing || {
            id: item.i,
            title: 'Terminal',
            isAlive: false,
            createdAt: Date.now(),
            isMinimized: false,
            isPinned: false,
            themeId: undefined,
        });
    });
    return {
        layout,
        sessions,
        themeId: typeof data.themeId === 'string' && data.themeId.trim()
            ? data.themeId
            : fallbackThemeId,
    };
}
function normalizeWorkspaceRecord(raw, fallbackThemeId) {
    if (!raw || typeof raw !== 'object')
        return null;
    const item = raw;
    const now = Date.now();
    if (typeof item.id !== 'string')
        return null;
    return {
        id: item.id,
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Untitled Workspace',
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : now,
        lastOpenedAt: typeof item.lastOpenedAt === 'number' ? item.lastOpenedAt : now,
        snapshot: normalizeWorkspaceSnapshot(item.snapshot, fallbackThemeId),
    };
}
function readWorkspaceState() {
    const fallbackThemeId = getFallbackThemeId();
    const raw = store.get('workspaces');
    if (raw && typeof raw === 'object') {
        const data = raw;
        const workspaces = Array.isArray(data.workspaces)
            ? data.workspaces
                .map((item) => normalizeWorkspaceRecord(item, fallbackThemeId))
                .filter((item) => Boolean(item))
            : [];
        const currentWorkspaceId = typeof data.currentWorkspaceId === 'string' ? data.currentWorkspaceId : null;
        if (workspaces.length > 0) {
            return {
                currentWorkspaceId: workspaces.some((workspace) => workspace.id === currentWorkspaceId)
                    ? currentWorkspaceId
                    : workspaces[0].id,
                workspaces,
            };
        }
    }
    const legacyLayoutRaw = store.get('layout');
    const legacyLayout = Array.isArray(legacyLayoutRaw)
        ? legacyLayoutRaw.map(normalizeLayoutItem).filter((item) => Boolean(item))
        : [];
    if (legacyLayout.length > 0) {
        const now = Date.now();
        const migratedWorkspace = {
            id: createId('ws'),
            name: 'Current Workspace',
            createdAt: now,
            updatedAt: now,
            lastOpenedAt: now,
            snapshot: normalizeWorkspaceSnapshot({
                layout: legacyLayout,
                sessions: legacyLayout.map((item) => ({
                    id: item.i,
                    title: 'Terminal',
                    isAlive: false,
                    createdAt: now,
                    isMinimized: false,
                    isPinned: false,
                    themeId: undefined,
                })),
                themeId: fallbackThemeId,
            }, fallbackThemeId),
        };
        const nextState = {
            currentWorkspaceId: migratedWorkspace.id,
            workspaces: [migratedWorkspace],
        };
        writeWorkspaceState(nextState);
        return nextState;
    }
    return {
        currentWorkspaceId: null,
        workspaces: [],
    };
}
function materializeWorkspaceSnapshot(snapshot, fallbackThemeId) {
    const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot, fallbackThemeId);
    const now = Date.now();
    const templateIds = Array.from(new Set([
        ...normalizedSnapshot.layout.map((item) => item.i),
        ...normalizedSnapshot.sessions.map((session) => session.id),
    ]));
    const idMap = new Map(templateIds.map((id) => [id, createId('sess')]));
    return normalizeWorkspaceSnapshot({
        layout: normalizedSnapshot.layout.map((item) => ({
            ...item,
            i: idMap.get(item.i) ?? createId('sess'),
        })),
        sessions: normalizedSnapshot.sessions.map((session) => ({
            ...session,
            id: idMap.get(session.id) ?? createId('sess'),
            pid: undefined,
            isAlive: false,
            createdAt: now,
            shellName: undefined,
            cwd: undefined,
        })),
        themeId: normalizedSnapshot.themeId,
    }, fallbackThemeId);
}
function createWorkspaceRecordFromSnapshot(name, snapshot, workspaceCount) {
    const now = Date.now();
    const fallbackThemeId = getFallbackThemeId();
    return {
        id: createId('ws'),
        name: typeof name === 'string' && name.trim() ? name.trim() : `Workspace ${workspaceCount + 1}`,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        snapshot: normalizeWorkspaceSnapshot(snapshot, fallbackThemeId),
    };
}
function createWorkspaceFromTemplateRecord(template, name, workspaceCount) {
    const fallbackThemeId = getFallbackThemeId();
    const materializedSnapshot = materializeWorkspaceSnapshot(template.snapshot, fallbackThemeId);
    return createWorkspaceRecordFromSnapshot(name || template.suggestedWorkspaceName, materializedSnapshot, workspaceCount);
}
function writeWorkspaceState(state) {
    store.set('workspaces', state);
}
function resolveShell() {
    if (process.platform === 'win32') {
        return { command: 'powershell.exe', args: [] };
    }
    const candidates = [
        process.env.SORBET_SHELL,
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
function getWindowIconPath() {
    return path.join(__dirname, '../../assets/icons/png/512x512.png');
}
function openExternalUrl(url) {
    void electron_1.shell.openExternal(url);
}
function getPreferencesPath() {
    return path.join(electron_1.app.getPath('userData'), 'preferences.json');
}
function getThemesDirectoryPath() {
    return path.join(electron_1.app.getPath('userData'), 'themes');
}
function writePrettyJson(filePath, value) {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function createPreferencesTemplate(overrides = {}) {
    return {
        _template: {
            version: preferencesTemplateVersion,
            note: 'Edit the setting values below. Extra keys that start with "_" are ignored by Sorbet and only exist to help explain the file.',
            fontFamilyHelp: 'Use any font installed on your computer. This value should be a CSS font-family string and should usually end with monospace as a fallback.',
            fontFamilyExamples: [
                '"JetBrains Mono", "Cascadia Code", monospace',
                '"Fira Code", monospace',
                '"SF Mono", Menlo, monospace',
                '"Consolas", "Courier New", monospace',
            ],
            recommendedMonospaceFonts: [
                'JetBrains Mono',
                'Cascadia Code',
                'Consolas',
                'Menlo',
                'Monaco',
                'DejaVu Sans Mono',
                'Liberation Mono',
            ],
            nerdFonts: {
                recommendation: 'If you want the widest glyph/icon support, install a Nerd Font and use it here as your primary terminal font.',
                website: 'https://www.nerdfonts.com/',
                repo: 'https://github.com/ryanoasis/nerd-fonts',
            },
            settingsGuide: {
                defaultThemeId: 'The theme id to use by default for new launches if no theme has been selected yet.',
                fontFamily: 'A CSS font-family string. Quote multi-word names.',
                fontSize: 'Terminal font size in pixels.',
                lineHeight: 'Line height multiplier. 1.0 to 1.3 is usually a good range.',
                letterSpacing: 'Extra spacing between characters. 0 is normal.',
                scrollback: 'Number of lines kept in scrollback history.',
                enableClipboardShortcuts: 'When true, Cmd/Ctrl+Shift+C copies the current selection and Cmd/Ctrl+Shift+V pastes clipboard contents into the terminal.',
                rightClickPaste: 'Optional. When true, right-clicking inside the terminal pastes plain text from the clipboard. Default is false.',
                middleClickPaste: 'When true, clicking the middle mouse button inside the terminal pastes plain text from the clipboard. Default is true.',
                copyShortcut: 'Shortcut string for copy. Use names like CmdOrCtrl+Shift+C, Ctrl+Alt+C, or Alt+C.',
                pasteShortcut: 'Shortcut string for paste. Use names like CmdOrCtrl+Shift+V, Ctrl+Alt+V, or Alt+V.',
            },
            defaultClipboardBehavior: {
                rightClick: 'By default this is not overridden by Sorbet. Depending on platform behavior, right-click may show the native context menu or copy selected text.',
                middleClick: 'By default this pastes clipboard contents into the terminal.',
                keyboard: 'By default use CmdOrCtrl+Shift+C to copy and CmdOrCtrl+Shift+V to paste.',
            },
        },
        ...defaultPreferences,
        ...overrides,
    };
}
function ensurePreferencesTemplateShape() {
    const filePath = getPreferencesPath();
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const currentVersion = typeof raw._template === 'object' &&
            raw._template !== null &&
            typeof raw._template.version === 'number'
            ? raw._template.version
            : 0;
        if (currentVersion >= preferencesTemplateVersion)
            return;
        writePrettyJson(filePath, createPreferencesTemplate({
            defaultThemeId: typeof raw.defaultThemeId === 'string' ? raw.defaultThemeId : defaultPreferences.defaultThemeId,
            fontFamily: typeof raw.fontFamily === 'string' ? raw.fontFamily : defaultPreferences.fontFamily,
            fontSize: typeof raw.fontSize === 'number' ? raw.fontSize : defaultPreferences.fontSize,
            lineHeight: typeof raw.lineHeight === 'number' ? raw.lineHeight : defaultPreferences.lineHeight,
            letterSpacing: typeof raw.letterSpacing === 'number' ? raw.letterSpacing : defaultPreferences.letterSpacing,
            scrollback: typeof raw.scrollback === 'number' ? raw.scrollback : defaultPreferences.scrollback,
            enableClipboardShortcuts: typeof raw.enableClipboardShortcuts === 'boolean' ? raw.enableClipboardShortcuts : defaultPreferences.enableClipboardShortcuts,
            rightClickPaste: typeof raw.rightClickPaste === 'boolean' ? raw.rightClickPaste : defaultPreferences.rightClickPaste,
            middleClickPaste: typeof raw.middleClickPaste === 'boolean' ? raw.middleClickPaste : defaultPreferences.middleClickPaste,
            copyShortcut: typeof raw.copyShortcut === 'string' ? raw.copyShortcut : defaultPreferences.copyShortcut,
            pasteShortcut: typeof raw.pasteShortcut === 'string' ? raw.pasteShortcut : defaultPreferences.pasteShortcut,
        }));
    }
    catch {
        writePrettyJson(filePath, createPreferencesTemplate());
    }
}
function ensureUserConfiguration() {
    fs.mkdirSync(getThemesDirectoryPath(), { recursive: true });
    if (!fs.existsSync(getPreferencesPath())) {
        writePrettyJson(getPreferencesPath(), createPreferencesTemplate());
        return;
    }
    ensurePreferencesTemplateShape();
}
function broadcastConfigChanged() {
    electron_1.BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed()) {
            window.webContents.send('config:changed');
        }
    });
}
function scheduleConfigChangedBroadcast() {
    if (configChangedTimeout) {
        clearTimeout(configChangedTimeout);
    }
    configChangedTimeout = setTimeout(() => {
        configChangedTimeout = null;
        broadcastConfigChanged();
    }, 150);
}
function startConfigWatchers() {
    if (themeDirectoryWatcher)
        return;
    fs.watchFile(getPreferencesPath(), { interval: 500 }, (current, previous) => {
        if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size) {
            scheduleConfigChangedBroadcast();
        }
    });
    themeDirectoryWatcher = fs.watch(getThemesDirectoryPath(), () => {
        scheduleConfigChangedBroadcast();
    });
}
function normalizePreferences(raw) {
    const data = typeof raw === 'object' && raw !== null ? raw : {};
    return {
        defaultThemeId: typeof data.defaultThemeId === 'string' ? data.defaultThemeId : defaultPreferences.defaultThemeId,
        fontFamily: typeof data.fontFamily === 'string' ? data.fontFamily : defaultPreferences.fontFamily,
        fontSize: typeof data.fontSize === 'number' ? data.fontSize : defaultPreferences.fontSize,
        lineHeight: typeof data.lineHeight === 'number' ? data.lineHeight : defaultPreferences.lineHeight,
        letterSpacing: typeof data.letterSpacing === 'number' ? data.letterSpacing : defaultPreferences.letterSpacing,
        scrollback: typeof data.scrollback === 'number' ? data.scrollback : defaultPreferences.scrollback,
        enableClipboardShortcuts: typeof data.enableClipboardShortcuts === 'boolean' ? data.enableClipboardShortcuts : defaultPreferences.enableClipboardShortcuts,
        rightClickPaste: typeof data.rightClickPaste === 'boolean' ? data.rightClickPaste : defaultPreferences.rightClickPaste,
        middleClickPaste: typeof data.middleClickPaste === 'boolean' ? data.middleClickPaste : defaultPreferences.middleClickPaste,
        copyShortcut: typeof data.copyShortcut === 'string' ? data.copyShortcut : defaultPreferences.copyShortcut,
        pasteShortcut: typeof data.pasteShortcut === 'string' ? data.pasteShortcut : defaultPreferences.pasteShortcut,
    };
}
function readPreferences() {
    ensureUserConfiguration();
    try {
        const raw = JSON.parse(fs.readFileSync(getPreferencesPath(), 'utf8'));
        return normalizePreferences(raw);
    }
    catch {
        return defaultPreferences;
    }
}
function isThemeRecord(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const requiredKeys = [
        'id', 'name', 'background', 'foreground', 'cursor', 'cursorAccent',
        'selectionBackground', 'black', 'red', 'green', 'yellow', 'blue',
        'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen',
        'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
        'accent',
    ];
    return requiredKeys.every((key) => typeof value[key] === 'string');
}
function readCustomThemes() {
    ensureUserConfiguration();
    return fs
        .readdirSync(getThemesDirectoryPath(), { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((entry) => {
        const filePath = path.join(getThemesDirectoryPath(), entry.name);
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return isThemeRecord(parsed) ? [parsed] : [];
        }
        catch {
            return [];
        }
    });
}
function splitCommand(command) {
    return command.trim().split(/\s+/).filter(Boolean);
}
function canUseCommand(command) {
    const [binary] = splitCommand(command);
    return Boolean(binary) && (binary.includes('/') ? fs.existsSync(binary) : true);
}
function launchDetached(command, args) {
    const [binary, ...commandArgs] = splitCommand(command);
    if (!binary) {
        return Promise.resolve(false);
    }
    return new Promise((resolve) => {
        let settled = false;
        const child = (0, child_process_1.spawn)(binary, [...commandArgs, ...args], {
            detached: true,
            stdio: 'ignore',
        });
        child.once('error', () => {
            if (!settled) {
                settled = true;
                resolve(false);
            }
        });
        child.once('spawn', () => {
            child.unref();
            if (!settled) {
                settled = true;
                resolve(true);
            }
        });
    });
}
async function openTextFile(filePath) {
    const preferredEditor = process.env.VISUAL || process.env.EDITOR;
    try {
        if (preferredEditor && canUseCommand(preferredEditor)) {
            if (await launchDetached(preferredEditor, [filePath])) {
                return;
            }
        }
        if (process.platform === 'darwin') {
            if (await launchDetached('open', ['-t', filePath])) {
                return;
            }
        }
        if (process.platform === 'win32') {
            if (await launchDetached('notepad.exe', [filePath])) {
                return;
            }
        }
        const linuxEditors = [
            '/usr/bin/code',
            '/usr/bin/codium',
            '/usr/bin/gedit',
            '/usr/bin/kate',
            '/usr/bin/pluma',
            '/usr/bin/mousepad',
            '/usr/bin/leafpad',
            '/usr/bin/nano',
            '/usr/bin/vim',
            '/usr/bin/vi',
        ];
        const availableEditor = linuxEditors.find((candidate) => fs.existsSync(candidate));
        if (availableEditor) {
            if (await launchDetached(availableEditor, [filePath])) {
                return;
            }
        }
    }
    catch { }
    const error = await electron_1.shell.openPath(filePath);
    if (error) {
        electron_1.shell.showItemInFolder(filePath);
    }
}
async function openPreferencesJson() {
    ensureUserConfiguration();
    await openTextFile(getPreferencesPath());
}
async function createThemeTemplateFile() {
    ensureUserConfiguration();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(getThemesDirectoryPath(), `theme-${timestamp}.json`);
    writePrettyJson(filePath, {
        ...themeTemplate,
        id: `custom-${timestamp.toLowerCase()}`,
        name: `Custom Theme ${timestamp}`,
    });
    scheduleConfigChangedBroadcast();
    await openTextFile(filePath);
}
function buildAppMenu() {
    const isMac = process.platform === 'darwin';
    const appSubmenu = [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
    ];
    const fileSubmenu = [
        {
            label: 'Preferences',
            submenu: [
                {
                    label: 'Edit Preferences JSON',
                    click: () => {
                        void openPreferencesJson();
                    },
                },
                {
                    label: 'Create New Theme',
                    click: () => {
                        void createThemeTemplateFile();
                    },
                },
            ],
        },
        { type: 'separator' },
        { role: 'close' },
    ];
    const editSubmenu = isMac
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
        ];
    const viewSubmenu = [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
    ];
    const windowSubmenu = isMac
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
        ];
    const helpSubmenu = [
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
    ];
    const template = [
        ...(isMac
            ? [{
                    label: electron_1.app.name,
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
    ];
    electron_1.Menu.setApplicationMenu(electron_1.Menu.buildFromTemplate(template));
}
function createWindow() {
    const isMac = process.platform === 'darwin';
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#09090b',
        ...(isMac
            ? {
                titleBarStyle: 'hiddenInset',
                trafficLightPosition: { x: 14, y: 14 },
            }
            : {}),
        icon: process.platform === 'darwin' ? undefined : getWindowIconPath(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false,
    });
    const loadTarget = isDev
        ? mainWindow.loadURL(devServerUrl)
        : mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    void loadTarget.catch((error) => {
        console.error('Failed to load renderer:', error);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
        }
    });
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    mainWindow.webContents.once('did-finish-load', () => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            mainWindow.show();
        }
    });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame)
            return;
        console.error(`Renderer failed to load (${errorCode}): ${errorDescription} [${validatedURL}]`);
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            mainWindow.show();
        }
    });
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        console.error('Renderer process gone:', details.reason);
    });
    setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
            mainWindow.show();
        }
    }, 1500);
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
        const shellName = path.basename(shell.command);
        const cwd = process.env.HOME || process.cwd();
        const ptyProcess = pty.spawn(shell.command, shell.args, {
            name: 'xterm-256color',
            cols: cols || 80,
            rows: rows || 24,
            cwd,
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
            const currentSession = sessions.get(sessionId);
            if (currentSession?.cwdPoller) {
                clearInterval(currentSession.cwdPoller);
            }
            sessions.delete(sessionId);
        });
        const ptySession = {
            pty: ptyProcess,
            sessionId,
            shellName,
            cwd,
        };
        sessions.set(sessionId, ptySession);
        startCwdPolling(ptySession);
        return { success: true, pid: ptyProcess.pid, shellName, cwd };
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
        if (session.cwdPoller) {
            clearInterval(session.cwdPoller);
        }
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
    const workspaceState = readWorkspaceState();
    const current = workspaceState.workspaces.find((workspace) => workspace.id === workspaceState.currentWorkspaceId);
    return current?.snapshot.layout ?? store.get('layout', null);
});
// Save layout to store
electron_1.ipcMain.handle('store:saveLayout', (_event, layout) => {
    store.set('layout', layout);
    return { success: true };
});
// Get saved theme
electron_1.ipcMain.handle('store:getTheme', () => {
    const preferences = readPreferences();
    return store.get('theme', preferences.defaultThemeId);
});
// Save theme
electron_1.ipcMain.handle('store:saveTheme', (_event, theme) => {
    store.set('theme', theme);
    return { success: true };
});
electron_1.ipcMain.handle('store:getWorkspaces', () => {
    return readWorkspaceState();
});
electron_1.ipcMain.handle('store:getWorkspaceTemplates', () => {
    return builtInWorkspaceTemplates;
});
electron_1.ipcMain.handle('store:createWorkspace', (_event, name, snapshot, makeCurrent = true) => {
    const state = readWorkspaceState();
    const workspace = createWorkspaceRecordFromSnapshot(name, snapshot, state.workspaces.length);
    const nextState = {
        currentWorkspaceId: makeCurrent ? workspace.id : state.currentWorkspaceId,
        workspaces: [...state.workspaces, workspace],
    };
    writeWorkspaceState(nextState);
    return workspace;
});
electron_1.ipcMain.handle('store:createWorkspaceFromTemplate', (_event, templateId, name) => {
    const state = readWorkspaceState();
    const template = builtInWorkspaceTemplates.find((item) => item.id === templateId);
    if (!template)
        return null;
    const workspace = createWorkspaceFromTemplateRecord(template, typeof name === 'string' ? name.trim() : '', state.workspaces.length);
    const nextState = {
        currentWorkspaceId: workspace.id,
        workspaces: [...state.workspaces, workspace],
    };
    writeWorkspaceState(nextState);
    store.set('layout', workspace.snapshot.layout);
    store.set('theme', workspace.snapshot.themeId);
    return workspace;
});
electron_1.ipcMain.handle('store:updateWorkspace', (_event, id, updates) => {
    const state = readWorkspaceState();
    const payload = updates && typeof updates === 'object' ? updates : {};
    let updatedWorkspace = null;
    const workspaces = state.workspaces.map((workspace) => {
        if (workspace.id !== id)
            return workspace;
        updatedWorkspace = {
            ...workspace,
            name: typeof payload.name === 'string' && payload.name.trim()
                ? payload.name.trim()
                : workspace.name,
            updatedAt: Date.now(),
        };
        return updatedWorkspace;
    });
    writeWorkspaceState({
        ...state,
        workspaces,
    });
    return updatedWorkspace;
});
electron_1.ipcMain.handle('store:updateWorkspaceSnapshot', (_event, id, snapshot) => {
    const state = readWorkspaceState();
    const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot, getFallbackThemeId());
    const workspaces = state.workspaces.map((workspace) => workspace.id === id
        ? {
            ...workspace,
            updatedAt: Date.now(),
            snapshot: normalizedSnapshot,
        }
        : workspace);
    writeWorkspaceState({
        ...state,
        workspaces,
    });
    store.set('layout', normalizedSnapshot.layout);
    store.set('theme', normalizedSnapshot.themeId);
    return { success: true };
});
electron_1.ipcMain.handle('store:deleteWorkspace', (_event, id) => {
    const state = readWorkspaceState();
    const workspaces = state.workspaces.filter((workspace) => workspace.id !== id);
    const currentWorkspaceId = state.currentWorkspaceId === id ? workspaces[0]?.id ?? null : state.currentWorkspaceId;
    writeWorkspaceState({
        currentWorkspaceId,
        workspaces,
    });
    return { success: true, currentWorkspaceId };
});
electron_1.ipcMain.handle('store:setCurrentWorkspace', (_event, id) => {
    const state = readWorkspaceState();
    const now = Date.now();
    const existingWorkspace = state.workspaces.find((workspace) => workspace.id === id);
    if (!existingWorkspace)
        return null;
    const currentWorkspace = {
        ...existingWorkspace,
        lastOpenedAt: now,
    };
    const workspaces = state.workspaces.map((workspace) => workspace.id === id ? currentWorkspace : workspace);
    writeWorkspaceState({
        currentWorkspaceId: id,
        workspaces,
    });
    store.set('layout', currentWorkspace.snapshot.layout);
    store.set('theme', currentWorkspace.snapshot.themeId);
    return currentWorkspace;
});
electron_1.ipcMain.handle('config:getPreferences', () => {
    return readPreferences();
});
electron_1.ipcMain.handle('config:getCustomThemes', () => {
    return readCustomThemes();
});
// ─── App Lifecycle ────────────────────────────────────────────────────────────
electron_1.app.whenReady().then(() => {
    ensureUserConfiguration();
    startConfigWatchers();
    buildAppMenu();
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
electron_1.app.on('before-quit', () => {
    fs.unwatchFile(getPreferencesPath());
    themeDirectoryWatcher?.close();
    themeDirectoryWatcher = null;
    if (configChangedTimeout) {
        clearTimeout(configChangedTimeout);
        configChangedTimeout = null;
    }
});
