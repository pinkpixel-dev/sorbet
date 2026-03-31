import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GridLayout, { Layout } from 'react-grid-layout'
import { TerminalCard } from './components/TerminalCard'
import { CommandPalette, CommandPaletteItem } from './components/CommandPalette'
import { ThemePicker } from './components/ThemePicker'
import { useSorbetStore } from './store'
import { builtInThemes, defaultTerminalPreferences, defaultTheme, mergeThemes } from './themes'
import { LayoutItem, TerminalPreferences, TerminalSession, Theme, WorkspaceRecord, WorkspaceSnapshot, WorkspaceTemplateRecord } from './types'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './app.css'

const GRID_COLS = 48
const GRID_ROW_HEIGHT = 8
const CARD_DEFAULT_W = 16
const CARD_DEFAULT_H = 36
const CARD_MIN_W = 12
const CARD_MIN_H = 16
const CARD_MAXIMIZED_H = 90

interface WorkspaceSetupDraft {
  workspaceId: string
  projectPath: string
  sessions: {
    id: string
    title: string
    startupCwd: string
    startupCommand: string
  }[]
}

type WorkspaceDialogState =
  | {
      mode: 'save-workspace'
      value: string
    }
  | {
      mode: 'create-workspace-from-template'
      templateId: string
      value: string
    }
  | {
      mode: 'rename-workspace'
      workspaceId: string
      value: string
    }
  | {
      mode: 'save-template'
      value: string
      description: string
    }
  | {
      mode: 'rename-template'
      templateId: string
      value: string
      description: string
    }
  | null

// Generate a unique session ID
function generateId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// Calculate a smart position for the new card
function getNewCardLayout(existingLayout: LayoutItem[]): LayoutItem {
  const id = generateId()
  if (existingLayout.length === 0) {
    return { i: id, x: 0, y: 0, w: CARD_DEFAULT_W, h: CARD_DEFAULT_H, minW: CARD_MIN_W, minH: CARD_MIN_H }
  }

  const lastItem = existingLayout[existingLayout.length - 1]
  const nextX = lastItem.x + lastItem.w

  if (nextX + CARD_DEFAULT_W <= GRID_COLS) {
    return {
      i: id,
      x: nextX,
      y: lastItem.y,
      w: CARD_DEFAULT_W,
      h: CARD_DEFAULT_H,
      minW: CARD_MIN_W,
      minH: CARD_MIN_H,
    }
  }

  const maxY = Math.max(...existingLayout.map((l) => l.y + l.h))
  return { i: id, x: 0, y: maxY, w: CARD_DEFAULT_W, h: CARD_DEFAULT_H, minW: CARD_MIN_W, minH: CARD_MIN_H }
}

function deriveProjectName(projectPath: string) {
  const trimmedPath = projectPath.trim().replace(/[\\/]+$/, '')
  if (!trimmedPath) return undefined

  const parts = trimmedPath.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || trimmedPath
}

function clampLayoutItem(item: LayoutItem): LayoutItem {
  const minW = Math.max(1, item.minW ?? CARD_MIN_W)
  const minH = Math.max(1, item.minH ?? CARD_MIN_H)

  return {
    ...item,
    x: Math.max(0, item.x),
    y: Math.max(0, item.y),
    w: Math.max(item.w, minW),
    h: Math.max(item.h, minH),
    minW,
    minH,
  }
}

function materializeWorkspaceSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  const sourceIds = Array.from(
    new Set([
      ...snapshot.layout.map((item) => item.i),
      ...snapshot.sessions.map((session) => session.id),
    ])
  )
  const idMap = new Map(sourceIds.map((id) => [id, generateId()]))

  return {
    layout: snapshot.layout.map((item) => ({
      ...item,
      i: idMap.get(item.i) ?? generateId(),
    })),
    sessions: snapshot.sessions.map((session) => ({
      ...session,
      id: idMap.get(session.id) ?? generateId(),
      pid: undefined,
      isAlive: false,
      shellName: undefined,
      cwd: undefined,
      status: 'idle',
      hasUnreadOutput: false,
      lastActivityAt: undefined,
    })),
    themeId: snapshot.themeId,
  }
}

