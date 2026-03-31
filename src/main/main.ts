import { app, BrowserWindow, ipcMain, Menu, MenuItemConstructorOptions, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as pty from 'node-pty'
import { spawn, spawnSync } from 'child_process'
import Store from 'electron-store'

const isDev = !app.isPackaged
const appId = 'dev.pinkpixel.sorbet'
const githubRepoUrl = 'https://github.com/pinkpixel-dev/sorbet'
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
}
const preferencesTemplateVersion = 4
const devServerPort = process.env.SORBET_DEV_PORT || '38173'
const devServerUrl = `http://localhost:${devServerPort}`
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
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('use-gl', 'swiftshader')
  app.commandLine.appendSwitch(
    'disable-features',
    'AcceleratedVideoDecodeLinuxGL,VaapiVideoDecoder,Vulkan'
  )
}

if (process.platform === 'win32') {
  app.setAppUserModelId(appId)
}

// ─── Store ────────────────────────────────────────────────────────────────────
const store = new Store()

interface StoredLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

interface StoredSession {
  id: string
  title: string
  pid?: number
  isAlive: boolean
  createdAt: number
  isMinimized?: boolean
  isPinned?: boolean
  themeId?: string
  shellName?: string
  cwd?: string
  startupCwd?: string
  startupCommand?: string
}

interface WorkspaceSnapshot {
  layout: StoredLayoutItem[]
  sessions: StoredSession[]
  themeId: string
}

interface WorkspaceRecord {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  projectPath?: string
  projectName?: string
  snapshot: WorkspaceSnapshot
}

interface WorkspaceState {
  currentWorkspaceId: string | null
  workspaces: WorkspaceRecord[]
}

interface WorkspaceTemplateRecord {
  id: string
  name: string
  description: string
  category: string
  accent: string
  suggestedWorkspaceName: string
  source: 'built-in' | 'custom'
  createdAt: number
  updatedAt: number
  projectPath?: string
  projectName?: string
  snapshot: WorkspaceSnapshot
}

// ─── PTY Session Map ──────────────────────────────────────────────────────────
interface PtySession {
  pty: pty.IPty
  sessionId: string
  shellName: string
  cwd: string
  cwdPoller?: NodeJS.Timeout
}

const sessions = new Map<string, PtySession>()
let themeDirectoryWatcher: fs.FSWatcher | null = null
let configChangedTimeout: NodeJS.Timeout | null = null

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function getFallbackThemeId() {
  return typeof store.get('theme') === 'string'
    ? String(store.get('theme'))
    : defaultPreferences.defaultThemeId
}

function deriveProjectName(projectPath?: string) {
  const trimmedPath = normalizePathInput(projectPath)
  if (!trimmedPath) return undefined

  const normalizedPath = trimmedPath.replace(/[\\/]+$/, '')
  if (!normalizedPath) return undefined

  return path.basename(normalizedPath) || normalizedPath
}

function normalizePathInput(input?: string) {
  if (!input) return undefined

  const trimmedPath = input.trim()
  if (!trimmedPath) return undefined

  const homeDirectory = process.env.HOME || process.cwd()

  if (trimmedPath === '~') {
    return homeDirectory
  }

  if (trimmedPath.startsWith('~/')) {
    return path.join(homeDirectory, trimmedPath.slice(2))
  }

  if (process.platform !== 'win32' && !path.isAbsolute(trimmedPath) && trimmedPath.startsWith('home/')) {
    return `/${trimmedPath}`
  }

  return trimmedPath
}

function createTemplateLayoutItem(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  options: Partial<StoredLayoutItem> = {}
): StoredLayoutItem {
  return {
    i: id,
    x,
    y,
    w,
    h,
    minW: options.minW ?? 12,
    minH: options.minH ?? 16,
  }
}

function createTemplateSession(
  id: string,
  title: string,
  options: Partial<StoredSession> = {}
): StoredSession {
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
  }
}

