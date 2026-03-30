// Window augmentation for the IPC bridge
declare global {
  interface Window {
    sorbet: SorbetAPI
  }
}

export interface SorbetAPI {
  platform: NodeJS.Platform
  clipboard: {
    readText: () => Promise<string>
    writeText: (text: string) => Promise<void>
  }
  pty: {
    create: (sessionId: string, cols: number, rows: number) => Promise<{ success: boolean; pid?: number; error?: string }>
    write: (sessionId: string, data: string) => void
    resize: (sessionId: string, cols: number, rows: number) => void
    kill: (sessionId: string) => Promise<{ success: boolean }>
    onData: (sessionId: string, callback: (data: string) => void) => () => void
    onExit: (sessionId: string, callback: (info: { exitCode: number; signal: number }) => void) => () => void
  }
  store: {
    getLayout: () => Promise<LayoutItem[] | null>
    saveLayout: (layout: LayoutItem[]) => Promise<{ success: boolean }>
    getTheme: () => Promise<string>
    saveTheme: (theme: string) => Promise<{ success: boolean }>
    getWorkspaces: () => Promise<WorkspaceState>
    createWorkspace: (name: string, snapshot: WorkspaceSnapshot, makeCurrent?: boolean) => Promise<WorkspaceRecord>
    updateWorkspace: (id: string, updates: Partial<WorkspaceRecord>) => Promise<WorkspaceRecord | null>
    updateWorkspaceSnapshot: (id: string, snapshot: WorkspaceSnapshot) => Promise<{ success: boolean }>
    deleteWorkspace: (id: string) => Promise<{ success: boolean; currentWorkspaceId: string | null }>
    setCurrentWorkspace: (id: string) => Promise<WorkspaceRecord | null>
    getPreferences: () => Promise<TerminalPreferences>
    getCustomThemes: () => Promise<Theme[]>
    onConfigChanged: (callback: () => void) => () => void
  }
}

// react-grid-layout item
export interface LayoutItem {
  i: string   // session ID
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  static?: boolean
  isDraggable?: boolean
  isResizable?: boolean
}

// Terminal session
export interface TerminalSession {
  id: string
  title: string
  pid?: number
  isAlive: boolean
  createdAt: number
  isMinimized?: boolean
  isPinned?: boolean
}

export interface WorkspaceSnapshot {
  layout: LayoutItem[]
  sessions: TerminalSession[]
  themeId: string
}

export interface WorkspaceRecord {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  lastOpenedAt: number
  snapshot: WorkspaceSnapshot
}

export interface WorkspaceState {
  currentWorkspaceId: string | null
  workspaces: WorkspaceRecord[]
}

// Theme definition
export interface Theme {
  id: string
  name: string
  // xterm.js ITheme compatible
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
  // UI accent
  accent: string
}

export interface TerminalPreferences {
  defaultThemeId: string
  fontFamily: string
  fontSize: number
  lineHeight: number
  letterSpacing: number
  scrollback: number
  enableClipboardShortcuts: boolean
  rightClickPaste: boolean
  middleClickPaste: boolean
  copyShortcut: string
  pasteShortcut: string
}
