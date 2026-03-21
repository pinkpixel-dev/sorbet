import { useCallback, useEffect, useRef, useState } from 'react'
import GridLayout, { Layout } from 'react-grid-layout'
import { TerminalCard } from './components/TerminalCard'
import { ThemePicker } from './components/ThemePicker'
import { useSorbetStore } from './store'
import { themes } from './themes'
import { LayoutItem, TerminalSession } from './types'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import './app.css'

// Generate a unique session ID
function generateId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

// Calculate a smart position for the new card
function getNewCardLayout(existingLayout: LayoutItem[], cols: number): LayoutItem {
  const id = generateId()
  if (existingLayout.length === 0) {
    return { i: id, x: 0, y: 0, w: Math.floor(cols / 2), h: 8, minW: 3, minH: 4 }
  }
  // Find the bottom of the current layout
  const maxY = Math.max(...existingLayout.map((l) => l.y + l.h))
  return { i: id, x: 0, y: maxY, w: Math.floor(cols / 2), h: 8, minW: 3, minH: 4 }
}

const COLS = 12

export default function App() {
  const isMac = window.sorbet.platform === 'darwin'
  const layoutRef = useRef<LayoutItem[]>([])
  const hasRestoredWorkspace = useRef(false)
  const [gridWidth, setGridWidth] = useState(window.innerWidth)
  const {
    sessions,
    layout,
    activeSessionId,
    maximizedSessionId,
    themeId,
    addSession,
    setActiveSession,
    updateLayout,
    setTheme,
    restoreWorkspace,
    toggleMinimizeSession,
    toggleMaximizeSession,
  } = useSorbetStore()

  const theme = themes[themeId] || themes.dark
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
        w: COLS,
        h: 20,
        minW: COLS,
        minH: 8,
      }))
    : layout.filter((item) => visibleSessions.some((session) => session.id === item.i))

  useEffect(() => {
    layoutRef.current = layout
  }, [layout])

  const spawnTerminal = useCallback(() => {
    const layoutItem = getNewCardLayout(layoutRef.current, COLS)
    const session: TerminalSession = {
      id: layoutItem.i,
      title: 'Terminal',
      isAlive: false,
      createdAt: Date.now(),
      isMinimized: false,
    }
    addSession(session, layoutItem)
  }, [addSession])

  // Load persisted layout and theme on startup
  useEffect(() => {
    if (hasRestoredWorkspace.current) return
    hasRestoredWorkspace.current = true

    let cancelled = false

    window.sorbet.store.getTheme().then((savedTheme) => {
      if (!cancelled && savedTheme) setTheme(savedTheme)
    })

    window.sorbet.store.getLayout().then((savedLayout) => {
      if (cancelled) return

      if (savedLayout && savedLayout.length > 0) {
        restoreWorkspace(savedLayout)
        return
      }

      spawnTerminal()
    })

    return () => {
      cancelled = true
    }
  }, [restoreWorkspace, setTheme, spawnTerminal])

  useEffect(() => {
    const handleResize = () => setGridWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Auto-save layout whenever it changes
  useEffect(() => {
    if (layout.length > 0) {
      window.sorbet.store.saveLayout(layout)
    }
  }, [layout])

  const handleLayoutChange = useCallback(
    (newLayout: Layout[]) => {
      if (maximizedSessionId) return
      const updated: LayoutItem[] = newLayout.map((l) => ({
        i: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        minW: 3,
        minH: 4,
      }))
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

  // Keyboard shortcut: Cmd/Ctrl+T to spawn new terminal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        spawnTerminal()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [spawnTerminal])

  return (
    <div
      className="flex flex-col w-screen h-screen overflow-hidden"
      style={{ background: '#09090b', fontFamily: 'system-ui, sans-serif' }}
    >
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

        <div className="flex-1" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

        {/* Session count */}
        {sessions.length > 0 && (
          <span className="text-xs" style={{ color: '#52525b', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
          </span>
        )}

        {/* Theme picker */}
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <ThemePicker currentThemeId={themeId} onSelect={handleThemeChange} />
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
          </div>
        ) : (
          <GridLayout
            className="layout"
            layout={gridLayout}
            cols={COLS}
            rowHeight={30}
            width={gridWidth}
            margin={[6, 6]}
            containerPadding={[8, 8]}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".drag-handle"
            draggableCancel=".window-control, .terminal-content, .terminal-dock-item"
            resizeHandles={['se', 'sw', 'ne', 'nw', 's', 'e']}
            isResizable
            isDraggable
          >
            {gridSessions.map((session) => (
              <div key={session.id} className="rounded-xl">
                <TerminalCard
                  key={session.id}
                  sessionId={session.id}
                  theme={theme}
                  isActive={activeSessionId === session.id}
                  isMaximized={maximizedSessionId === session.id}
                  onActivate={() => setActiveSession(session.id)}
                  onMinimize={() => toggleMinimizeSession(session.id)}
                  onMaximize={() => toggleMaximizeSession(session.id)}
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
                border: `1px solid ${theme.accent}33`,
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
    </div>
  )
}