function createWorkspaceTemplate(
  id: string,
  name: string,
  description: string,
  category: string,
  accent: string,
  suggestedWorkspaceName: string,
  snapshot: WorkspaceSnapshot,
  options: Partial<Pick<WorkspaceTemplateRecord, 'source' | 'createdAt' | 'updatedAt' | 'projectPath' | 'projectName'>> = {}
): WorkspaceTemplateRecord {
  const now = Date.now()
  return {
    id,
    name,
    description,
    category,
    accent,
    suggestedWorkspaceName,
    source: options.source ?? 'built-in',
    createdAt: options.createdAt ?? now,
    updatedAt: options.updatedAt ?? now,
    projectPath: typeof options.projectPath === 'string' && options.projectPath.trim() ? options.projectPath.trim() : undefined,
    projectName:
      typeof options.projectName === 'string' && options.projectName.trim()
        ? options.projectName.trim()
        : deriveProjectName(options.projectPath),
    snapshot: normalizeWorkspaceSnapshot(snapshot, snapshot.themeId || defaultPreferences.defaultThemeId),
  }
}

const builtInWorkspaceTemplates: WorkspaceTemplateRecord[] = [
  createWorkspaceTemplate(
    'full-stack',
    'Full-Stack Flow',
    'A balanced four-terminal layout for app server work, frontend work, tests, and logs.',
    'Development',
    '#ec4899',
    'Full-Stack Workspace',
    {
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
    },
    { source: 'built-in', createdAt: 0, updatedAt: 0 }
  ),
  createWorkspaceTemplate(
    'monitoring',
    'Server Monitoring',
    'A supervision layout for long-running services, metrics, incident notes, and deploy output.',
    'Operations',
    '#7aa2f7',
    'Monitoring Workspace',
    {
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
    },
    { source: 'built-in', createdAt: 0, updatedAt: 0 }
  ),
  createWorkspaceTemplate(
    'debugging',
    'Debugging and Logs',
    'A focused layout for reproduction, REPL work, trace output, and a pinned live log stream.',
    'Diagnostics',
    '#f59e0b',
    'Debug Workspace',
    {
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
    },
    { source: 'built-in', createdAt: 0, updatedAt: 0 }
  ),
  createWorkspaceTemplate(
    'writing',
    'Documentation Writing',
    'A calmer three-pane setup for drafting, previewing, and keeping research notes visible.',
    'Writing',
    '#c084fc',
    'Documentation Workspace',
    {
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
    },
    { source: 'built-in', createdAt: 0, updatedAt: 0 }
  ),
]

function normalizeLayoutItem(raw: unknown): StoredLayoutItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  if (
    typeof item.i !== 'string' ||
    typeof item.x !== 'number' ||
    typeof item.y !== 'number' ||
    typeof item.w !== 'number' ||
    typeof item.h !== 'number'
  ) {
    return null
  }

  const minW =
    typeof item.minW === 'number' && Number.isFinite(item.minW)
      ? Math.max(1, Math.floor(item.minW))
      : undefined
  const minH =
    typeof item.minH === 'number' && Number.isFinite(item.minH)
      ? Math.max(1, Math.floor(item.minH))
      : undefined
  const width = Math.max(Math.floor(item.w), minW ?? 1)
  const height = Math.max(Math.floor(item.h), minH ?? 1)

  return {
    i: item.i,
    x: Math.max(0, Math.floor(item.x)),
    y: Math.max(0, Math.floor(item.y)),
    w: width,
    h: height,
    minW,
    minH,
  }
}

function normalizeSession(raw: unknown): StoredSession | null {
  if (!raw || typeof raw !== 'object') return null
  const session = raw as Record<string, unknown>
  if (typeof session.id !== 'string') return null

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
    startupCwd: normalizePathInput(typeof session.startupCwd === 'string' ? session.startupCwd : undefined),
    startupCommand:
      typeof session.startupCommand === 'string' && session.startupCommand.trim()
        ? session.startupCommand
        : undefined,
  }
}

