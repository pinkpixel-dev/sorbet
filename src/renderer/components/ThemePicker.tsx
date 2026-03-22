import { useState, useRef, useEffect } from 'react'
import { Theme } from '../types'

interface ThemePickerProps {
  currentThemeId: string
  themes: Theme[]
  onSelect: (themeId: string) => void
}

export function ThemePicker({ currentThemeId, themes, onSelect }: ThemePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const currentTheme = themes.find((theme) => theme.id === currentThemeId) || themes[0]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
        style={{
          background: '#18181b',
          border: '1px solid #3f3f46',
          color: '#a1a1aa',
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: currentTheme.accent }}
        />
        {currentTheme.name}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 rounded-xl overflow-hidden py-1"
          style={{
            background: '#18181b',
            border: '1px solid #27272a',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            minWidth: '160px',
          }}
        >
          {themes.map((theme: Theme) => (
            <button
              key={theme.id}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-left transition-colors"
              style={{
                color: theme.id === currentThemeId ? '#f4f4f5' : '#a1a1aa',
                background: theme.id === currentThemeId ? '#27272a' : 'transparent',
              }}
              onMouseEnter={(e) => { if (theme.id !== currentThemeId) (e.currentTarget as HTMLElement).style.background = '#1f1f23' }}
              onMouseLeave={(e) => { if (theme.id !== currentThemeId) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              onClick={() => {
                onSelect(theme.id)
                setOpen(false)
              }}
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ background: theme.accent }}
              />
              {theme.name}
              {theme.id === currentThemeId && (
                <svg className="ml-auto" width="10" height="10" viewBox="0 0 10 10" fill={theme.accent}>
                  <path d="M1.5 5L4 7.5L8.5 3" stroke={theme.accent} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
