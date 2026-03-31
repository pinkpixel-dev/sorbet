import { useEffect, useMemo, useState } from 'react'

export interface CommandPaletteItem {
  id: string
  title: string
  subtitle?: string
  group: string
  keywords?: string[]
  run: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  accentColor: string
  items: CommandPaletteItem[]
  onClose: () => void
}

export function CommandPalette({
  isOpen,
  accentColor,
  items,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return items

    return items.filter((item) => {
      const haystack = [
        item.title,
        item.subtitle,
        item.group,
        ...(item.keywords || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [items, query])

  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      setSelectedIndex(0)
      return
    }

    setSelectedIndex(0)
  }, [isOpen])

  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(filteredItems.length - 1, 0))
    }
  }, [filteredItems.length, selectedIndex])

  if (!isOpen) return null

  const activeItem = filteredItems[selectedIndex]

  return (
    <div
      className="fixed inset-0 flex items-start justify-center px-4 pt-[12vh]"
      style={{ background: 'rgba(9, 9, 11, 0.72)', zIndex: 1100 }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-3xl"
        style={{
          background: '#101014',
          border: `1px solid ${accentColor}33`,
          boxShadow: `0 30px 90px rgba(0, 0, 0, 0.45), 0 0 0 1px ${accentColor}12`,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: '#202027' }}>
          <div className="flex items-center gap-3 rounded-2xl px-3 py-3" style={{ background: '#0b0b0e' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="flex-shrink-0">
              <circle cx="7" cy="7" r="4.75" stroke="#71717a" strokeWidth="1.25" />
              <path d="M10.5 10.5 13.5 13.5" stroke="#71717a" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
            <input
              className="w-full bg-transparent text-sm outline-none"
              style={{ color: '#f4f4f5' }}
              placeholder="Search commands, workspaces, themes, and sessions"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setSelectedIndex((current) => (filteredItems.length === 0 ? 0 : (current + 1) % filteredItems.length))
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setSelectedIndex((current) =>
                    filteredItems.length === 0 ? 0 : (current - 1 + filteredItems.length) % filteredItems.length
                  )
                }
                if (event.key === 'Enter' && activeItem) {
                  event.preventDefault()
                  activeItem.run()
                  onClose()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onClose()
                }
              }}
              autoFocus
            />
            <span
              className="flex-shrink-0 rounded-lg px-2 py-1 text-[10px] uppercase tracking-[0.16em]"
              style={{ color: '#71717a', border: '1px solid #27272a' }}
            >
              Esc
            </span>
          </div>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium" style={{ color: '#f4f4f5' }}>
                No matching commands
              </p>
              <p className="mt-2 text-xs" style={{ color: '#71717a' }}>
                Try searching by action, workspace name, terminal title, or theme.
              </p>
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex
              return (
                <button
                  key={item.id}
                  className="w-full rounded-2xl px-4 py-3 text-left transition-colors"
                  style={{
                    background: isSelected ? `${accentColor}16` : 'transparent',
                    border: `1px solid ${isSelected ? `${accentColor}33` : 'transparent'}`,
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => {
                    item.run()
                    onClose()
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" style={{ color: '#f4f4f5' }}>
                        {item.title}
                      </p>
                      {item.subtitle && (
                        <p className="truncate mt-1 text-xs" style={{ color: '#71717a' }}>
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                    <span
                      className="flex-shrink-0 rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.16em]"
                      style={{
                        color: isSelected ? accentColor : '#71717a',
                        background: isSelected ? `${accentColor}12` : '#16161b',
                        border: `1px solid ${isSelected ? `${accentColor}2a` : '#27272a'}`,
                      }}
                    >
                      {item.group}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div
          className="flex items-center justify-between gap-3 px-4 py-3 border-t text-[11px]"
          style={{ borderColor: '#202027', color: '#71717a' }}
        >
          <span>Use arrow keys to navigate and Enter to run.</span>
          <span>Open with Cmd/Ctrl+K</span>
        </div>
      </div>
    </div>
  )
}