function readProcessCwd(pid: number): string | null {
  if (!Number.isFinite(pid) || pid <= 0) return null

  try {
    if (process.platform === 'linux') {
      return fs.readlinkSync(`/proc/${pid}/cwd`)
    }

    if (process.platform === 'darwin') {
      const result = spawnSyncSafe('lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'])
      if (!result) return null
      const cwdLine = result
        .split('\n')
        .find((line) => line.startsWith('n') && line.length > 1)
      return cwdLine ? cwdLine.slice(1) : null
    }
  } catch {
    return null
  }

  return null
}

function spawnSyncSafe(command: string, args: string[]) {
  try {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    if (result.error || result.status !== 0) {
      return null
    }

    return result.stdout
  } catch {
    return null
  }
}

function startCwdPolling(session: PtySession) {
  if (session.cwdPoller) {
    clearInterval(session.cwdPoller)
  }

  session.cwdPoller = setInterval(() => {
    const nextCwd = readProcessCwd(session.pty.pid)
    if (!nextCwd || nextCwd === session.cwd) return

    session.cwd = nextCwd
    const currentWindow = mainWindow
    if (currentWindow && !currentWindow.isDestroyed()) {
      currentWindow.webContents.send(`pty:metadata:${session.sessionId}`, {
        shellName: session.shellName,
        cwd: session.cwd,
      })
    }
  }, 2000)
}

function normalizeWorkspaceSnapshot(raw: unknown, fallbackThemeId: string): WorkspaceSnapshot {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const layout = Array.isArray(data.layout)
    ? data.layout.map(normalizeLayoutItem).filter((item): item is StoredLayoutItem => Boolean(item))
    : []
  const normalizedSessions = Array.isArray(data.sessions)
    ? data.sessions.map(normalizeSession).filter((session): session is StoredSession => Boolean(session))
    : []

  const sessionsById = new Map(normalizedSessions.map((session) => [session.id, session]))
  const sessions = layout.map((item) => {
    const existing = sessionsById.get(item.i)
    return (
      existing || {
        id: item.i,
        title: 'Terminal',
        isAlive: false,
        createdAt: Date.now(),
        isMinimized: false,
        isPinned: false,
        themeId: undefined,
      }
    )
  })

  return {
    layout,
    sessions,
    themeId:
      typeof data.themeId === 'string' && data.themeId.trim()
        ? data.themeId
        : fallbackThemeId,
  }
}

function normalizeWorkspaceRecord(raw: unknown, fallbackThemeId: string): WorkspaceRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const now = Date.now()

  if (typeof item.id !== 'string') return null

  return {
    id: item.id,
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Untitled Workspace',
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : now,
    lastOpenedAt: typeof item.lastOpenedAt === 'number' ? item.lastOpenedAt : now,
    projectPath: normalizePathInput(typeof item.projectPath === 'string' ? item.projectPath : undefined),
    projectName:
      typeof item.projectName === 'string' && item.projectName.trim()
        ? item.projectName.trim()
        : deriveProjectName(typeof item.projectPath === 'string' ? item.projectPath : undefined),
    snapshot: normalizeWorkspaceSnapshot(item.snapshot, fallbackThemeId),
  }
}

function normalizeWorkspaceTemplateRecord(
  raw: unknown,
  fallbackThemeId: string
): WorkspaceTemplateRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const now = Date.now()

  if (typeof item.id !== 'string') return null

  return {
    id: item.id,
    name:
      typeof item.name === 'string' && item.name.trim()
        ? item.name.trim()
        : 'Untitled Template',
    description:
      typeof item.description === 'string' && item.description.trim()
        ? item.description.trim()
        : 'Custom workspace template',
    category:
      typeof item.category === 'string' && item.category.trim()
        ? item.category.trim()
        : 'Custom',
    accent:
      typeof item.accent === 'string' && item.accent.trim()
        ? item.accent
        : '#ec4899',
    suggestedWorkspaceName:
      typeof item.suggestedWorkspaceName === 'string' && item.suggestedWorkspaceName.trim()
        ? item.suggestedWorkspaceName.trim()
        : 'Custom Workspace',
    source: item.source === 'custom' ? 'custom' : 'built-in',
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : now,
    projectPath: normalizePathInput(typeof item.projectPath === 'string' ? item.projectPath : undefined),
    projectName:
      typeof item.projectName === 'string' && item.projectName.trim()
        ? item.projectName.trim()
        : deriveProjectName(typeof item.projectPath === 'string' ? item.projectPath : undefined),
    snapshot: normalizeWorkspaceSnapshot(item.snapshot, fallbackThemeId),
  }
}

