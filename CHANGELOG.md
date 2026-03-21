# Changelog

## 2026-03-21

### Initial scaffold

- Scaffolded `Sorbet` as an Electron + Vite + React + TypeScript desktop app.
- Set up a renderer built around `react-grid-layout` for draggable and resizable terminal cards.
- Added xterm.js terminal rendering with `@xterm/addon-fit` and `@xterm/addon-web-links`.
- Added PTY-backed shell sessions through `node-pty` in the Electron main process.
- Added persisted app settings with `electron-store`.
- Added built-in theme support with Sorbet Dark, Dracula, Nord, Tokyo Night, Catppuccin Mocha, and Gruvbox Dark.
- Added keyboard shortcut support for creating a new terminal with `Cmd/Ctrl+T`.
- Added initial app shell, toolbar, theme picker, terminal card component, and basic layout persistence.

### Dev environment and startup fixes

- Fixed Electron dev startup so it waits for the renderer and compiled main/preload files before launching.
- Added [scripts/start-electron.cjs](/home/sizzlebop/PINKPIXEL/PROJECTS/CURRENT/sorbet/scripts/start-electron.cjs) to launch Electron with a cleaned environment.
- Cleared `ELECTRON_RUN_AS_NODE` from the Electron launch path so Electron no longer booted as plain Node.
- Set Vite dev server `strictPort: true` so Electron and Vite stay aligned on port `5173`.
- Replaced the PostCSS config with CommonJS via [postcss.config.cjs](/home/sizzlebop/PINKPIXEL/PROJECTS/CURRENT/sorbet/postcss.config.cjs) to match the project setup and remove the module-type warning.

### Renderer stability fixes

- Fixed a renderer crash caused by using `process.platform` directly in the browser bundle.
- Exposed the current platform safely through the preload bridge as `window.sorbet.platform`.
- Fixed a hook-order crash where `spawnTerminal` was referenced before initialization.
- Removed `React.StrictMode` from the renderer entry during development because it was double-invoking terminal lifecycle effects and interfering with PTY-backed terminal initialization.

### Terminal and PTY fixes

- Hardened Linux Electron startup by disabling problematic hardware acceleration paths and steering away from the broken Vulkan path in this environment.
- Changed PTY shell resolution to prefer interactive `bash` or `zsh` before falling back, instead of defaulting to `fish` immediately.
- Ensured PTY sessions are spawned with interactive shell arguments where appropriate.
- Improved xterm focus handling so clicks activate the terminal and focus the hidden helper textarea used for keyboard input.
- Fixed terminal startup so cards now initialize with a real shell prompt and accept input correctly.

### Layout and workspace behavior

- Fixed workspace restore so saved layouts load correctly on startup.
- Fixed a layout-reset bug where resize changes could be overwritten by the restore flow.
- Tracked grid width reactively so the layout responds correctly to window-size changes.
- Improved session restore behavior so restored cards reappear consistently after app launch.

### Terminal card UX

- Made terminal card stoplight controls clickable by removing the invisible header overlay that was intercepting clicks.
- Implemented red/yellow/green card controls:
  close, minimize to a bottom dock, and maximize/restore.
- Added a minimized terminal dock at the bottom of the window.
- Added maximized-card mode so one terminal can temporarily take over the main canvas.
- Improved click-to-focus behavior for cards and terminal bodies.

### Titles and editing

- Updated card headers so they show live session titles instead of always displaying `Terminal`.
- Added inline title editing so each terminal card can be renamed by the user.
- Reworked the card header layout so the terminal title is visually centered across the card instead of being offset by the stoplight controls.

### Dev noise cleanup

- Disabled automatic DevTools opening during normal development runs.
- Reduced misleading dev-console noise from Autofill-related DevTools messages by no longer opening DevTools automatically.
- Investigated Linux GPU, ANGLE, and Vulkan startup warnings and treated them as environment noise rather than the root cause of blank terminal cards.
