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
  preferences: TerminalPreferences
  isActive: boolean
  isMaximized: boolean
  onActivate: () => void
  onMinimize: () => void
  onMaximize: () => void
}

export function TerminalCard({
  sessionId,
  theme,
  preferences,
  isActive,
  isMaximized,
  onActivate,
  onMinimize,
  onMaximize,
}: TerminalCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const cleanupRef = useRef<(() => void)[]>([])
  const isInitialized = useRef(false)
  const resizeFrameRef = useRef<number | null>(null)
  const resizeTimeoutRef = useRef<number | null>(null)

  const { updateSession, removeSession, sessions } = useSorbetStore()
  const session = sessions.find((item) => item.id === sessionId)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const displayTitle = useMemo(() => session?.title || 'Terminal', [session?.title])

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
          updateSession(sessionId, { pid: result.pid, isAlive: true })
        } else {
          term.write(`\r\n\x1b[31mFailed to start shell: ${result.error}\x1b[0m\r\n`)
        }
      })
    })

    // Wire PTY output → xterm
    const removeDataListener = window.sorbet.pty.onData(sessionId, (data) => {
      term.write(data)
    })

    // Wire PTY exit
    const removeExitListener = window.sorbet.pty.onExit(sessionId, () => {
      updateSession(sessionId, { isAlive: false })
      term.write('\r\n\x1b[90m[Process exited]\x1b[0m\r\n')
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
      () => dataDisposable.dispose(),
      () => titleDisposable.dispose(),
      () => {
        if (resizeFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeFrameRef.current)
        }
        if (resizeTimeoutRef.current !== null) {
          window.clearTimeout(resizeTimeoutRef.current)
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
      const isModifierPressed = window.sorbet.platform === 'darwin' ? event.metaKey : event.ctrlKey
      if (!preferences.enableClipboardShortcuts || !isModifierPressed || !event.shiftKey) {
        return true
      }

      const key = event.key.toLowerCase()

      if (key === 'c') {
        if (terminalRef.current?.hasSelection()) {
          void copySelectionToClipboard()
          return false
        }
        return true
      }

      if (key === 'v') {
        void pasteFromClipboard()
        return false
      }

      return true
    })
  }, [copySelectionToClipboard, pasteFromClipboard, preferences.enableClipboardShortcuts])

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

  // Focus terminal when activated
  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus()
      terminalRef.current.textarea?.focus()
      focusTerminalDom()
    }
  }, [focusTerminalDom, isActive])

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(displayTitle)
    }
  }, [displayTitle, isEditingTitle])

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
      {/* Title bar */}
      <div
        className="drag-handle grid items-center px-3 flex-shrink-0 select-none cursor-default"
        style={{
          height: '32px',
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
        <div className="flex items-center justify-center min-w-0">
          {isEditingTitle ? (
            <input
              className="title-editor pointer-events-auto w-full max-w-[220px] px-2 py-0.5 rounded text-xs text-center outline-none"
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
              className="max-w-[220px] truncate px-2 text-xs font-medium text-center"
              style={{ color: isActive ? theme.foreground : '#52525b' }}
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

        {/* Active indicator */}
        <div className="flex items-center justify-end gap-2">
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
          {isActive && (
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: theme.accent }}
            />
          )}
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