function readCustomWorkspaceTemplates(): WorkspaceTemplateRecord[] {
  const fallbackThemeId = getFallbackThemeId()
  const raw = store.get('workspaceTemplates')

  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map((item) => normalizeWorkspaceTemplateRecord(item, fallbackThemeId))
    .filter((item): item is WorkspaceTemplateRecord => Boolean(item))
    .map((template) => ({
      ...template,
      source: 'custom' as const,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

function writeCustomWorkspaceTemplates(templates: WorkspaceTemplateRecord[]) {
  store.set(
    'workspaceTemplates',
    templates.map((template) => ({
      ...template,
      source: 'custom',
    }))
  )
}

function readWorkspaceTemplates(): WorkspaceTemplateRecord[] {
  return [...builtInWorkspaceTemplates, ...readCustomWorkspaceTemplates()]
}

function readWorkspaceState(): WorkspaceState {
  const fallbackThemeId = getFallbackThemeId()
  const raw = store.get('workspaces')

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>
    const workspaces = Array.isArray(data.workspaces)
      ? data.workspaces
          .map((item) => normalizeWorkspaceRecord(item, fallbackThemeId))
          .filter((item): item is WorkspaceRecord => Boolean(item))
      : []
    const currentWorkspaceId =
      typeof data.currentWorkspaceId === 'string' ? data.currentWorkspaceId : null

    if (workspaces.length > 0) {
      return {
        currentWorkspaceId:
          workspaces.some((workspace) => workspace.id === currentWorkspaceId)
            ? currentWorkspaceId
            : workspaces[0].id,
        workspaces,
      }
    }
  }

  const legacyLayoutRaw = store.get('layout')
  const legacyLayout = Array.isArray(legacyLayoutRaw)
    ? legacyLayoutRaw.map(normalizeLayoutItem).filter((item): item is StoredLayoutItem => Boolean(item))
    : []

  if (legacyLayout.length > 0) {
    const now = Date.now()
    const migratedWorkspace: WorkspaceRecord = {
      id: createId('ws'),
      name: 'Current Workspace',
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      snapshot: normalizeWorkspaceSnapshot(
        {
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
        },
        fallbackThemeId
      ),
    }
    const nextState = {
      currentWorkspaceId: migratedWorkspace.id,
      workspaces: [migratedWorkspace],
    }
    writeWorkspaceState(nextState)
    return nextState
  }

  return {
    currentWorkspaceId: null,
    workspaces: [],
  }
}

function materializeWorkspaceSnapshot(snapshot: unknown, fallbackThemeId: string): WorkspaceSnapshot {
  const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot, fallbackThemeId)
  const now = Date.now()
  const templateIds = Array.from(
    new Set([
      ...normalizedSnapshot.layout.map((item) => item.i),
      ...normalizedSnapshot.sessions.map((session) => session.id),
    ])
  )
  const idMap = new Map(templateIds.map((id) => [id, createId('sess')]))

  return normalizeWorkspaceSnapshot(
    {
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
    },
    fallbackThemeId
  )
}

function createWorkspaceRecordFromSnapshot(
  name: string,
  snapshot: unknown,
  workspaceCount: number,
  options: Partial<Pick<WorkspaceRecord, 'projectPath' | 'projectName'>> = {}
): WorkspaceRecord {
  const now = Date.now()
  const fallbackThemeId = getFallbackThemeId()
  const projectPath = normalizePathInput(options.projectPath)

  return {
    id: createId('ws'),
    name: typeof name === 'string' && name.trim() ? name.trim() : `Workspace ${workspaceCount + 1}`,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    projectPath,
    projectName:
      typeof options.projectName === 'string' && options.projectName.trim()
        ? options.projectName.trim()
        : deriveProjectName(projectPath),
    snapshot: normalizeWorkspaceSnapshot(snapshot, fallbackThemeId),
  }
}

function createWorkspaceTemplateRecordFromSnapshot(
  name: string,
  snapshot: unknown,
  templateCount: number,
  options: Partial<Pick<WorkspaceTemplateRecord, 'description' | 'category' | 'accent' | 'suggestedWorkspaceName' | 'projectPath' | 'projectName'>> = {}
): WorkspaceTemplateRecord {
  const now = Date.now()
  const fallbackThemeId = getFallbackThemeId()
  const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot, fallbackThemeId)
  const trimmedName =
    typeof name === 'string' && name.trim() ? name.trim() : `Template ${templateCount + 1}`
  const projectPath = normalizePathInput(options.projectPath)

  return {
    id: createId('tpl'),
    name: trimmedName,
    description:
      typeof options.description === 'string' && options.description.trim()
        ? options.description.trim()
        : `Saved from a ${normalizedSnapshot.sessions.length}-terminal workspace.`,
    category:
      typeof options.category === 'string' && options.category.trim()
        ? options.category.trim()
        : 'Custom',
    accent:
      typeof options.accent === 'string' && options.accent.trim()
        ? options.accent
        : '#ec4899',
    suggestedWorkspaceName:
      typeof options.suggestedWorkspaceName === 'string' && options.suggestedWorkspaceName.trim()
        ? options.suggestedWorkspaceName.trim()
        : `${trimmedName} Workspace`,
    source: 'custom',
    createdAt: now,
    updatedAt: now,
    projectPath,
    projectName:
      typeof options.projectName === 'string' && options.projectName.trim()
        ? options.projectName.trim()
        : deriveProjectName(projectPath),
    snapshot: normalizedSnapshot,
  }
}

function createWorkspaceFromTemplateRecord(
  template: WorkspaceTemplateRecord,
  name: string,
  workspaceCount: number
): WorkspaceRecord {
  const fallbackThemeId = getFallbackThemeId()
  const materializedSnapshot = materializeWorkspaceSnapshot(template.snapshot, fallbackThemeId)
  return createWorkspaceRecordFromSnapshot(
    name || template.suggestedWorkspaceName,
    materializedSnapshot,
    workspaceCount,
    {
      projectPath: template.projectPath,
      projectName: template.projectName,
    }
  )
}

function writeWorkspaceState(state: WorkspaceState) {
  store.set('workspaces', state)
}

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

function resolveLaunchCwd(preferredCwd?: string) {
  const fallbackCwd = process.env.HOME || process.cwd()
  const candidate = normalizePathInput(preferredCwd)
  if (!candidate) return fallbackCwd

  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()
      ? candidate
      : fallbackCwd
  } catch {
    return fallbackCwd
  }
}

