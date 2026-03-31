import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { TerminalPreferences, Theme } from '../types'
import { useSorbetStore } from '../store'
import '@xterm/xterm/css/xterm.css'

interface TerminalCardProps {
  sessionId: string
  theme: Theme
  workspaceTheme: Theme
  themes: Theme[]
  preferences: TerminalPreferences
  isActive: boolean
  isMaximized: boolean
  isPinned: boolean
  isUsingCustomTheme: boolean
  onActivate: () => void
  onMinimize: () => void
  onMaximize: () => void
  onTogglePin: () => void
  onThemeChange: (themeId?: string) => void
}

export function TerminalCard({
  sessionId,
  theme,
  workspaceTheme,
  themes,
  preferences,
  isActive,
  isMaximized,
  isPinned,
  isUsingCustomTheme,
  onActivate,
  onMinimize,
  onMaximize,
  onTogglePin,
  onThemeChange,
}: TerminalCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const cleanupRef = useRef<(() => void)[]>([])
  const isInitialized = useRef(false)
  const resizeFrameRef = useRef<number | null>(null)
  const resizeTimeoutRef = useRef<number | null>(null)
  const activityTimeoutRef = useRef<number | null>(null)

  const { updateSession, removeSession, sessions } = useSorbetStore()
  const session = sessions.find((item) => item.id === sessionId)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const themeMenuRef = useRef<HTMLDivElement>(null)
  const displayTitle = useMemo(() => session?.title || 'Terminal', [session?.title])
  const shellLabel = session?.shellName || 'shell'
  const cwdLabel = useMemo(() => {
    if (!session?.cwd) return 'Home'
    const parts = session.cwd.split('/').filter(Boolean)
    return parts[parts.length - 1] || session.cwd
  }, [session?.cwd])
  const statusLabel = session?.status === 'active'
    ? 'Active'
    : session?.status === 'exited'
      ? 'Exited'
      : session?.isAlive
        ? 'Idle'
        : 'Starting'
  const statusColor =
    session?.status === 'active'
      ? theme.accent
      : session?.status === 'exited'
        ? '#f87171'
        : '#71717a'

  const matchesShortcut = useCallback((event: KeyboardEvent, shortcut: string) => {
    const parts = shortcut
      .split('+')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)

    if (parts.length === 0) return false

    const keyPart = parts[parts.length - 1]
    const modifiers = new Set(parts.slice(0, -1))
    const wantsCmdOrCtrl = modifiers.has('cmdorctrl')
    const modifierMatches =
      event.shiftKey === modifiers.has('shift') &&
      event.altKey === modifiers.has('alt') &&
      event.metaKey === (modifiers.has('meta') || (wantsCmdOrCtrl && window.sorbet.platform === 'darwin')) &&
      event.ctrlKey === (modifiers.has('ctrl') || (wantsCmdOrCtrl && window.sorbet.platform !== 'darwin'))

    if (!modifierMatches) return false

    return event.key.toLowerCase() === keyPart
  }, [])

  const focusTerminalDom = useCallback(() => {
    const textarea = containerRef.current?.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')
    textarea?.focus()
  }, [])

  const fitTerminal = useCallback(() => {
    if (!fitAddonRef.current || !terminalRef.current) return
    try {
      fitAddonRef.current.fit()
      const { cols, rows } = terminalRef.current
      window.sorbet.pty.resize(sessionId, cols, rows)
    } catch {}
  }, [sessionId])

  const scheduleTerminalFit = useCallback(() => {
    if (resizeFrameRef.current !== null) {
      window.cancelAnimationFrame(resizeFrameRef.current)
    }
    if (resizeTimeoutRef.current !== null) {
      window.clearTimeout(resizeTimeoutRef.current)
    }

    resizeFrameRef.current = window.requestAnimationFrame(() => {
      fitTerminal()
      resizeTimeoutRef.current = window.setTimeout(() => {
        fitTerminal()
      }, 40)
    })
  }, [fitTerminal])

  const focusTerminal = useCallback(() => {
    onActivate()
    terminalRef.current?.focus()
    terminalRef.current?.textarea?.focus()
    focusTerminalDom()
  }, [focusTerminalDom, onActivate])

  const pasteFromClipboard = useCallback(async () => {
    const text = await window.sorbet.clipboard.readText()
    if (!text || !terminalRef.current) return

    focusTerminal()
    terminalRef.current.paste(text)
  }, [focusTerminal])

  const copySelectionToClipboard = useCallback(async () => {
    const selection = terminalRef.current?.getSelection() || ''
    if (!selection) return

    await window.sorbet.clipboard.writeText(selection)
  }, [])

  useEffect(() => {
    if (isInitialized.current || !containerRef.current) return
    isInitialized.current = true

    // Build xterm instance
    const term = new Terminal({
      fontFamily: preferences.fontFamily,
      fontSize: preferences.fontSize,
      lineHeight: preferences.lineHeight,
      letterSpacing: preferences.letterSpacing,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: preferences.scrollback,
      theme: {
        background: theme.background,
        foreground: theme.foreground,
        cursor: theme.cursor,
        cursorAccent: theme.cursorAccent,
        selectionBackground: theme.selectionBackground,
        black: theme.black,
        red: theme.red,
        green: theme.green,
        yellow: theme.yellow,
        blue: theme.blue,
        magenta: theme.magenta,
        cyan: theme.cyan,
        white: theme.white,
        brightBlack: theme.brightBlack,
        brightRed: theme.brightRed,
        brightGreen: theme.brightGreen,
        brightYellow: theme.brightYellow,
        brightBlue: theme.brightBlue,
        brightMagenta: theme.brightMagenta,
        brightCyan: theme.brightCyan,
        brightWhite: theme.brightWhite,
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    term.loadAddon(fitAddon)
    term.loadAddon(webLinksAddon)
    term.open(containerRef.current)

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    // Fit after a tick (DOM must be rendered)
    requestAnimationFrame(() => {
      fitAddon.fit()
      term.focus()
      term.textarea?.focus()
      focusTerminalDom()
      const { cols, rows } = term

      // Spawn PTY
      window.sorbet.pty.create(sessionId, cols, rows).then((result) => {
        if (result.success) {
          updateSession(sessionId, {
            pid: result.pid,
            isAlive: true,
            shellName: result.shellName,
            cwd: result.cwd,
            status: 'idle',
          })
        } else {
          term.write(`\r\n\x1b[31mFailed to start shell: ${result.error}\x1b[0m\r\n`)
        }
      })
    })

    // Wire PTY output → xterm
    const removeDataListener = window.sorbet.pty.onData(sessionId, (data) => {
      term.write(data)
      const isSessionActive = useSorbetStore.getState().activeSessionId === sessionId

      updateSession(sessionId, {
        lastActivityAt: Date.now(),
        status: 'active',
        hasUnreadOutput: !isSessionActive,
      })

      if (activityTimeoutRef.current !== null) {
        window.clearTimeout(activityTimeoutRef.current)
      }

      activityTimeoutRef.current = window.setTimeout(() => {
        const currentSession = useSorbetStore.getState().sessions.find((item) => item.id === sessionId)
        if (currentSession?.isAlive) {
          updateSession(sessionId, { status: 'idle' })
        }
      }, 1200)
    })

    // Wire PTY exit
    const removeExitListener = window.sorbet.pty.onExit(sessionId, () => {
      updateSession(sessionId, { isAlive: false, status: 'exited' })
      term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
    })

    const removeMetadataListener = window.sorbet.pty.onMetadata(sessionId, (metadata) => {
      updateSession(sessionId, {
        shellName: metadata.shellName,
        cwd: metadata.cwd,
      })
    })

    // Wire xterm input → PTY
    const dataDisposable = term.onData((data) => {
      window.sorbet.pty.write(sessionId, data)
    })

    // Handle title changes (shell sets window title via escape codes)
    const titleDisposable = term.onTitleChange((title) => {
      if (title) updateSession(sessionId, { title })
    })

    cleanupRef.current = [
      removeDataListener,
      removeExitListener,
      removeMetadataListener,
      () => dataDisposable.dispose(),
      () => titleDisposable.dispose(),
      () => {
        if (resizeFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeFrameRef.current)
        }
        if (resizeTimeoutRef.current !== null) {
          window.clearTimeout(resizeTimeoutRef.current)
        }
        if (activityTimeoutRef.current !== null) {
          window.clearTimeout(activityTimeoutRef.current)
        }
      },
      () => term.dispose(),
    ]

    return () => {
      cleanupRef.current.forEach((fn) => fn())
      window.sorbet.pty.kill(sessionId)
    }
  }, [focusTerminalDom, sessionId, updateSession])

  // Update theme when it changes
  useEffect(() => {
    if (!terminalRef.current) return
    terminalRef.current.options.theme = {
      background: theme.background,
      foreground: theme.foreground,
      cursor: theme.cursor,
      cursorAccent: theme.cursorAccent,
      selectionBackground: theme.selectionBackground,
      black: theme.black,
      red: theme.red,
      green: theme.green,
      yellow: theme.yellow,
      blue: theme.blue,
      magenta: theme.magenta,
      cyan: theme.cyan,
      white: theme.white,
      brightBlack: theme.brightBlack,
      brightRed: theme.brightRed,
      brightGreen: theme.brightGreen,
      brightYellow: theme.brightYellow,
      brightBlue: theme.brightBlue,
      brightMagenta: theme.brightMagenta,
      brightCyan: theme.brightCyan,
      brightWhite: theme.brightWhite,
    }
  }, [theme])

  useEffect(() => {
    if (!terminalRef.current) return
    terminalRef.current.options.fontFamily = preferences.fontFamily
    terminalRef.current.options.fontSize = preferences.fontSize
    terminalRef.current.options.lineHeight = preferences.lineHeight
    terminalRef.current.options.letterSpacing = preferences.letterSpacing
    terminalRef.current.options.scrollback = preferences.scrollback
    scheduleTerminalFit()
  }, [preferences.fontFamily, preferences.fontSize, preferences.letterSpacing, preferences.lineHeight, preferences.scrollback, scheduleTerminalFit])

  useEffect(() => {
    if (!terminalRef.current) return

    terminalRef.current.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (!preferences.enableClipboardShortcuts) {
        return true
      }

      if (matchesShortcut(event, preferences.copyShortcut)) {
        if (terminalRef.current?.hasSelection()) {
          void copySelectionToClipboard()
          return false
        }
        return true
      }

      if (matchesShortcut(event, preferences.pasteShortcut)) {
        void pasteFromClipboard()
        return false
      }

      return true
    })
  }, [copySelectionToClipboard, matchesShortcut, pasteFromClipboard, preferences.copyShortcut, preferences.enableClipboardShortcuts, preferences.pasteShortcut])

  // Fit terminal when container resizes
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(() => {
      scheduleTerminalFit()
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [scheduleTerminalFit])

  useEffect(() => {
    if (!containerRef.current) return

    const element = containerRef.current
    const handleContextMenu = (event: MouseEvent) => {
      if (!preferences.rightClickPaste) return

      event.preventDefault()
      void pasteFromClipboard()
    }

    element.addEventListener('contextmenu', handleContextMenu)
    return () => element.removeEventListener('contextmenu', handleContextMenu)
  }, [pasteFromClipboard, preferences.rightClickPaste])

  useEffect(() => {
    if (!containerRef.current) return

    const element = containerRef.current
    const handleMouseDown = (event: MouseEvent) => {
      if (!preferences.middleClickPaste || event.button !== 1) return

      event.preventDefault()
      void pasteFromClipboard()
    }

    element.addEventListener('mousedown', handleMouseDown)
    return () => element.removeEventListener('mousedown', handleMouseDown)
  }, [pasteFromClipboard, preferences.middleClickPaste])

  // Focus terminal when activated
  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus()
      terminalRef.current.textarea?.focus()
      focusTerminalDom()
    }
  }, [focusTerminalDom, isActive])

  useEffect(() => {
    if (!isActive || !session?.hasUnreadOutput) return
    updateSession(sessionId, { hasUnreadOutput: false })
  }, [isActive, session?.hasUnreadOutput, sessionId, updateSession])

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(displayTitle)
    }
  }, [displayTitle, isEditingTitle])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    window.sorbet.pty.kill(sessionId)
    removeSession(sessionId)
  }

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation()
    onMinimize()
  }

  const handleMaximize = (e: React.MouseEvent) => {
    e.stopPropagation()
    onMaximize()
    requestAnimationFrame(() => {
      focusTerminal()
    })
  }

  const handleTitleSubmit = () => {
    const nextTitle = draftTitle.trim() || 'Terminal'
    updateSession(sessionId, { title: nextTitle })
    setDraftTitle(nextTitle)
    setIsEditingTitle(false)
    requestAnimationFrame(() => {
      focusTerminal()
    })
  }

  const handleStartTitleEditing = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDraftTitle(displayTitle)
    setIsEditingTitle(true)
  }

  const handleTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation()
    onTogglePin()
  }

  const handleThemeButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsThemeMenuOpen((open) => !open)
  }

  const handleSelectTheme = (nextThemeId?: string) => {
    onThemeChange(nextThemeId)
    setIsThemeMenuOpen(false)
    requestAnimationFrame(() => {
      focusTerminal()
    })
  }

  return (
    <div
      className="group flex flex-col w-full h-full rounded-xl overflow-hidden"
      style={{
        border: `1px solid ${isActive ? theme.accent + '66' : '#27272a'}`,
        background: theme.background,
        boxShadow: isActive ? `0 0 0 1px ${theme.accent}22, 0 4px 24px ${theme.accent}11` : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onClick={focusTerminal}
      onMouseDown={focusTerminal}
    >
      <div className="terminal-identity-strip" style={{ background: theme.accent }} />

      {/* Title bar */}
      <div
        className={`grid items-center px-3 flex-shrink-0 select-none cursor-default ${isPinned ? '' : 'drag-handle'}`}
        style={{
          minHeight: '44px',
          background: theme.background,
          borderBottom: `1px solid #27272a`,
          gridTemplateColumns: '72px minmax(0, 1fr) 72px',
        }}
      >
        {/* Traffic light dots */}
        <div className="flex items-center gap-2 justify-start">
          <button
            className="window-action w-3 h-3 rounded-full flex-shrink-0 transition-opacity hover:opacity-70"
            style={{ background: '#f87171' }}
            onClick={handleClose}
            onMouseDown={(e) => e.stopPropagation()}
            title="Close"
          />
          <button
            className="window-action w-3 h-3 rounded-full flex-shrink-0 transition-opacity hover:opacity-70"
            style={{ background: '#fbbf24' }}
            onClick={handleMinimize}
            onMouseDown={(e) => e.stopPropagation()}
            title="Minimize"
          />
          <button
            className="window-action w-3 h-3 rounded-full flex-shrink-0 transition-opacity hover:opacity-70"
            style={{ background: '#4ade80' }}
            onClick={handleMaximize}
            onMouseDown={(e) => e.stopPropagation()}
            title={isMaximized ? 'Restore' : 'Maximize'}
          />
        </div>

        {/* Session title */}
        <div className="flex items-center justify-center min-w-0 py-1">
          <div className="flex flex-col items-center justify-center min-w-0 max-w-[260px]">
            <div className="flex items-center justify-center gap-2 min-w-0 w-full">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: theme.accent }}
                title={isUsingCustomTheme ? `${theme.name} theme` : `Inheriting ${workspaceTheme.name}`}
              />
              {isEditingTitle ? (
                <input
                  className="title-editor pointer-events-auto w-full px-2 py-0.5 rounded text-xs text-center outline-none"
                  style={{
                    background: '#18181b',
                    border: `1px solid ${theme.accent}55`,
                    color: theme.foreground,
                  }}
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.currentTarget.value)}
                  onBlur={handleTitleSubmit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleTitleSubmit()
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setDraftTitle(displayTitle)
                      setIsEditingTitle(false)
                    }
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <div
                  className="truncate px-1 text-xs font-medium text-center"
                  style={{ color: isActive ? theme.foreground : '#a1a1aa' }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    setDraftTitle(displayTitle)
                    setIsEditingTitle(true)
                  }}
                  title="Double-click to rename terminal"
                >
                  {displayTitle}
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-1.5 min-w-0 w-full mt-0.5">
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[9px] uppercase tracking-[0.16em] flex-shrink-0"
                style={{
                  color: statusColor,
                  background: `${statusColor}18`,
                  border: `1px solid ${statusColor}2e`,
                }}
                title={session?.lastActivityAt ? `Last activity at ${new Date(session.lastActivityAt).toLocaleTimeString()}` : statusLabel}
              >
                <span className="w-1 h-1 rounded-full" style={{ background: statusColor }} />
                {statusLabel}
              </span>
              <span
                className="truncate rounded-full px-1.5 py-[1px] text-[10px]"
                style={{
                  color: '#a1a1aa',
                  background: '#141418',
                  border: '1px solid #232329',
                }}
                title={session?.shellName || 'Default shell'}
              >
                {shellLabel}
              </span>
              <span
                className="truncate rounded-full px-1.5 py-[1px] text-[10px]"
                style={{
                  maxWidth: '120px',
                  color: '#a1a1aa',
                  background: '#141418',
                  border: '1px solid #232329',
                }}
                title={session?.cwd || 'Current working directory'}
              >
                {cwdLabel}
              </span>
              {session?.hasUnreadOutput && (
                <span
                  className="inline-flex items-center rounded-full px-1.5 py-[1px] text-[9px] uppercase tracking-[0.12em] flex-shrink-0"
                  style={{
                    color: theme.accent,
                    background: `${theme.accent}18`,
                    border: `1px solid ${theme.accent}2e`,
                  }}
                  title="Unread terminal output"
                >
                  Unread
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Active indicator */}
        <div className="flex items-center justify-end gap-2">
          <div ref={themeMenuRef} className="relative">
            <button
              className="window-action flex items-center justify-center w-5 h-5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                color: isUsingCustomTheme ? theme.accent : isActive ? theme.foreground : '#71717a',
                background: isUsingCustomTheme ? theme.accent + '1a' : isActive ? '#18181b' : 'transparent',
              }}
              onClick={handleThemeButtonClick}
              onMouseDown={(e) => e.stopPropagation()}
              title={isUsingCustomTheme ? `Window theme: ${theme.name}` : 'Inherit workspace theme'}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 2.2a4.8 4.8 0 1 0 4.8 4.8c0-.5-.1-1-.2-1.4A2.8 2.8 0 0 1 9.9 3a3 3 0 0 1-1.9-.8Z"
                  stroke="currentColor"
                  strokeWidth="1.15"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {isThemeMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden py-1"
                style={{
                  background: '#18181b',
                  border: '1px solid #27272a',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  minWidth: '188px',
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-left transition-colors"
                  style={{
                    color: !isUsingCustomTheme ? '#f4f4f5' : '#a1a1aa',
                    background: !isUsingCustomTheme ? '#27272a' : 'transparent',
                  }}
                  onClick={() => handleSelectTheme(undefined)}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: workspaceTheme.accent }}
                  />
                  Inherit {workspaceTheme.name}
                </button>
                {themes.map((option) => (
                  <button
                    key={option.id}
                    className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-left transition-colors"
                    style={{
                      color: session?.themeId === option.id ? '#f4f4f5' : '#a1a1aa',
                      background: session?.themeId === option.id ? '#27272a' : 'transparent',
                    }}
                    onClick={() => handleSelectTheme(option.id)}
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ background: option.accent }}
                    />
                    {option.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="window-action flex items-center justify-center w-5 h-5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              color: isPinned ? theme.accent : isActive ? theme.foreground : '#71717a',
              background: isPinned ? theme.accent + '1a' : isActive ? '#18181b' : 'transparent',
            }}
            onClick={handleTogglePin}
            onMouseDown={(e) => e.stopPropagation()}
            title={isPinned ? 'Unpin window' : 'Pin window'}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M5.3 2.5h5.4m-4.3 3.1V2.5m3.2 3.1V2.5m-4.2 0-.8 3.1 2.3 1.7v4.6m4.3-9.4.8 3.1-2.3 1.7"
                stroke="currentColor"
                strokeWidth="1.15"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {!isEditingTitle && (
            <button
              className="window-action title-edit-trigger flex items-center justify-center w-5 h-5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                color: isActive ? theme.foreground : '#71717a',
                background: isActive ? '#18181b' : 'transparent',
              }}
              onClick={handleStartTitleEditing}
              onMouseDown={(e) => e.stopPropagation()}
              title="Rename terminal"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M10.9 2.3a1.5 1.5 0 0 1 2.1 0l.7.7a1.5 1.5 0 0 1 0 2.1l-7.2 7.2L3.5 13l.7-2.9 6.7-6.8Z"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9.8 3.4 12.6 6.2"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
          <div
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: theme.accent, opacity: isActive || isUsingCustomTheme ? 1 : 0.65 }}
            title={isPinned ? 'Pinned' : theme.name}
          />
        </div>
      </div>

      {/* xterm container */}
      <div
        ref={containerRef}
        className="terminal-content flex-1 min-h-0"
        style={{ padding: '4px 2px 2px 4px' }}
        onMouseDown={focusTerminal}
      />
    </div>
  )
}
