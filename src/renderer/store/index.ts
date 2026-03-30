import { create } from 'zustand'
import { LayoutItem, TerminalSession, WorkspaceSnapshot } from '../types'

interface SorbetStore {
  // Sessions
  sessions: TerminalSession[]
  activeSessionId: string | null
  maximizedSessionId: string | null

  // Layout
  layout: LayoutItem[]

  // Theme
  themeId: string

  // Actions
  addSession: (session: TerminalSession, layoutItem: LayoutItem) => void
  removeSession: (id: string) => void
  updateSession: (id: string, updates: Partial<TerminalSession>) => void
  setActiveSession: (id: string | null) => void
  updateLayout: (layout: LayoutItem[]) => void
  setTheme: (themeId: string) => void
  restoreWorkspace: (snapshot: WorkspaceSnapshot) => void
  toggleMinimizeSession: (id: string) => void
  toggleMaximizeSession: (id: string) => void
  togglePinSession: (id: string) => void
  getWorkspaceSnapshot: () => WorkspaceSnapshot
}

export const useSorbetStore = create<SorbetStore>((set) => ({
  sessions: [],
  activeSessionId: null,
  maximizedSessionId: null,
  layout: [],
  themeId: 'sorbet',

  addSession: (session, layoutItem) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      layout: [...state.layout, layoutItem],
      activeSessionId: session.id,
      maximizedSessionId: state.maximizedSessionId,
    })),

  removeSession: (id) =>
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== id)
      return {
        sessions: remaining,
        layout: state.layout.filter((l) => l.i !== id),
        activeSessionId:
          state.activeSessionId === id
            ? remaining[remaining.length - 1]?.id ?? null
            : state.activeSessionId,
        maximizedSessionId:
          state.maximizedSessionId === id ? null : state.maximizedSessionId,
      }
    }),

  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),

  setActiveSession: (id) => set({ activeSessionId: id }),

  updateLayout: (layout) => set({ layout }),

  setTheme: (themeId) => set({ themeId }),

  restoreWorkspace: (snapshot) =>
    set({
      layout: snapshot.layout,
      sessions: snapshot.sessions.map((session) => ({
        ...session,
        isAlive: false,
        isPinned: session.isPinned ?? false,
      })),
      activeSessionId: snapshot.sessions.find((session) => !session.isMinimized)?.id ?? snapshot.layout[0]?.i ?? null,
      maximizedSessionId: null,
      themeId: snapshot.themeId,
    }),

  toggleMinimizeSession: (id) =>
    set((state) => {
      const sessions = state.sessions.map((session) =>
        session.id === id
          ? { ...session, isMinimized: !session.isMinimized }
          : session
      )
      const target = sessions.find((session) => session.id === id)
      const visibleSessions = sessions.filter((session) => !session.isMinimized)

      return {
        sessions,
        activeSessionId:
          state.activeSessionId === id && target?.isMinimized
            ? visibleSessions[visibleSessions.length - 1]?.id ?? null
            : state.activeSessionId,
        maximizedSessionId:
          state.maximizedSessionId === id && target?.isMinimized
            ? null
            : state.maximizedSessionId,
      }
    }),

  toggleMaximizeSession: (id) =>
    set((state) => ({
      maximizedSessionId: state.maximizedSessionId === id ? null : id,
      activeSessionId: id,
      sessions: state.sessions.map((session) =>
        session.id === id ? { ...session, isMinimized: false } : session
      ),
    })),

  togglePinSession: (id) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === id
          ? { ...session, isPinned: !session.isPinned }
          : session
      ),
    })),

  getWorkspaceSnapshot: () => {
    const state = useSorbetStore.getState()
    return {
      layout: state.layout,
      sessions: state.sessions.map((session) => ({
        ...session,
        isAlive: false,
      })),
      themeId: state.themeId,
    }
  },
}))