function queueStartupCommand(ptyProcess: pty.IPty, command?: string) {
  const nextCommand = typeof command === 'string' ? command.trim() : ''
  if (!nextCommand) return

  setTimeout(() => {
    try {
      ptyProcess.write(nextCommand.endsWith('\r') || nextCommand.endsWith('\n') ? nextCommand : `${nextCommand}\r`)
    } catch {}
  }, 160)
}

// ─── Window ───────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null

function getWindowIconPath() {
  return path.join(__dirname, '../../assets/icons/png/512x512.png')
}

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

function createPreferencesTemplate(overrides: Partial<typeof defaultPreferences> = {}) {
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
  }
}

function ensurePreferencesTemplateShape() {
  const filePath = getPreferencesPath()

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
    const currentVersion =
      typeof raw._template === 'object' &&
      raw._template !== null &&
      typeof (raw._template as Record<string, unknown>).version === 'number'
        ? (raw._template as Record<string, unknown>).version as number
        : 0

    if (currentVersion >= preferencesTemplateVersion) return

    writePrettyJson(
      filePath,
      createPreferencesTemplate({
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
      })
    )
  } catch {
    writePrettyJson(filePath, createPreferencesTemplate())
  }
}

function ensureUserConfiguration() {
  fs.mkdirSync(getThemesDirectoryPath(), { recursive: true })

  if (!fs.existsSync(getPreferencesPath())) {
    writePrettyJson(getPreferencesPath(), createPreferencesTemplate())
    return
  }

  ensurePreferencesTemplateShape()
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
    enableClipboardShortcuts: typeof data.enableClipboardShortcuts === 'boolean' ? data.enableClipboardShortcuts : defaultPreferences.enableClipboardShortcuts,
    rightClickPaste: typeof data.rightClickPaste === 'boolean' ? data.rightClickPaste : defaultPreferences.rightClickPaste,
    middleClickPaste: typeof data.middleClickPaste === 'boolean' ? data.middleClickPaste : defaultPreferences.middleClickPaste,
    copyShortcut: typeof data.copyShortcut === 'string' ? data.copyShortcut : defaultPreferences.copyShortcut,
    pasteShortcut: typeof data.pasteShortcut === 'string' ? data.pasteShortcut : defaultPreferences.pasteShortcut,
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

function splitCommand(command: string) {
  return command.trim().split(/\s+/).filter(Boolean)
}

function canUseCommand(command: string) {
  const [binary] = splitCommand(command)
  return Boolean(binary) && (binary.includes('/') ? fs.existsSync(binary) : true)
}

function launchDetached(command: string, args: string[]) {
  const [binary, ...commandArgs] = splitCommand(command)
  if (!binary) {
    return Promise.resolve(false)
  }

  return new Promise<boolean>((resolve) => {
    let settled = false
    const child = spawn(binary, [...commandArgs, ...args], {
      detached: true,
      stdio: 'ignore',
    })

    child.once('error', () => {
      if (!settled) {
        settled = true
        resolve(false)
      }
    })

    child.once('spawn', () => {
      child.unref()
      if (!settled) {
        settled = true
        resolve(true)
      }
    })
  })
}

async function openTextFile(filePath: string) {
  const preferredEditor = process.env.VISUAL || process.env.EDITOR

  try {
    if (preferredEditor && canUseCommand(preferredEditor)) {
      if (await launchDetached(preferredEditor, [filePath])) {
        return
      }
    }

    if (process.platform === 'darwin') {
      if (await launchDetached('open', ['-t', filePath])) {
        return
      }
    }

    if (process.platform === 'win32') {
      if (await launchDetached('notepad.exe', [filePath])) {
        return
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
    ]

    const availableEditor = linuxEditors.find((candidate) => fs.existsSync(candidate))

    if (availableEditor) {
      if (await launchDetached(availableEditor, [filePath])) {
        return
      }
    }
  } catch {}

  const error = await shell.openPath(filePath)
  if (error) {
    shell.showItemInFolder(filePath)
  }
}

async function openPreferencesJson() {
  ensureUserConfiguration()
  await openTextFile(getPreferencesPath())
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
  await openTextFile(filePath)
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
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#09090b',
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
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
  })

  const loadTarget = isDev
    ? mainWindow.loadURL(devServerUrl)
    : mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  void loadTarget.catch((error) => {
    console.error('Failed to load renderer:', error)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return

    console.error(
      `Renderer failed to load (${errorCode}): ${errorDescription} [${validatedURL}]`
    )

    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details.reason)
  })

  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show()
    }
  }, 1500)

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
ipcMain.handle(
  'pty:create',
  (
    _event,
    sessionId: string,
    cols: number,
    rows: number,
    options?: { cwd?: string; command?: string }
  ) => {
  if (sessions.has(sessionId)) {
    return { success: false, error: 'Session already exists' }
  }

  try {
    const shell = resolveShell()
    const shellName = path.basename(shell.command)
    const cwd = resolveLaunchCwd(options?.cwd)
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
      const currentSession = sessions.get(sessionId)
      if (currentSession?.cwdPoller) {
        clearInterval(currentSession.cwdPoller)
      }
      sessions.delete(sessionId)
    })

    const ptySession: PtySession = {
      pty: ptyProcess,
      sessionId,
      shellName,
      cwd,
    }

    sessions.set(sessionId, ptySession)
    startCwdPolling(ptySession)
    queueStartupCommand(ptyProcess, options?.command)

    return { success: true, pid: ptyProcess.pid, shellName, cwd }
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
    if (session.cwdPoller) {
      clearInterval(session.cwdPoller)
    }
    try { session.pty.kill() } catch {}
    sessions.delete(sessionId)
  }
  return { success: true }
})

