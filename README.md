# mosaic-term

`mosaic-term` is a desktop terminal workspace built with Electron, React, and xterm.js. Instead of a single terminal pane or fixed tab strip, it gives you a canvas of movable terminal cards that can be opened, resized, minimized, restored, and themed to fit the way you work.

The project is designed around a simple idea: keep the flexibility of a tiling terminal UI while preserving the compatibility of a real PTY-backed shell. Each card runs an actual shell process through `node-pty`, so interactive tools like `vim`, `htop`, `btop`, `ssh`, and REPLs behave like you would expect in a native terminal.

## Highlights

- Multi-session terminal workspace with drag-and-resize cards
- Real PTY-backed shells powered by `node-pty`
- Workspace persistence for layout and selected theme
- Minimize and maximize controls for session management
- Editable terminal titles
- Built-in theme switcher with six bundled themes
- Clickable links inside terminal output
- Keyboard shortcut for quickly opening new terminals
- Electron preload bridge with context isolation enabled

## Tech Stack

- Electron for the desktop shell and privileged main process
- React for the renderer UI
- Zustand for renderer state management
- xterm.js for terminal rendering
- `node-pty` for shell process management
- `react-grid-layout` for the draggable/resizable workspace canvas
- Vite for renderer development and bundling
- TypeScript across both main and renderer processes

## How It Works

At a high level, the application is split into three parts:

1. The Electron main process creates the native window, spawns PTY-backed shell sessions, handles IPC, and persists workspace settings.
2. The preload script exposes a small, typed API on `window.mosaic` so the renderer can safely request PTY and storage operations.
3. The React renderer manages the terminal workspace, card layout, theme selection, and terminal card lifecycle.

When a new card is created, the renderer computes a layout position, adds a session to the Zustand store, and mounts a `TerminalCard`. That card initializes xterm.js, asks the main process to create a PTY, then wires terminal input/output over IPC. Layout and theme changes are saved through `electron-store`, allowing the workspace to be restored on the next launch.

## Features

### Terminal workspace

- Open multiple terminal sessions in the same window
- Drag cards to rearrange the workspace
- Resize cards using handles on the grid layout
- Minimize sessions to a dock and restore them later
- Maximize a session to focus on a single terminal
- Close a session cleanly and terminate its PTY

### Terminal behavior

- Real shell processes, not simulated command output
- xterm.js rendering with automatic fit-on-resize behavior
- Terminal title updates from shell escape sequences
- Editable session names in the card title bar
- Automatic focus management for active sessions
- Web links opened in the system browser

### Persistence and theming

- Layout is saved automatically whenever it changes
- Theme selection is saved and restored on startup
- Six built-in themes:
  - Mosaic Dark
  - Dracula
  - Nord
  - Tokyo Night
  - Catppuccin Mocha
  - Gruvbox Dark

## Requirements

- Node.js 18 or newer
- npm 9+ recommended
- Platform support depends on Electron and `node-pty`

Because `node-pty` includes native bindings, the first install may require platform-specific build tooling:

- macOS: Xcode Command Line Tools
- Windows: Visual Studio Build Tools and Python
- Linux: a standard native build toolchain for Node modules

If the native module does not build correctly during install, try:

```bash
npm rebuild node-pty
```

## Installation

```bash
npm install
```

## Development

Start the full development environment with:

```bash
npm start
```

This command launches:

- the Vite dev server for the renderer on `http://localhost:5173`
- the TypeScript compiler in watch mode for the Electron main process
- Electron after both the dev server and compiled main/preload output are ready

You can also run the pieces separately if needed:

```bash
npm run dev
```

This starts the renderer and main-process watchers only.

```bash
npm run electron
```

This waits for the renderer dev server and compiled main files, then starts Electron.

## Building

Create a production build with:

```bash
npm run build
```

That produces:

- `dist/renderer` for the bundled React UI
- `dist/main` for the compiled Electron main and preload scripts

To package the application into desktop distributables, run:

```bash
npx electron-builder
```

Note: there is currently no dedicated `package` script in `package.json`, so packaging is done directly with `electron-builder`.

## Configuration

### Shell selection

The main process resolves a shell using this order:

