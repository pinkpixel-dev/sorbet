// Window augmentation for the IPC bridge
declare global {
  interface Window {
    sorbet: SorbetAPI
  }
}

export interface SorbetAPI {
  platform: NodeJS.Platform
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
}

// Terminal session
export interface TerminalSession {
  id: string
  title: string
  pid?: number
  isAlive: boolean
  createdAt: number
  isMinimized?: boolean
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