// Get saved layout from store
ipcMain.handle('store:getLayout', () => {
  const workspaceState = readWorkspaceState()
  const current = workspaceState.workspaces.find(
    (workspace) => workspace.id === workspaceState.currentWorkspaceId
  )
  return current?.snapshot.layout ?? store.get('layout', null)
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

ipcMain.handle('store:getWorkspaces', () => {
  return readWorkspaceState()
})

ipcMain.handle('store:getWorkspaceTemplates', () => {
  return readWorkspaceTemplates()
})

ipcMain.handle('store:createWorkspace', (_event, name: string, snapshot: unknown, makeCurrent = true, options: unknown) => {
  const state = readWorkspaceState()
  const payload = options && typeof options === 'object' ? (options as Record<string, unknown>) : {}
  const workspace = createWorkspaceRecordFromSnapshot(name, snapshot, state.workspaces.length, {
    projectPath: typeof payload.projectPath === 'string' ? payload.projectPath : undefined,
    projectName: typeof payload.projectName === 'string' ? payload.projectName : undefined,
  })

  const nextState: WorkspaceState = {
    currentWorkspaceId: makeCurrent ? workspace.id : state.currentWorkspaceId,
    workspaces: [...state.workspaces, workspace],
  }

  writeWorkspaceState(nextState)
  return workspace
})

ipcMain.handle('store:createWorkspaceFromTemplate', (_event, templateId: string, name?: string) => {
  const state = readWorkspaceState()
  const template = readWorkspaceTemplates().find((item) => item.id === templateId)
  if (!template) return null

  const workspace = createWorkspaceFromTemplateRecord(
    template,
    typeof name === 'string' ? name.trim() : '',
    state.workspaces.length
  )
  const nextState: WorkspaceState = {
    currentWorkspaceId: workspace.id,
    workspaces: [...state.workspaces, workspace],
  }

  writeWorkspaceState(nextState)
  store.set('layout', workspace.snapshot.layout)
  store.set('theme', workspace.snapshot.themeId)

  return workspace
})

ipcMain.handle('store:createWorkspaceTemplate', (_event, name: string, snapshot: unknown, options: unknown) => {
  const templates = readCustomWorkspaceTemplates()
  const payload = options && typeof options === 'object' ? (options as Record<string, unknown>) : {}
  const template = createWorkspaceTemplateRecordFromSnapshot(name, snapshot, templates.length, {
    description: typeof payload.description === 'string' ? payload.description : undefined,
    category: typeof payload.category === 'string' ? payload.category : undefined,
    accent: typeof payload.accent === 'string' ? payload.accent : undefined,
    suggestedWorkspaceName:
      typeof payload.suggestedWorkspaceName === 'string'
        ? payload.suggestedWorkspaceName
        : undefined,
    projectPath: typeof payload.projectPath === 'string' ? payload.projectPath : undefined,
    projectName: typeof payload.projectName === 'string' ? payload.projectName : undefined,
  })

  writeCustomWorkspaceTemplates([...templates, template])
  return template
})

ipcMain.handle('store:updateWorkspaceTemplate', (_event, id: string, updates: unknown) => {
  const payload = updates && typeof updates === 'object' ? (updates as Record<string, unknown>) : {}
  let updatedTemplate: WorkspaceTemplateRecord | null = null

  const templates = readCustomWorkspaceTemplates().map((template) => {
    if (template.id !== id) return template

    updatedTemplate = {
      ...template,
      name:
        typeof payload.name === 'string' && payload.name.trim()
          ? payload.name.trim()
          : template.name,
      description:
        typeof payload.description === 'string' && payload.description.trim()
          ? payload.description.trim()
          : template.description,
      category:
        typeof payload.category === 'string' && payload.category.trim()
          ? payload.category.trim()
          : template.category,
      accent:
        typeof payload.accent === 'string' && payload.accent.trim()
          ? payload.accent
          : template.accent,
      suggestedWorkspaceName:
        typeof payload.suggestedWorkspaceName === 'string' && payload.suggestedWorkspaceName.trim()
          ? payload.suggestedWorkspaceName.trim()
          : template.suggestedWorkspaceName,
      projectPath:
        typeof payload.projectPath === 'string'
          ? normalizePathInput(payload.projectPath)
          : template.projectPath,
      projectName:
        typeof payload.projectName === 'string' && payload.projectName.trim()
          ? payload.projectName.trim()
          : deriveProjectName(
              typeof payload.projectPath === 'string' ? payload.projectPath : template.projectPath
            ),
      updatedAt: Date.now(),
    }

    return updatedTemplate
  })

  writeCustomWorkspaceTemplates(templates)
  return updatedTemplate
})

ipcMain.handle('store:deleteWorkspaceTemplate', (_event, id: string) => {
  const templates = readCustomWorkspaceTemplates().filter((template) => template.id !== id)
  writeCustomWorkspaceTemplates(templates)
  return { success: true }
})

ipcMain.handle('store:updateWorkspace', (_event, id: string, updates: unknown) => {
  const state = readWorkspaceState()
  const payload = updates && typeof updates === 'object' ? (updates as Record<string, unknown>) : {}
  let updatedWorkspace: WorkspaceRecord | null = null

  const workspaces = state.workspaces.map((workspace) => {
    if (workspace.id !== id) return workspace

    updatedWorkspace = {
      ...workspace,
      name:
        typeof payload.name === 'string' && payload.name.trim()
          ? payload.name.trim()
          : workspace.name,
      projectPath:
        typeof payload.projectPath === 'string'
          ? normalizePathInput(payload.projectPath)
          : workspace.projectPath,
      projectName:
        typeof payload.projectName === 'string' && payload.projectName.trim()
          ? payload.projectName.trim()
          : deriveProjectName(
              typeof payload.projectPath === 'string' ? payload.projectPath : workspace.projectPath
            ),
      updatedAt: Date.now(),
    }
    return updatedWorkspace
  })

  writeWorkspaceState({
    ...state,
    workspaces,
  })

  return updatedWorkspace
})

ipcMain.handle('store:updateWorkspaceSnapshot', (_event, id: string, snapshot: unknown) => {
  const state = readWorkspaceState()
  const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot, getFallbackThemeId())

  const workspaces = state.workspaces.map((workspace) =>
    workspace.id === id
      ? {
          ...workspace,
          updatedAt: Date.now(),
          snapshot: normalizedSnapshot,
        }
      : workspace
  )

  writeWorkspaceState({
    ...state,
    workspaces,
  })

  if (state.currentWorkspaceId === id) {
    store.set('layout', normalizedSnapshot.layout)
    store.set('theme', normalizedSnapshot.themeId)
  }

  return { success: true }
})

ipcMain.handle('store:deleteWorkspace', (_event, id: string) => {
  const state = readWorkspaceState()
  const workspaces = state.workspaces.filter((workspace) => workspace.id !== id)
  const currentWorkspaceId =
    state.currentWorkspaceId === id ? workspaces[0]?.id ?? null : state.currentWorkspaceId

  writeWorkspaceState({
    currentWorkspaceId,
    workspaces,
  })

  return { success: true, currentWorkspaceId }
})

ipcMain.handle('store:setCurrentWorkspace', (_event, id: string) => {
  const state = readWorkspaceState()
  const now = Date.now()
  const existingWorkspace = state.workspaces.find((workspace) => workspace.id === id)
  if (!existingWorkspace) return null

  const currentWorkspace: WorkspaceRecord = {
    ...existingWorkspace,
    lastOpenedAt: now,
  }

  const workspaces = state.workspaces.map((workspace) =>
    workspace.id === id ? currentWorkspace : workspace
  )

  writeWorkspaceState({
    currentWorkspaceId: id,
    workspaces,
  })

  store.set('layout', currentWorkspace.snapshot.layout)
  store.set('theme', currentWorkspace.snapshot.themeId)

  return currentWorkspace
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