1. `MOSAIC_SHELL`
2. common system shell paths such as Bash or Zsh
3. the current `SHELL` environment variable
4. `/bin/sh` as a fallback

On Windows, the app defaults to `powershell.exe`.

Interactive shells like Bash, Zsh, and Fish are launched with `-i` so they behave like interactive terminal sessions.

### Persisted data

The app stores two pieces of local state through `electron-store`:

- the terminal card layout
- the selected theme ID

On startup, the renderer requests both values through the preload API. If no layout exists yet, a single terminal card is created automatically.

## Keyboard Shortcut

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+T` | Open a new terminal session |

## Project Structure

```text
mosaic-term/
├── src/
│   ├── main/
│   │   ├── main.ts              # Electron app lifecycle, PTY creation, persistence, IPC
│   │   └── preload.ts           # Safe renderer bridge exposed as window.mosaic
│   └── renderer/
│       ├── components/
│       │   ├── TerminalCard.tsx # xterm.js setup, PTY wiring, card controls
│       │   └── ThemePicker.tsx  # Theme selection dropdown
│       ├── store/
│       │   └── index.ts         # Zustand store for sessions, layout, and theme
│       ├── themes/
│       │   └── index.ts         # Built-in theme definitions
│       ├── types/
│       │   └── index.ts         # Shared renderer-side TypeScript types
│       ├── App.tsx              # Workspace shell and grid layout orchestration
│       ├── app.css              # Global renderer styles and xterm overrides
│       └── main.tsx             # React entry point
├── scripts/
│   └── start-electron.cjs       # Launch helper for Electron in development
├── dist/                        # Build output
├── index.html                   # Vite HTML entry
├── package.json                 # Scripts, dependencies, metadata
├── tsconfig.json                # Renderer TypeScript config
├── tsconfig.main.json           # Main-process TypeScript config
└── vite.config.ts               # Vite configuration
```

## Architecture Notes

### Main process

The Electron main process is responsible for:

- creating the main browser window
- loading the Vite dev server in development or built files in production
- managing PTY session lifecycle
- forwarding PTY output and exit events to the renderer
- persisting layout and theme settings
- opening terminal hyperlinks externally

All live PTY sessions are stored in an in-memory `Map`, keyed by session ID. When the window closes, every PTY is killed to avoid leaving orphaned shell processes behind.

### Preload bridge

The preload script exposes two top-level groups on `window.mosaic`:

- `pty` for session creation, input, resize, termination, and event subscriptions
- `store` for loading and saving layout/theme state

This keeps the renderer isolated from direct Node.js or Electron APIs while still allowing the UI to control terminal sessions.

### Renderer

The React renderer manages:

- visible and minimized sessions
- active and maximized session state
- grid layout data
- theme selection
- terminal card mounting/unmounting

`react-grid-layout` drives the card canvas, while Zustand acts as the local application store.

## Extending the Project

### Add a new theme

Theme definitions live in `src/renderer/themes/index.ts`. Each theme includes:

- an ID and display name
- xterm-compatible terminal colors
- a UI accent color used across the app shell

### Change the default grid behavior

Grid behavior is configured in `src/renderer/App.tsx`, including:

- `cols`
- `rowHeight`
- `margin`
- `containerPadding`
- resize handles
- default card dimensions for newly created sessions

### Add more persisted settings

To persist new preferences:

1. add handlers in `src/main/main.ts`
2. expose them in `src/main/preload.ts`
3. extend the renderer types in `src/renderer/types/index.ts`
4. consume them from the React app or Zustand store

## Current Limitations

- There are no automated tests configured yet
- Packaging is available through `electron-builder`, but there is no dedicated packaging script
- The repository currently includes built output under `dist/`
- The project metadata was updated to Apache 2.0, but dependency licenses remain independent and should be reviewed before redistribution

## Development Notes

- The renderer uses `strict` TypeScript with Vite’s bundler-style module resolution
- The main process compiles separately with `tsc -p tsconfig.main.json`
- `tailwindcss` is installed and used for utility classes, but styling is a mix of utility classes and inline styles
- Linux-specific GPU-disabling flags are applied in the main process for compatibility

## License

This project is licensed under the Apache License 2.0. See `LICENSE` for details.