export default function App() {
  const isMac = window.sorbet.platform === 'darwin'
  const layoutRef = useRef<LayoutItem[]>([])
  const hasRestoredWorkspace = useRef(false)
  const hasHydratedWorkspaceState = useRef(false)
  const isApplyingWorkspaceRef = useRef(false)
  const currentWorkspaceIdRef = useRef<string | null>(null)
  const [gridWidth, setGridWidth] = useState(window.innerWidth)
  const [availableThemes, setAvailableThemes] = useState<Theme[]>(builtInThemes)
  const [preferences, setPreferences] = useState<TerminalPreferences>(defaultTerminalPreferences)
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([])
  const [workspaceTemplates, setWorkspaceTemplates] = useState<WorkspaceTemplateRecord[]>([])
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const [isTemplateGalleryOpen, setIsTemplateGalleryOpen] = useState(false)
  const [workspaceSetupDraft, setWorkspaceSetupDraft] = useState<WorkspaceSetupDraft | null>(null)
  const [workspaceDialog, setWorkspaceDialog] = useState<WorkspaceDialogState>(null)
  const [workspaceTerminalEpoch, setWorkspaceTerminalEpoch] = useState(0)
  const {
    sessions,
    layout,
    activeSessionId,
    maximizedSessionId,
    themeId,
    addSession,
    setActiveSession,
    updateLayout,
    updateSession,
    setTheme,
    restoreWorkspace,
    toggleMinimizeSession,
    toggleMaximizeSession,
    togglePinSession,
    getWorkspaceSnapshot,
  } = useSorbetStore()

  const visibleSessions = sessions.filter((session) => !session.isMinimized)
  const minimizedSessions = sessions.filter((session) => session.isMinimized)
  const gridSessions = maximizedSessionId
    ? visibleSessions.filter((session) => session.id === maximizedSessionId)
    : visibleSessions
  const gridLayout = maximizedSessionId
    ? gridSessions.map((session) => ({
        i: session.id,
        x: 0,
        y: 0,
        w: GRID_COLS,
        h: CARD_MAXIMIZED_H,
        minW: GRID_COLS,
        minH: CARD_MIN_H,
        static: true,
      }))
    : layout
        .filter((item) => visibleSessions.some((session) => session.id === item.i))
        .map((item) => {
          const normalizedItem = clampLayoutItem(item)
          const session = visibleSessions.find((entry) => entry.id === item.i)
          const isPinned = Boolean(session?.isPinned)

          return {
            ...normalizedItem,
            static: isPinned,
            isDraggable: !isPinned,
            isResizable: !isPinned,
          }
        })

  const themesById = useMemo(
    () =>
      availableThemes.reduce<Record<string, Theme>>((acc, theme) => {
        acc[theme.id] = theme
        return acc
      }, {}),
    [availableThemes]
  )

  const theme =
    themesById[themeId] ||
    themesById[preferences.defaultThemeId] ||
    defaultTheme
  const currentWorkspace = workspaces.find((workspace) => workspace.id === currentWorkspaceId) ?? null
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null
  const customWorkspaceTemplates = workspaceTemplates.filter((template) => template.source === 'custom')
  const templateInDialog =
    workspaceDialog?.mode === 'create-workspace-from-template' || workspaceDialog?.mode === 'rename-template'
      ? workspaceTemplates.find((template) => template.id === workspaceDialog.templateId) ?? null
      : null

  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  useEffect(() => {
    currentWorkspaceIdRef.current = currentWorkspaceId
  }, [currentWorkspaceId])

  const commitWorkspaceLocally = useCallback((workspace: WorkspaceRecord) => {
    currentWorkspaceIdRef.current = workspace.id
    setCurrentWorkspaceId(workspace.id)
    setWorkspaces((existing) => {
      const index = existing.findIndex((item) => item.id === workspace.id)
      if (index === -1) {
        return [...existing, workspace]
      }

      return existing.map((item) => (item.id === workspace.id ? workspace : item))
    })
  }, [])

  const spawnTerminal = useCallback(() => {
    const layoutItem = getNewCardLayout(layoutRef.current)
    const session: TerminalSession = {
      id: layoutItem.i,
      title: 'Terminal',
      isAlive: false,
      createdAt: Date.now(),
      isMinimized: false,
      isPinned: false,
      startupCwd: currentWorkspace?.projectPath || undefined,
      themeId: undefined,
      status: 'idle',
      hasUnreadOutput: false,
    }
    addSession(session, layoutItem)
  }, [addSession, currentWorkspace?.projectPath])

  const loadUserConfiguration = useCallback(async () => {
    const [nextPreferences, customThemes] = await Promise.all([
      window.sorbet.store.getPreferences(),
      window.sorbet.store.getCustomThemes(),
    ])

    setPreferences(nextPreferences)
    setAvailableThemes(mergeThemes(customThemes))
  }, [])

  const syncWorkspaceState = useCallback(async () => {
    const nextState = await window.sorbet.store.getWorkspaces()
    currentWorkspaceIdRef.current = nextState.currentWorkspaceId
    setWorkspaces(nextState.workspaces)
    setCurrentWorkspaceId(nextState.currentWorkspaceId)
    return nextState
  }, [])

  const loadWorkspaceTemplates = useCallback(async () => {
    const templates = await window.sorbet.store.getWorkspaceTemplates()
    setWorkspaceTemplates(templates)
    return templates
  }, [])

  const applyWorkspace = useCallback(
    async (workspace: WorkspaceRecord) => {
      isApplyingWorkspaceRef.current = true
      try {
        if (sessions.length > 0) {
          await Promise.allSettled(sessions.map((session) => window.sorbet.pty.kill(session.id)))
        }

        commitWorkspaceLocally(workspace)
        restoreWorkspace(materializeWorkspaceSnapshot(workspace.snapshot))
        setTheme(workspace.snapshot.themeId)
        setWorkspaceTerminalEpoch((epoch) => epoch + 1)

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve())
          })
        })
      } finally {
        isApplyingWorkspaceRef.current = false
      }
    },
    [commitWorkspaceLocally, restoreWorkspace, sessions, setTheme]
  )

  const persistCurrentWorkspace = useCallback(async () => {
    const workspaceId = currentWorkspaceIdRef.current
    if (!hasHydratedWorkspaceState.current || !workspaceId || isApplyingWorkspaceRef.current) return

    const snapshot = getWorkspaceSnapshot()
    await window.sorbet.store.updateWorkspaceSnapshot(workspaceId, snapshot)
    setWorkspaces((existing) =>
      existing.map((workspace) =>
        workspace.id === workspaceId
          ? {
              ...workspace,
              updatedAt: Date.now(),
              snapshot,
            }
          : workspace
      )
    )
  }, [getWorkspaceSnapshot])

  // Load persisted layout and theme on startup
  useEffect(() => {
    if (hasRestoredWorkspace.current) return
    hasRestoredWorkspace.current = true

    let cancelled = false

    Promise.all([
      loadUserConfiguration(),
      window.sorbet.store.getTheme(),
      window.sorbet.store.getWorkspaces(),
      loadWorkspaceTemplates(),
    ]).then(async ([, savedTheme, workspaceState]) => {
      if (cancelled) return

      setWorkspaces(workspaceState.workspaces)
      setCurrentWorkspaceId(workspaceState.currentWorkspaceId)

      const currentWorkspace = workspaceState.workspaces.find(
        (workspace) => workspace.id === workspaceState.currentWorkspaceId
      )

      if (currentWorkspace) {
        await applyWorkspace(currentWorkspace)
        hasHydratedWorkspaceState.current = true
        return
      }

      if (savedTheme) setTheme(savedTheme)

      spawnTerminal()
      hasHydratedWorkspaceState.current = true
    })

    return () => {
      cancelled = true
    }
  }, [applyWorkspace, loadUserConfiguration, loadWorkspaceTemplates, setTheme, spawnTerminal])

  useEffect(() => {
    return window.sorbet.store.onConfigChanged(() => {
      void loadUserConfiguration()
    })
  }, [loadUserConfiguration])

  useEffect(() => {
    if (!themesById[themeId]) {
      setTheme(preferences.defaultThemeId)
    }
  }, [preferences.defaultThemeId, setTheme, themeId, themesById])

  useEffect(() => {
    const handleResize = () => setGridWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Auto-save layout whenever it changes
  useEffect(() => {
    if (!hasHydratedWorkspaceState.current) return
    if (isApplyingWorkspaceRef.current) return

    if (layout.length > 0) {
      window.sorbet.store.saveLayout(layout.map(clampLayoutItem))
    }

    void persistCurrentWorkspace()
  }, [layout, persistCurrentWorkspace, sessions, themeId])

  const handleLayoutChange = useCallback(
    (newLayout: Layout[]) => {
      if (maximizedSessionId) return
      const updated: LayoutItem[] = newLayout.map((l) => ({
        i: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        minW: CARD_MIN_W,
        minH: CARD_MIN_H,
      })).map(clampLayoutItem)
      updateLayout(updated)
    },
    [maximizedSessionId, updateLayout]
  )

  const handleThemeChange = useCallback(
    (newThemeId: string) => {
      setTheme(newThemeId)
      window.sorbet.store.saveTheme(newThemeId)
    },
    [setTheme]
  )

  const openSaveWorkspaceDialog = useCallback(() => {
    const suggestedName =
      currentWorkspace?.name && currentWorkspace.name.trim()
        ? `${currentWorkspace.name} Copy`
        : `Workspace ${workspaces.length + 1}`

    setWorkspaceDialog({
      mode: 'save-workspace',
      value: suggestedName,
    })
  }, [currentWorkspace?.name, workspaces.length])

  const openSaveTemplateDialog = useCallback(() => {
    const suggestedName =
      currentWorkspace?.name && currentWorkspace.name.trim()
        ? `${currentWorkspace.name} Template`
        : `Template ${customWorkspaceTemplates.length + 1}`

    setWorkspaceDialog({
      mode: 'save-template',
      value: suggestedName,
      description: `Saved from the current ${sessions.length || 1}-terminal workspace layout.`,
    })
    setIsTemplateGalleryOpen(false)
  }, [currentWorkspace?.name, customWorkspaceTemplates.length, sessions.length])

  const openTemplateDialog = useCallback((template: WorkspaceTemplateRecord) => {
    setWorkspaceDialog({
      mode: 'create-workspace-from-template',
      templateId: template.id,
      value: template.suggestedWorkspaceName,
    })
    setIsTemplateGalleryOpen(false)
  }, [])

  const handleSwitchWorkspace = useCallback(
    async (workspaceId: string) => {
      if (workspaceId === currentWorkspaceId) return

      await persistCurrentWorkspace()
      const workspace = await window.sorbet.store.setCurrentWorkspace(workspaceId)
      if (!workspace) return

      await applyWorkspace(workspace)
      await syncWorkspaceState()
    },
    [applyWorkspace, currentWorkspaceId, persistCurrentWorkspace, syncWorkspaceState]
  )

  const openRenameWorkspaceDialog = useCallback((workspace: WorkspaceRecord) => {
    setWorkspaceDialog({
      mode: 'rename-workspace',
      workspaceId: workspace.id,
      value: workspace.name,
    })
  }, [])

  const openRenameTemplateDialog = useCallback((template: WorkspaceTemplateRecord) => {
    setWorkspaceDialog({
      mode: 'rename-template',
      templateId: template.id,
      value: template.name,
      description: template.description,
    })
    setIsTemplateGalleryOpen(false)
  }, [])

  const openWorkspaceSetupDialog = useCallback(() => {
    if (!currentWorkspace) return

    setWorkspaceSetupDraft({
      workspaceId: currentWorkspace.id,
      projectPath: currentWorkspace.projectPath || activeSession?.cwd || '',
      sessions: sessions.map((session) => ({
        id: session.id,
        title: session.title || 'Terminal',
        startupCwd: session.startupCwd || '',
        startupCommand: session.startupCommand || '',
      })),
    })
  }, [activeSession?.cwd, currentWorkspace, sessions])

  const handleDeleteWorkspace = useCallback(
    async (workspace: WorkspaceRecord) => {
      const confirmed = window.confirm(`Delete workspace "${workspace.name}"?`)
      if (!confirmed) return

      await persistCurrentWorkspace()
      await window.sorbet.store.deleteWorkspace(workspace.id)
      const nextState = await syncWorkspaceState()

      const nextCurrentWorkspace = nextState.workspaces.find(
        (item) => item.id === nextState.currentWorkspaceId
      )

      if (nextCurrentWorkspace) {
        await applyWorkspace(nextCurrentWorkspace)
        return
      }

      spawnTerminal()
    },
    [applyWorkspace, persistCurrentWorkspace, spawnTerminal, syncWorkspaceState]
  )

  const formatWorkspaceTimestamp = useCallback((timestamp: number) => {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(timestamp)
  }, [])

  const handleCreateWorkspaceFromTemplate = useCallback(
    async (templateId: string, name: string) => {
      await persistCurrentWorkspace()
      const workspace = await window.sorbet.store.createWorkspaceFromTemplate(templateId, name)
      if (!workspace) return

      await applyWorkspace(workspace)
      await syncWorkspaceState()
    },
    [applyWorkspace, persistCurrentWorkspace, syncWorkspaceState]
  )

  const handleSaveTemplate = useCallback(
    async (name: string, description: string) => {
      const created = await window.sorbet.store.createWorkspaceTemplate(name, getWorkspaceSnapshot(), {
        description,
        category: 'Custom',
        accent: theme.accent,
        suggestedWorkspaceName: `${name} Workspace`,
        projectPath: currentWorkspace?.projectPath,
        projectName: currentWorkspace?.projectName,
      })

      setWorkspaceTemplates((existing) => [...existing, created])
    },
    [currentWorkspace?.projectName, currentWorkspace?.projectPath, getWorkspaceSnapshot, theme.accent]
  )

  const handleRenameTemplate = useCallback(async (templateId: string, name: string, description: string) => {
    const updated = await window.sorbet.store.updateWorkspaceTemplate(templateId, {
      name,
      description,
      suggestedWorkspaceName: `${name} Workspace`,
    })

    if (!updated) return

    setWorkspaceTemplates((existing) =>
      existing.map((template) => (template.id === templateId ? updated : template))
    )
  }, [])

  const handleDeleteTemplate = useCallback(async (template: WorkspaceTemplateRecord) => {
    if (template.source !== 'custom') return

    const confirmed = window.confirm(`Delete template "${template.name}"?`)
    if (!confirmed) return

    await window.sorbet.store.deleteWorkspaceTemplate(template.id)
    setWorkspaceTemplates((existing) => existing.filter((item) => item.id !== template.id))
  }, [])

  const handleWorkspaceSetupSave = useCallback(async () => {
    if (!workspaceSetupDraft) return

    const normalizedProjectPath = workspaceSetupDraft.projectPath.trim()
    const projectPath = normalizedProjectPath || undefined
    const projectName = deriveProjectName(normalizedProjectPath)
    const sessionStartupById = new Map(
      workspaceSetupDraft.sessions.map((sessionDraft) => [
        sessionDraft.id,
        {
          startupCwd: sessionDraft.startupCwd.trim() || undefined,
          startupCommand: sessionDraft.startupCommand.trim() || undefined,
        },
      ])
    )
    const currentSnapshot = getWorkspaceSnapshot()
    const nextSnapshot = {
      ...currentSnapshot,
      sessions: currentSnapshot.sessions.map((session) => {
        const startupSettings = sessionStartupById.get(session.id)
        if (!startupSettings) return session

        return {
          ...session,
          startupCwd: startupSettings.startupCwd,
          startupCommand: startupSettings.startupCommand,
        }
      }),
    }

    workspaceSetupDraft.sessions.forEach((sessionDraft) => {
      updateSession(sessionDraft.id, {
        startupCwd: sessionDraft.startupCwd.trim() || undefined,
        startupCommand: sessionDraft.startupCommand.trim() || undefined,
      })
    })

    await window.sorbet.store.updateWorkspace(workspaceSetupDraft.workspaceId, {
      projectPath,
      projectName,
    })
    await window.sorbet.store.updateWorkspaceSnapshot(workspaceSetupDraft.workspaceId, nextSnapshot)
    const nextState = await syncWorkspaceState()
    const updatedWorkspace = nextState.workspaces.find(
      (workspace) => workspace.id === workspaceSetupDraft.workspaceId
    )
    if (updatedWorkspace) {
      await applyWorkspace(updatedWorkspace)
    }
    setWorkspaceSetupDraft(null)
  }, [applyWorkspace, getWorkspaceSnapshot, syncWorkspaceState, updateSession, workspaceSetupDraft])

  const focusSession = useCallback(
    (sessionId: string) => {
      const target = sessions.find((session) => session.id === sessionId)
      if (target?.isMinimized) {
        toggleMinimizeSession(sessionId)
      }
      setActiveSession(sessionId)
    },
    [sessions, setActiveSession, toggleMinimizeSession]
  )

  const handleWorkspaceDialogSubmit = useCallback(async () => {
    if (!workspaceDialog) return

    const nextName = workspaceDialog.value.trim()
    if (!nextName) return
    const nextDescription =
      'description' in workspaceDialog ? workspaceDialog.description.trim() : ''

    try {
      if (workspaceDialog.mode === 'save-workspace') {
        await window.sorbet.store.createWorkspace(nextName, getWorkspaceSnapshot(), true, {
          projectPath: currentWorkspace?.projectPath,
          projectName: currentWorkspace?.projectName,
        })
        const nextState = await syncWorkspaceState()
        const nextCurrentWorkspace = nextState.workspaces.find(
          (workspace) => workspace.id === nextState.currentWorkspaceId
        )

        if (nextCurrentWorkspace) {
          await applyWorkspace(nextCurrentWorkspace)
        }

        setWorkspaceDialog(null)
        return
      }

      if (workspaceDialog.mode === 'create-workspace-from-template') {
        await handleCreateWorkspaceFromTemplate(workspaceDialog.templateId, nextName)
        setWorkspaceDialog(null)
        return
      }

      if (workspaceDialog.mode === 'save-template') {
        await handleSaveTemplate(nextName, nextDescription)
        setWorkspaceDialog(null)
        return
      }

      if (workspaceDialog.mode === 'rename-template') {
        await handleRenameTemplate(workspaceDialog.templateId, nextName, nextDescription)
        setWorkspaceDialog(null)
        return
      }

      const targetWorkspace = workspaces.find((workspace) => workspace.id === workspaceDialog.workspaceId)
      if (!targetWorkspace || nextName === targetWorkspace.name) {
        setWorkspaceDialog(null)
        return
      }

      await window.sorbet.store.updateWorkspace(workspaceDialog.workspaceId, { name: nextName })
      await syncWorkspaceState()
      setWorkspaceDialog(null)
    } catch (error) {
      console.error('Workspace dialog action failed', error)
    }
  }, [
    applyWorkspace,
    currentWorkspace?.projectName,
    currentWorkspace?.projectPath,
    getWorkspaceSnapshot,
    handleCreateWorkspaceFromTemplate,
    handleRenameTemplate,
    handleSaveTemplate,
    syncWorkspaceState,
    workspaceDialog,
    workspaces,
  ])

  // Keyboard shortcut: Cmd/Ctrl+T to spawn new terminal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsCommandPaletteOpen((open) => !open)
        return
      }

      if (isCommandPaletteOpen) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setIsCommandPaletteOpen(false)
        }
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        spawnTerminal()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isCommandPaletteOpen, spawnTerminal])

  const commandPaletteItems = useMemo<CommandPaletteItem[]>(() => {
    const workspaceCommands: CommandPaletteItem[] = workspaces.map((workspace) => ({
      id: `workspace:${workspace.id}`,
      title: workspace.id === currentWorkspaceId ? `Current Workspace: ${workspace.name}` : `Switch to ${workspace.name}`,
      subtitle: [
        workspace.projectName ? `Project ${workspace.projectName}` : `${workspace.snapshot.sessions.length} ${workspace.snapshot.sessions.length === 1 ? 'terminal' : 'terminals'}`,
        `Updated ${formatWorkspaceTimestamp(workspace.updatedAt)}`,
      ].join(' • '),
      group: 'Workspace',
      keywords: ['workspace', 'switch', 'restore', workspace.name, workspace.projectPath, workspace.projectName].filter(Boolean) as string[],
      run: () => {
        void handleSwitchWorkspace(workspace.id)
      },
    }))

    const themeCommands: CommandPaletteItem[] = availableThemes.map((option) => ({
      id: `theme:${option.id}`,
      title: option.id === theme.id ? `Current Theme: ${option.name}` : `Apply Theme: ${option.name}`,
      subtitle: `Set the workspace theme to ${option.name}`,
      group: 'Theme',
      keywords: ['theme', 'appearance', option.name],
      run: () => handleThemeChange(option.id),
    }))

    const templateCommands: CommandPaletteItem[] = workspaceTemplates.map((template) => ({
      id: `template:${template.id}`,
      title: `Create from Template: ${template.name}`,
      subtitle: template.description,
      group: 'Template',
      keywords: [
        'template',
        'workspace',
        'starter',
        template.name,
        template.category,
        template.description,
      ],
      run: () => openTemplateDialog(template),
    }))

    const sessionCommands: CommandPaletteItem[] = sessions.map((session) => ({
      id: `session:${session.id}`,
      title: session.isMinimized ? `Restore ${session.title}` : `Focus ${session.title}`,
      subtitle: session.cwd || session.shellName || 'Terminal session',
      group: 'Session',
      keywords: ['terminal', 'session', 'focus', 'restore', session.title, session.cwd, session.shellName].filter(Boolean) as string[],
      run: () => focusSession(session.id),
    }))

    return [
      {
        id: 'new-terminal',
        title: 'New Terminal',
        subtitle: 'Create a new terminal card on the canvas',
        group: 'General',
        keywords: ['new', 'terminal', 'session', 'create'],
        run: spawnTerminal,
      },
      {
        id: 'save-workspace',
        title: 'Save Workspace As',
        subtitle: 'Create a named snapshot from the current canvas',
        group: 'General',
        keywords: ['save', 'workspace', 'snapshot'],
        run: openSaveWorkspaceDialog,
      },
      {
        id: 'save-template',
        title: 'Save Current Workspace as Template',
        subtitle: 'Create a reusable custom template from the current canvas',
        group: 'General',
        keywords: ['save', 'template', 'workspace', 'starter'],
        run: openSaveTemplateDialog,
      },
      {
        id: 'workspace-setup',
        title: 'Workspace Settings',
        subtitle: 'Associate a project path and define per-terminal startup behavior',
        group: 'General',
        keywords: ['workspace', 'settings', 'project', 'startup', 'script', 'cwd'],
        run: openWorkspaceSetupDialog,
      },
      {
        id: 'workspace-templates',
        title: 'Browse Workspace Templates',
        subtitle: 'Start a new workspace from a built-in or custom layout',
        group: 'General',
        keywords: ['template', 'workspace', 'starter', 'gallery'],
        run: () => setIsTemplateGalleryOpen(true),
      },
      {
        id: 'toggle-sidebar',
        title: isSidebarOpen ? 'Hide Workspace Sidebar' : 'Show Workspace Sidebar',
        subtitle: 'Toggle the saved workspaces sidebar',
        group: 'View',
        keywords: ['sidebar', 'workspaces', 'toggle', 'show', 'hide'],
        run: () => setIsSidebarOpen((open) => !open),
      },
      ...workspaceCommands,
      ...templateCommands,
      ...themeCommands,
      ...sessionCommands,
    ]
  }, [
    availableThemes,
    currentWorkspaceId,
    focusSession,
    formatWorkspaceTimestamp,
    handleSwitchWorkspace,
    handleThemeChange,
    isSidebarOpen,
    openTemplateDialog,
    openSaveTemplateDialog,
    openWorkspaceSetupDialog,
    openSaveWorkspaceDialog,
    sessions,
    spawnTerminal,
    theme.id,
    workspaces,
    workspaceTemplates,
  ])

  return (
    <div
      className="flex w-screen h-screen overflow-hidden"
      style={{ background: '#09090b', fontFamily: 'system-ui, sans-serif' }}
    >
      {isSidebarOpen && (
        <aside
          className="workspace-sidebar flex-shrink-0"
          style={{
            width: '280px',
            background: '#0d0d10',
            borderRight: '1px solid #1f1f23',
          }}
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: '#52525b' }}>
                Workspace Library
              </p>
              <p className="text-sm font-medium" style={{ color: '#f4f4f5' }}>
                {workspaces.length} saved • {workspaceTemplates.length} templates
              </p>
            </div>
            <button
              className="px-2 py-1 rounded-md text-xs border transition-colors"
              style={{ borderColor: '#27272a', color: '#a1a1aa' }}
              onClick={() => setIsSidebarOpen(false)}
              title="Hide sidebar"
            >
              Hide
            </button>
          </div>

          <div className="px-4 pb-3">
            <div className="flex gap-2">
              <button
                className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: theme.accent + '18',
                  border: `1px solid ${theme.accent}33`,
                  color: theme.accent,
                }}
                onClick={openSaveWorkspaceDialog}
              >
                Save Current As
              </button>
              <button
                className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: '#15151a',
                  border: '1px solid #27272a',
                  color: '#d4d4d8',
                }}
                onClick={openSaveTemplateDialog}
              >
                Save Template
              </button>
            </div>
            <button
              className="w-full mt-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: '#13131a',
                border: '1px solid #27272a',
                color: '#d4d4d8',
              }}
              onClick={() => setIsTemplateGalleryOpen(true)}
            >
              Browse Templates
            </button>
          </div>

          <div className="px-2 pb-4 overflow-y-auto h-[calc(100vh-152px)]">
            <section className="mb-5">
              <div className="px-2 pb-2 flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: '#71717a' }}>
                  Saved Workspaces
                </p>
                <span className="text-[11px]" style={{ color: '#52525b' }}>
                  {workspaces.length}
                </span>
              </div>

              {workspaces.length === 0 ? (
                <div
                  className="mx-2 rounded-xl p-4 text-sm"
                  style={{ border: '1px solid #1f1f23', color: '#71717a', background: '#111113' }}
                >
                  Save the current canvas as a named workspace to make it reusable.
                </div>
              ) : (
                workspaces.map((workspace) => {
                  const isCurrent = workspace.id === currentWorkspaceId
                  return (
                    <div
                      key={workspace.id}
                      className="workspace-sidebar-item rounded-xl px-3 py-3 mb-2"
                      style={{
                        background: isCurrent ? '#15151a' : 'transparent',
                        border: `1px solid ${isCurrent ? theme.accent + '44' : '#1f1f23'}`,
                      }}
                    >
                      <button
                        className="w-full text-left"
                        onClick={() => void handleSwitchWorkspace(workspace.id)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium" style={{ color: '#f4f4f5' }}>
                            {workspace.name}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] uppercase tracking-[0.16em]" style={{ color: theme.accent }}>
                              Current
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs" style={{ color: '#71717a' }}>
                          {workspace.projectName
                            ? `Project ${workspace.projectName}`
                            : `${workspace.snapshot.sessions.length} ${workspace.snapshot.sessions.length === 1 ? 'terminal' : 'terminals'}`} • Updated {formatWorkspaceTimestamp(workspace.updatedAt)}
                        </p>
                      </button>

                      <div className="flex items-center gap-2 mt-3">
                        <button
                          className="px-2 py-1 rounded-md text-xs border transition-colors"
                          style={{ borderColor: '#27272a', color: '#a1a1aa' }}
                          onClick={(event) => {
                            event.stopPropagation()
                            openRenameWorkspaceDialog(workspace)
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className="px-2 py-1 rounded-md text-xs border transition-colors"
                          style={{ borderColor: '#27272a', color: '#a1a1aa' }}
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleDeleteWorkspace(workspace)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </section>

            <section>
              <div className="px-2 pb-2 flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: '#71717a' }}>
                  Templates
                </p>
                <span className="text-[11px]" style={{ color: '#52525b' }}>
                  {workspaceTemplates.length}
                </span>
              </div>

              {workspaceTemplates.map((template) => (
                <div
                  key={template.id}
                  className="mb-2 rounded-xl px-3 py-3"
                  style={{
                    background: '#111113',
                    border: `1px solid ${template.accent}22`,
                  }}
                >
                  <button
                    className="w-full text-left"
                    onClick={() => openTemplateDialog(template)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium" style={{ color: '#f4f4f5' }}>
                        {template.name}
                      </span>
                      <span
                        className="rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em]"
                        style={{
                          color: template.accent,
                          background: template.accent + '14',
                          border: `1px solid ${template.accent}2a`,
                        }}
                      >
                        {template.source === 'custom' ? 'Custom' : template.category}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5" style={{ color: '#71717a' }}>
                      {template.description}
                    </p>
                    <p className="mt-2 text-[11px]" style={{ color: '#52525b' }}>
                      {template.snapshot.sessions.length} {template.snapshot.sessions.length === 1 ? 'terminal' : 'terminals'} starter
                    </p>
                  </button>

                  {template.source === 'custom' && (
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        className="px-2 py-1 rounded-md text-xs border transition-colors"
                        style={{ borderColor: '#27272a', color: '#a1a1aa' }}
                        onClick={() => openRenameTemplateDialog(template)}
                      >
                        Rename
                      </button>
                      <button
                        className="px-2 py-1 rounded-md text-xs border transition-colors"
                        style={{ borderColor: '#27272a', color: '#a1a1aa' }}
                        onClick={() => void handleDeleteTemplate(template)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          </div>
        </aside>
      )}

      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
      {/* Titlebar / toolbar */}
      <div
        className="flex items-center gap-3 px-4 flex-shrink-0 select-none"
        style={{
          height: '44px',
          background: '#111113',
          borderBottom: '1px solid #1f1f23',
          // Leave space for macOS traffic lights
          paddingLeft: isMac ? '80px' : '16px',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      >
        {/* App name */}
        <span className="text-xs font-semibold" style={{ color: theme.accent }}>
          sorbet
        </span>

        {!isSidebarOpen && (
          <button
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
            style={{
              background: 'transparent',
              border: '1px solid #3f3f46',
              color: '#71717a',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
            onClick={() => setIsSidebarOpen(true)}
            title="Show workspaces"
          >
            Workspaces
          </button>
        )}

        <div
          className="w-px h-4 mx-1"
          style={{ background: '#27272a', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        />

        {/* New terminal button */}
        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
          style={{
            background: 'transparent',
            border: '1px solid #3f3f46',
            color: '#71717a',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.color = theme.accent
            ;(e.currentTarget as HTMLElement).style.borderColor = theme.accent + '66'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.color = '#71717a'
            ;(e.currentTarget as HTMLElement).style.borderColor = '#3f3f46'
          }}
          onClick={spawnTerminal}
          title="New terminal (⌘T)"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          New
        </button>

        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
          style={{
            background: 'transparent',
            border: '1px solid #3f3f46',
            color: '#71717a',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          onClick={openSaveWorkspaceDialog}
          title="Save current workspace as a named preset"
        >
          Save Workspace
        </button>

        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
          style={{
            background: 'transparent',
            border: '1px solid #3f3f46',
            color: '#71717a',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          onClick={openSaveTemplateDialog}
          title="Save the current workspace as a reusable template"
        >
          Save Template
        </button>

        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
          style={{
            background: 'transparent',
            border: '1px solid #3f3f46',
            color: currentWorkspace ? '#71717a' : '#52525b',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          onClick={openWorkspaceSetupDialog}
          disabled={!currentWorkspace}
          title={currentWorkspace ? 'Open workspace settings' : 'Save a workspace first'}
        >
          Settings
        </button>

        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
          style={{
            background: 'transparent',
            border: '1px solid #3f3f46',
            color: '#71717a',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          onClick={() => setIsTemplateGalleryOpen(true)}
          title="Browse workspace templates"
        >
          Templates
        </button>

        <button
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
          style={{
            background: 'transparent',
            border: '1px solid #3f3f46',
            color: '#71717a',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          onClick={() => setIsCommandPaletteOpen(true)}
          title="Open command palette (⌘K)"
        >
          Commands
        </button>

        <div className="flex-1" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

        {currentWorkspace && (
          <span className="text-xs" style={{ color: '#71717a', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {currentWorkspace.name}
          </span>
        )}

        {currentWorkspace?.projectName && (
          <span
            className="rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em]"
            style={{
              color: theme.accent,
              background: theme.accent + '14',
              border: `1px solid ${theme.accent}2a`,
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
          >
            {currentWorkspace.projectName}
          </span>
        )}

        {/* Session count */}
        {sessions.length > 0 && (
          <span className="text-xs" style={{ color: '#52525b', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
          </span>
        )}

        {/* Theme picker */}
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <ThemePicker currentThemeId={theme.id} themes={availableThemes} onSelect={handleThemeChange} />
        </div>
      </div>

      {/* Grid canvas */}
      <div className="flex-1 overflow-auto" style={{ background: '#09090b' }}>
        {visibleSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <span style={{ color: '#3f3f46', fontSize: '48px' }}>⬛</span>
            <p className="text-sm" style={{ color: '#52525b' }}>
              No terminals open
            </p>
            <div className="flex items-center gap-3">
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: theme.accent + '22',
                  border: `1px solid ${theme.accent}44`,
                  color: theme.accent,
                }}
                onClick={spawnTerminal}
              >
                Open Terminal
              </button>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: '#121217',
                  border: '1px solid #27272a',
                  color: '#d4d4d8',
                }}
                onClick={() => setIsTemplateGalleryOpen(true)}
              >
                Start From Template
              </button>
            </div>
          </div>
        ) : (
          <GridLayout
            className="layout"
            layout={gridLayout}
            cols={GRID_COLS}
            rowHeight={GRID_ROW_HEIGHT}
            width={gridWidth}
            margin={[6, 6]}
            containerPadding={[8, 8]}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".drag-handle"
            draggableCancel=".window-action, .title-editor, .terminal-content, .terminal-dock-item"
            resizeHandles={['e', 's', 'se']}
            isResizable
            isDraggable
          >
            {gridSessions.map((session) => (
              <div key={session.id} className="rounded-xl">
                <TerminalCard
                  key={`${currentWorkspaceId || 'workspace'}:${workspaceTerminalEpoch}:${session.id}`}
                  sessionId={session.id}
                  theme={themesById[session.themeId || ''] || theme}
                  workspaceTheme={theme}
                  workspaceProjectPath={currentWorkspace?.projectPath}
                  themes={availableThemes}
                  preferences={preferences}
                  isActive={activeSessionId === session.id}
                  isMaximized={maximizedSessionId === session.id}
                  isPinned={Boolean(session.isPinned)}
                  isUsingCustomTheme={Boolean(session.themeId && themesById[session.themeId])}
                  onActivate={() => setActiveSession(session.id)}
                  onMinimize={() => toggleMinimizeSession(session.id)}
                  onMaximize={() => toggleMaximizeSession(session.id)}
                  onTogglePin={() => togglePinSession(session.id)}
                  onThemeChange={(nextThemeId) =>
                    updateSession(session.id, { themeId: nextThemeId || undefined })
                  }
                />
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {minimizedSessions.length > 0 && (
        <div
          className="flex items-center gap-2 px-3 py-2 border-t flex-shrink-0"
          style={{
            background: '#0f0f11',
            borderColor: '#1f1f23',
          }}
        >
          {minimizedSessions.map((session) => (
            <button
              key={session.id}
              className="terminal-dock-item px-3 py-1.5 rounded-md text-xs transition-colors"
              style={{
                background: '#18181b',
                border: `1px solid ${(themesById[session.themeId || ''] || theme).accent}33`,
                color: '#d4d4d8',
              }}
              onClick={() => {
                toggleMinimizeSession(session.id)
                setActiveSession(session.id)
              }}
            >
              {session.title || 'Terminal'}
            </button>
          ))}
        </div>
      )}

      {isTemplateGalleryOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center px-4 py-8"
          style={{ background: 'rgba(9, 9, 11, 0.76)', zIndex: 1000 }}
          onClick={() => setIsTemplateGalleryOpen(false)}
        >
          <div
            className="w-full max-w-5xl rounded-[28px] overflow-hidden"
            style={{
              background: '#101014',
              border: '1px solid #27272a',
              boxShadow: '0 30px 100px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b" style={{ borderColor: '#202027' }}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: '#71717a' }}>
                  Workspace Templates
                </p>
                <h2 className="mt-2 text-xl font-semibold" style={{ color: '#f4f4f5' }}>
                  Start from a polished layout
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: '#a1a1aa' }}>
                  Templates create a fresh named workspace with pre-arranged terminals, theme direction, and visual structure for common flows.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: theme.accent + '18',
                    border: `1px solid ${theme.accent}33`,
                    color: theme.accent,
                  }}
                  onClick={openSaveTemplateDialog}
                >
                  Save Current as Template
                </button>
                <button
                  className="px-3 py-2 rounded-lg text-sm border transition-colors"
                  style={{ borderColor: '#27272a', color: '#a1a1aa' }}
                  onClick={() => setIsTemplateGalleryOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 max-h-[70vh] overflow-y-auto">
              {workspaceTemplates.map((template) => (
                <div
                  key={template.id}
                  className="rounded-[24px] p-5"
                  style={{
                    background: `linear-gradient(180deg, ${template.accent}10 0%, #121218 38%, #0d0d12 100%)`,
                    border: `1px solid ${template.accent}2a`,
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]"
                      style={{
                        color: template.accent,
                        background: template.accent + '12',
                        border: `1px solid ${template.accent}24`,
                      }}
                    >
                      {template.source === 'custom' ? 'Custom' : template.category}
                    </span>
                    <span className="text-[11px]" style={{ color: '#71717a' }}>
                      {template.snapshot.sessions.length} {template.snapshot.sessions.length === 1 ? 'terminal' : 'terminals'}
                    </span>
                  </div>

                  <h3 className="mt-4 text-lg font-semibold" style={{ color: '#f4f4f5' }}>
                    {template.name}
                  </h3>
                  <p className="mt-3 text-sm leading-6" style={{ color: '#a1a1aa' }}>
                    {template.description}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {template.snapshot.sessions.map((session) => (
                      <span
                        key={session.id}
                        className="rounded-full px-2.5 py-1 text-[11px]"
                        style={{
                          color: '#d4d4d8',
                          background: '#17171d',
                          border: '1px solid #27272a',
                        }}
                      >
                        {session.title}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <p className="text-xs" style={{ color: '#71717a' }}>
                      New workspace name: {template.suggestedWorkspaceName}
                    </p>
                    <div className="flex items-center gap-2">
                      {template.source === 'custom' && (
                        <>
                          <button
                            className="px-3 py-2 rounded-lg text-sm border transition-colors"
                            style={{ borderColor: '#27272a', color: '#d4d4d8' }}
                            onClick={() => openRenameTemplateDialog(template)}
                          >
                            Rename
                          </button>
                          <button
                            className="px-3 py-2 rounded-lg text-sm border transition-colors"
                            style={{ borderColor: '#27272a', color: '#d4d4d8' }}
                            onClick={() => void handleDeleteTemplate(template)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                      <button
                        className="px-3 py-2 rounded-lg text-sm font-medium"
                        style={{
                          background: template.accent,
                          color: '#09090b',
                        }}
                        onClick={() => openTemplateDialog(template)}
                      >
                        Use Template
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {workspaceSetupDraft && (
        <div
          className="fixed inset-0 flex items-center justify-center px-4 py-8"
          style={{ background: 'rgba(9, 9, 11, 0.76)', zIndex: 1000 }}
          onClick={() => setWorkspaceSetupDraft(null)}
        >
          <div
            className="w-full max-w-5xl rounded-[28px] overflow-hidden"
            style={{
              background: '#101014',
              border: '1px solid #27272a',
              boxShadow: '0 30px 100px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b" style={{ borderColor: '#202027' }}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: '#71717a' }}>
                  Workspace Settings
                </p>
                <h2 className="mt-2 text-xl font-semibold" style={{ color: '#f4f4f5' }}>
                  Project-aware restore and startup actions
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: '#a1a1aa' }}>
                  Associate this workspace with a project path and define how each terminal should relaunch when you come back.
                </p>
              </div>
              <button
                className="px-3 py-2 rounded-lg text-sm border transition-colors"
                style={{ borderColor: '#27272a', color: '#a1a1aa' }}
                onClick={() => setWorkspaceSetupDraft(null)}
              >
                Close
              </button>
            </div>

            <div className="p-6 max-h-[72vh] overflow-y-auto">
              <div
                className="rounded-[24px] p-5"
                style={{
                  background: '#121218',
                  border: '1px solid #202027',
                }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#f4f4f5' }}>
                      Project Path
                    </p>
                    <p className="mt-1 text-xs leading-5" style={{ color: '#71717a' }}>
                      When a terminal does not define its own startup directory, Sorbet will fall back to this project path.
                    </p>
                  </div>
                  {activeSession?.cwd && (
                    <button
                      className="px-3 py-2 rounded-lg text-sm border transition-colors"
                      style={{ borderColor: '#27272a', color: '#d4d4d8' }}
                      onClick={() =>
                        setWorkspaceSetupDraft((current) =>
                          current
                            ? {
                                ...current,
                                projectPath: activeSession.cwd || '',
                              }
                            : current
                        )
                      }
                    >
                      Use Active Terminal CWD
                    </button>
                  )}
                </div>

                <input
                  className="w-full mt-4 rounded-xl px-4 py-3 text-sm outline-none"
                  style={{
                    background: '#09090b',
                    border: `1px solid ${theme.accent}33`,
                    color: '#f4f4f5',
                  }}
                  value={workspaceSetupDraft.projectPath}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value
                    setWorkspaceSetupDraft((current) =>
                      current
                        ? {
                            ...current,
                            projectPath: nextValue,
                          }
                        : current
                    )
                  }}
                  placeholder="/path/to/project"
                />

                <p className="mt-3 text-xs" style={{ color: '#71717a' }}>
                  {workspaceSetupDraft.projectPath.trim()
                    ? `Project label: ${deriveProjectName(workspaceSetupDraft.projectPath) || workspaceSetupDraft.projectPath}`
                    : 'No project path set yet.'}
                </p>
              </div>

              <div className="mt-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#f4f4f5' }}>
                      Terminal Startup Actions
                    </p>
                    <p className="mt-1 text-xs leading-5" style={{ color: '#71717a' }}>
                      Each terminal can reopen in a specific directory and optionally run a boot command like `npm run dev` or `pnpm test`.
                    </p>
                  </div>
                  <span className="text-xs" style={{ color: '#52525b' }}>
                    {workspaceSetupDraft.sessions.length} {workspaceSetupDraft.sessions.length === 1 ? 'terminal' : 'terminals'}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {workspaceSetupDraft.sessions.map((sessionDraft) => {
                    const liveSession = sessions.find((session) => session.id === sessionDraft.id)
                    return (
                      <div
                        key={sessionDraft.id}
                        className="rounded-[24px] p-4"
                        style={{
                          background: '#121218',
                          border: '1px solid #202027',
                        }}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium" style={{ color: '#f4f4f5' }}>
                              {sessionDraft.title}
                            </p>
                            <p className="mt-1 text-xs" style={{ color: '#71717a' }}>
                              {liveSession?.cwd || sessionDraft.startupCwd || workspaceSetupDraft.projectPath || 'Terminal'}
                            </p>
                          </div>
                          {liveSession?.cwd && (
                            <button
                              className="px-3 py-2 rounded-lg text-sm border transition-colors"
                              style={{ borderColor: '#27272a', color: '#d4d4d8' }}
                              onClick={() =>
                                setWorkspaceSetupDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        sessions: current.sessions.map((session) =>
                                          session.id === sessionDraft.id
                                            ? {
                                                ...session,
                                                startupCwd: liveSession.cwd || '',
                                              }
                                            : session
                                        ),
                                      }
                                    : current
                                )
                              }
                            >
                              Use Live CWD
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
                          <div>
                            <label className="block text-xs font-medium mb-2" style={{ color: '#a1a1aa' }}>
                              Startup directory
                            </label>
                            <input
                              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                              style={{
                                background: '#09090b',
                                border: `1px solid ${theme.accent}22`,
                                color: '#f4f4f5',
                              }}
                              value={sessionDraft.startupCwd}
                              onChange={(event) => {
                                const nextValue = event.currentTarget.value
                                setWorkspaceSetupDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        sessions: current.sessions.map((session) =>
                                          session.id === sessionDraft.id
                                            ? {
                                                ...session,
                                                startupCwd: nextValue,
                                              }
                                            : session
                                        ),
                                      }
                                    : current
                                )
                              }}
                              placeholder={workspaceSetupDraft.projectPath || '/path/to/project'}
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium mb-2" style={{ color: '#a1a1aa' }}>
                              Startup command
                            </label>
                            <input
                              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                              style={{
                                background: '#09090b',
                                border: `1px solid ${theme.accent}22`,
                                color: '#f4f4f5',
                              }}
                              value={sessionDraft.startupCommand}
                              onChange={(event) => {
                                const nextValue = event.currentTarget.value
                                setWorkspaceSetupDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        sessions: current.sessions.map((session) =>
                                          session.id === sessionDraft.id
                                            ? {
                                                ...session,
                                                startupCommand: nextValue,
                                              }
                                            : session
                                        ),
                                      }
                                    : current
                                )
                              }}
                              placeholder="npm run dev"
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-6">
                <button
                  className="px-3 py-2 rounded-lg text-sm border transition-colors"
                  style={{ borderColor: '#27272a', color: '#a1a1aa' }}
                  onClick={() => setWorkspaceSetupDraft(null)}
                >
                  Cancel
                </button>
                <button
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{
                    background: theme.accent,
                    color: '#09090b',
                  }}
                  onClick={() => void handleWorkspaceSetupSave()}
                >
                  Save Workspace Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {workspaceDialog && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: 'rgba(9, 9, 11, 0.72)', zIndex: 1000 }}
          onClick={() => setWorkspaceDialog(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5"
            style={{
              background: '#111113',
              border: '1px solid #27272a',
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: '#f4f4f5' }}>
                  {workspaceDialog.mode === 'save-workspace'
                    ? 'Save Workspace As'
                    : workspaceDialog.mode === 'create-workspace-from-template'
                      ? 'Create Workspace From Template'
                      : workspaceDialog.mode === 'save-template'
                        ? 'Save Template'
                        : workspaceDialog.mode === 'rename-template'
                          ? 'Rename Template'
                          : 'Rename Workspace'}
                </h2>
                <p className="mt-1 text-xs" style={{ color: '#71717a' }}>
                  {workspaceDialog.mode === 'save-workspace'
                    ? 'Create a named workspace snapshot from the current canvas.'
                    : workspaceDialog.mode === 'create-workspace-from-template'
                      ? 'Create a fresh workspace from a built-in layout template.'
                      : workspaceDialog.mode === 'save-template'
                        ? 'Save the current layout as a reusable custom template.'
                        : workspaceDialog.mode === 'rename-template'
                          ? 'Update the custom template metadata.'
                          : 'Update the workspace name without changing its layout.'}
                </p>
              </div>
              <button
                className="px-2 py-1 rounded-md text-xs border transition-colors"
                style={{ borderColor: '#27272a', color: '#a1a1aa' }}
                onClick={() => setWorkspaceDialog(null)}
              >
                Close
              </button>
            </div>

            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault()
                void handleWorkspaceDialogSubmit()
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {(workspaceDialog.mode === 'create-workspace-from-template' || workspaceDialog.mode === 'rename-template') && templateInDialog && (
                <div
                  className="mb-4 rounded-xl p-3"
                  style={{
                    background: '#0d0d12',
                    border: `1px solid ${templateInDialog.accent}2a`,
                  }}
                >
                  <p className="text-xs font-medium" style={{ color: templateInDialog.accent }}>
                    {templateInDialog.name}
                  </p>
                  <p className="mt-1 text-xs leading-5" style={{ color: '#71717a' }}>
                    {templateInDialog.description}
                  </p>
                </div>
              )}

              <label className="block text-xs font-medium mb-2" style={{ color: '#a1a1aa' }}>
                {workspaceDialog.mode === 'save-template' || workspaceDialog.mode === 'rename-template'
                  ? 'Template name'
                  : 'Workspace name'}
              </label>
              <input
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: '#09090b',
                  border: `1px solid ${theme.accent}44`,
                  color: '#f4f4f5',
                }}
                value={workspaceDialog.value}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value
                  setWorkspaceDialog((current) => {
                    if (!current) return current
                    if (current.mode === 'save-workspace') {
                      return {
                        mode: 'save-workspace',
                        value: nextValue,
                      }
                    }
                    if (current.mode === 'create-workspace-from-template') {
                      return {
                        mode: 'create-workspace-from-template',
                        templateId: current.templateId,
                        value: nextValue,
                      }
                    }
                    if (current.mode === 'save-template') {
                      return {
                        mode: 'save-template',
                        value: nextValue,
                        description: current.description,
                      }
                    }
                    if (current.mode === 'rename-template') {
                      return {
                        mode: 'rename-template',
                        templateId: current.templateId,
                        value: nextValue,
                        description: current.description,
                      }
                    }
                    return {
                      mode: 'rename-workspace',
                      workspaceId: current.workspaceId,
                      value: nextValue,
                    }
                  })
                }}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder={workspaceDialog.mode === 'save-template' || workspaceDialog.mode === 'rename-template' ? 'Template name' : 'Workspace name'}
                autoFocus
              />

              {(workspaceDialog.mode === 'save-template' || workspaceDialog.mode === 'rename-template') && (
                <>
                  <label className="block text-xs font-medium mt-4 mb-2" style={{ color: '#a1a1aa' }}>
                    Description
                  </label>
                  <textarea
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                    style={{
                      background: '#09090b',
                      border: `1px solid ${theme.accent}44`,
                      color: '#f4f4f5',
                      minHeight: '88px',
                    }}
                    value={workspaceDialog.description}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value
                      setWorkspaceDialog((current) => {
                        if (!current || (current.mode !== 'save-template' && current.mode !== 'rename-template')) {
                          return current
                        }

                        return {
                          ...current,
                          description: nextValue,
                        }
                      })
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    placeholder="Describe when this template is useful"
                  />
                </>
              )}

              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg text-sm border transition-colors"
                  style={{ borderColor: '#27272a', color: '#a1a1aa' }}
                  onClick={() => setWorkspaceDialog(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg text-sm font-medium"
                  style={{
                    background: theme.accent,
                    color: '#09090b',
                  }}
                >
                  {workspaceDialog.mode === 'save-workspace'
                    ? 'Save Workspace'
                    : workspaceDialog.mode === 'create-workspace-from-template'
                      ? 'Create Workspace'
                      : workspaceDialog.mode === 'save-template'
                        ? 'Save Template'
                        : workspaceDialog.mode === 'rename-template'
                          ? 'Update Template'
                          : 'Rename Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        accentColor={theme.accent}
        items={commandPaletteItems}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
      </div>
    </div>
  )
}
