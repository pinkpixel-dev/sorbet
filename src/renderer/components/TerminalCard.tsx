import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Theme } from '../types'
import { useSorbetStore } from '../store'
import '@xterm/xterm/css/xterm.css'

interface TerminalCardProps {
  sessionId: string
  theme: Theme
  isActive: boolean
  isMaximized: boolean
  onActivate: () => void
  onMinimize: () => void
  onMaximize: () => void
}

export function TerminalCard({
  sessionId,
  theme,
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

  const focusTerminal = useCallback(() => {
    onActivate()
    terminalRef.current?.focus()
    terminalRef.current?.textarea?.focus()
    focusTerminalDom()
  }, [focusTerminalDom, onActivate])

  useEffect(() => {
    if (isInitialized.current || !containerRef.current) return
    isInitialized.current = true

    // Build xterm instance
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
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
      () => term.dispose(),
    ]

    return () => {
      cleanupRef.current.forEach((fn) => fn())
      window.sorbet.pty.kill(sessionId)
    }
  }, [focusTerminalDom, sessionId, theme, updateSession])

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

  // Fit terminal when container resizes
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(fitTerminal)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [fitTerminal])

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

  return (
    <div
      className="flex flex-col w-full h-full rounded-xl overflow-hidden"
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
        <div className="window-control flex items-center gap-2 justify-start">
          <button
            className="w-3 h-3 rounded-full flex-shrink-0 transition-opacity hover:opacity-70"
            style={{ background: '#f87171' }}
            onClick={handleClose}
            onMouseDown={(e) => e.stopPropagation()}
            title="Close"
          />
          <button
            className="w-3 h-3 rounded-full flex-shrink-0 transition-opacity hover:opacity-70"
            style={{ background: '#fbbf24' }}
            onClick={handleMinimize}
            onMouseDown={(e) => e.stopPropagation()}
            title="Minimize"
          />
          <button
            className="w-3 h-3 rounded-full flex-shrink-0 transition-opacity hover:opacity-70"
            style={{ background: '#4ade80' }}
            onClick={handleMaximize}
            onMouseDown={(e) => e.stopPropagation()}
            title={isMaximized ? 'Restore' : 'Maximize'}
          />
        </div>

        {/* Session title */}
        <div className="window-control flex items-center justify-center min-w-0">
          {isEditingTitle ? (
            <input
              className="pointer-events-auto w-full max-w-[220px] px-2 py-0.5 rounded text-xs text-center outline-none"
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
            <button
              className="pointer-events-auto max-w-[220px] truncate px-2 text-xs font-medium text-center"
              style={{ color: isActive ? theme.foreground : '#52525b' }}
              onClick={(e) => {
                e.stopPropagation()
                setDraftTitle(displayTitle)
                setIsEditingTitle(true)
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                setDraftTitle(displayTitle)
                setIsEditingTitle(true)
              }}
              onMouseDown={(e) => e.stopPropagation()}
              title="Rename terminal"
            >
              {displayTitle}
            </button>
          )}
        </div>

        {/* Active indicator */}
        <div className="flex items-center justify-end">
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
