# Sorbet

<p align="center">
  <img src="./logo.png" width="300" height="300" alt="Sorbet logo" />
</p>

`Sorbet` is a desktop terminal workspace built with Electron, React, and xterm.js. Instead of a single terminal pane or fixed tab strip, it gives you a canvas of movable terminal cards that can be opened, resized, minimized, restored, pinned, themed, saved as named workspaces, started from reusable templates, and tuned to fit the way you work.

It is especially useful for running multiple CLI agents side by side in one tiling workspace. Tools like Claude Code CLI, OpenAI Codex CLI, GitHub Copilot CLI, Amazon Kiro CLI, Google Gemini CLI, OpenCode, and similar agent-driven terminal tools become much more powerful when you can keep several sessions visible at once for coding, research, debugging, review, or general help with tasks on your computer.

Sorbet now includes named saved workspaces, a workspace sidebar, reusable workspace templates, pinned terminal windows, session metadata, and a command palette as part of the `1.1.0` release line, building on the PTY-backed sessions, theming, preferences, and desktop packaging introduced in `1.0.0`.

## Highlights

- Multi-session terminal workspace with draggable, resizable terminal cards
- Real PTY-backed shells powered by `node-pty`
- Named saved workspaces with restore, rename, and delete actions
- Project-aware workspaces with optional saved project paths
- Workspace sidebar for switching between saved layouts
- Built-in and user-saved workspace templates with a gallery and one-click workspace creation
- Workspace setup for per-terminal startup directories and boot commands
- Window pinning and layout locking for terminal cards
- Per-window themes with inheritable workspace defaults and color identity
- Persistent workspace layout, workspace theme, and per-window theme overrides
- Layout restore sanitization so invalid saved tile constraints do not destabilize the workspace canvas
- Command palette for quickly running app actions, switching workspaces, changing themes, and focusing sessions
- Minimize, maximize, restore, and close controls for each terminal window
- Editable terminal titles with a hover affordance
- Seven bundled themes, including the new default `Sorbet` theme
- Custom user themes loaded from JSON files
- User-editable preferences for theme, font, font size, clipboard behavior, and more
- Clipboard support with multiline paste, middle-click paste, and configurable copy/paste hotkeys
- Native application menu with Sorbet-specific Help and Preferences entries
- Secure preload bridge with context isolation enabled
- Linux release packaging for `AppImage`, `deb`, and `rpm`
- Windows installer build automation through GitHub Actions

## Project Docs

- `README.md` for product overview, installation, and development
- `OVERVIEW.md` for architecture and implementation details
- `CHANGELOG.md` for release history
- `ROADMAP.md` for planned product direction and future features

## Tech Stack

- Electron for the desktop shell and privileged main process
- React for the renderer UI
- Zustand for renderer-side state management
- xterm.js for terminal rendering
- `node-pty` for shell process management
- `react-grid-layout` for the draggable/resizable workspace canvas
- Vite for renderer development and bundling
- TypeScript across both main and renderer processes

## Features

### Terminal workspace

- Open multiple terminal sessions in the same window
- Drag cards by the full title bar
- Resize cards with smoother, finer grid movement
- Pin cards to lock drag and resize changes
- Minimize sessions to a dock and restore them later
- Maximize a session to focus on a single terminal
- Close sessions cleanly and terminate their PTYs
- Spawn new cards horizontally to the right of the most recent card when space allows

### Workspace management

- Save the current canvas as a named workspace
- Restore the most recently selected saved workspace on launch
- Browse saved workspaces from the built-in left sidebar
- Associate a saved workspace with a project path so it feels contextual instead of generic
- Browse built-in workspace templates for common flows like full-stack work, monitoring, debugging, and writing
- Save the current canvas as a reusable custom template for later
- Keep project path and label metadata intact when saving a workspace copy
- Rename and delete custom templates without affecting the built-in starter set
- Edit project paths and startup actions from an in-app workspace setup dialog without leaving the canvas
- Configure each terminal to reopen in a saved working directory
- Configure optional startup commands such as `npm run dev` or `pnpm test`
- Reapply workspace settings cleanly without restarting the whole app
- Switch workspaces atomically so project path, theme, and live PTY state stay attached to the correct workspace during restore
- Apply workspace settings cleanly across workspace switches even when saved workspaces share terminal IDs
- Tear down the previous workspace's PTYs before restoring the next one so terminals relaunch cleanly
- Restore each workspace with fresh live terminal session IDs so saved snapshots do not share runtime process identity
- Create a fresh named workspace from a template without mutating your current canvas
- Rename and delete saved workspaces
- Preserve terminal metadata such as titles, minimized state, and pinned state inside saved workspaces
- Preserve per-window theme overrides inside saved workspaces
- Open a searchable command palette with `Cmd/Ctrl+K`

### Terminal behavior

- Real shell processes, not simulated command output
- xterm.js rendering with automatic fit-on-resize behavior
- Automatic PTY resize when cards change size
- Editable session names
- Shell-driven title updates via escape sequences
- Live session metadata for shell, working directory, activity state, and unread output
- Click-to-focus terminal behavior
- Web links opened in the system browser
- Clipboard support:
  - `Cmd/Ctrl+Shift+C` to copy selection by default
  - `Cmd/Ctrl+Shift+V` to paste by default
  - middle-click paste enabled by default
  - optional right-click paste via preferences
  - multiline paste support through xterm’s paste path

### Theming and customization

- Built-in theme switcher with these bundled themes:
  - `Sorbet`
  - `Midnight Graphite`
  - `Dracula`
  - `Nord`
  - `Tokyo Night`
  - `Catppuccin Mocha`
  - `Gruvbox Dark`
- Custom JSON themes loaded from the user theme folder
- Optional per-window theme overrides with a one-click inherit-from-workspace mode
- Color identity dots and accent strips to make parallel terminals easier to distinguish
- User-editable preferences file for:
  - default theme
  - font family
  - font size
  - line height
  - letter spacing
  - scrollback
  - clipboard shortcuts and paste behavior

## How It Works

At a high level, the application is split into three parts:

1. The Electron main process creates the native window, spawns PTY-backed shell sessions, manages menus, loads and watches user configuration files, persists workspace layouts, saved workspaces, and custom templates, and restores project-aware workspace startup behavior from the template and workspace catalog.
2. The preload script exposes a small, typed API on `window.sorbet` so the renderer can safely request PTY, clipboard, workspace-template, and storage operations.
3. The React renderer manages workspace restoration, saved-workspace switching, project setup, template browsing, template saving, terminal lifecycle, workspace and per-window theme selection, user preferences, and card interactions.

When a new card is created, the renderer computes a layout position, adds a session to the Zustand store, and mounts a `TerminalCard`. That card initializes xterm.js, asks the main process to create a PTY, wires terminal input/output over IPC, and reacts to live preference changes such as font or clipboard behavior.

The terminal lifecycle is also guarded so resize and focus work only runs while the xterm instance is still mounted in a live DOM container. Saved layout data is clamped before reuse so older snapshots cannot feed impossible size constraints back into the grid.

## Requirements

- Node.js 20 or newer
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

### From source

```bash
npm install
```

### From npm

To install Sorbet globally from npm and launch it from anywhere:

```bash
npm i -g @pinkpixel/sorbet
```

Then run:

```bash
sorbet
```

### Linux release artifacts

For `v1.1.0`, Sorbet publishes Linux desktop packages in these formats:

- `AppImage`
- `deb`
- `rpm`

The Windows installer is built separately in GitHub Actions as a `.exe` artifact.

## Development

Start the full development environment with:

```bash
npm run dev
```

You can also launch the same flow with the project launcher:

```bash
./sorbet
```

If you want the local checkout exposed on your `PATH` during development, run:

```bash
npm link
```

This launches:

- the Vite dev server for the renderer on an automatically selected high localhost port
- the TypeScript compiler in watch mode for the Electron main process
- Electron after both the dev server and compiled main/preload output are ready

Sorbet now prints the selected port at startup, for example `Using Sorbet dev port 38173`, and reuses that same value for both Vite and Electron during the session.

When the last Sorbet window closes, the app now requests a full Electron quit on every platform instead of leaving the process resident with no visible window. Sorbet also clears the PTY cwd polling timers during shutdown so `npm start` exits cleanly and the next launch is not blocked by a lingering background process. `Ctrl+C` in the terminal still tears down the full process tree so Vite, the TypeScript watcher, and Electron do not keep the dev port occupied.

You can also run the pieces separately if needed:

```bash
npm run dev:renderer
```

This starts only the renderer dev server. You can pin the port manually if needed:

```bash
SORBET_DEV_PORT=40173 npm run dev:renderer
```

```bash
npm run dev:main
```

This starts only the Electron main/preload TypeScript watcher.

```bash
npm run electron
```

This waits for the renderer dev server and compiled main files, then starts Electron using the current `SORBET_DEV_PORT` value or the default fallback port.

## Building

Create a production build with:

```bash
npm run build
```

That produces:

- `dist/renderer` for the bundled React UI
- `dist/main` for the compiled Electron main and preload scripts

To package the application into the base Electron output directories, run:

```bash
npx electron-builder
```

For Sorbet release artifacts, use the dedicated packaging scripts:

```bash
npm run dist:linux:x64
npm run dist:linux:arm64
```

These generate Linux packages in `release/` for:

- `AppImage`
- `deb`
- `rpm`

For the `arm64` release, run the command on an `arm64` Linux machine or runner so native modules such as `node-pty` rebuild for the correct target architecture.

The icon set used by the packaged app and installers is generated from `assets/icon.png` with:

```bash
npm run icons
```

Windows installers are built in GitHub Actions from `.github/workflows/windows-installer.yml` and uploaded as workflow artifacts. On release events, the workflow also uploads the generated `.exe` file to the GitHub release.

## Release Notes

`v1.1.0` expands Sorbet into a more repeatable, project-aware terminal workspace with:

- named saved workspaces with sidebar switching and management
- reusable workspace templates plus project-aware workspace setup
- per-terminal startup directories and optional boot commands for restored sessions
- window pinning, per-window themes, and richer session metadata
- a searchable command palette for workspace, theme, and session actions
- Linux packaging with desktop integration metadata and generated app icons
- Windows installer automation for release distribution

## Configuration

### Shell selection

The main process resolves a shell using this order:

1. `SORBET_SHELL`
2. common system shell paths such as Bash or Zsh
3. the current `SHELL` environment variable
4. `/bin/sh` as a fallback

On Windows, the app defaults to `powershell.exe`.

Interactive shells like Bash, Zsh, and Fish are launched with `-i` so they behave like interactive terminal sessions.

### Persisted workspace state

Sorbet stores workspace state through `electron-store`:

- the terminal card layout
- saved workspaces and the current workspace selection
- the selected workspace theme ID
- per-terminal theme overrides inside workspace snapshots

### User preferences and custom themes

Sorbet also creates user-editable JSON files under Electron’s `userData` directory:

- `preferences.json`
- `themes/*.json`

You can open these from the native menu:

- `File -> Preferences -> Edit Preferences JSON`
- `File -> Preferences -> Create New Theme`

The generated preferences file includes inline guidance, example font-family strings, recommended monospace fonts, and Nerd Fonts links. Extra helper keys that start with `_` are ignored by the app.

## Keyboard Shortcuts

| Shortcut              | Action                       |
| --------------------- | ---------------------------- |
| `Cmd/Ctrl+T`          | Open a new terminal session  |
| `Cmd/Ctrl+Shift+C`    | Copy terminal selection      |
| `Cmd/Ctrl+Shift+V`    | Paste into the active terminal |

## Project Structure

```text
sorbet/
├── src/
│   ├── main/
│   │   ├── main.ts              # Electron lifecycle, PTY creation, menus, user config, IPC
│   │   └── preload.ts           # Safe renderer bridge exposed as window.sorbet
│   └── renderer/
│       ├── components/
│       │   ├── TerminalCard.tsx # xterm.js setup, PTY wiring, clipboard, per-card theme controls
│       │   └── ThemePicker.tsx  # Theme selection dropdown
│       ├── store/
│       │   └── index.ts         # Zustand store for sessions, layout, workspace theme, and snapshots
│       ├── themes/
│       │   └── index.ts         # Built-in theme definitions and preference defaults
│       ├── types/
│       │   └── index.ts         # Renderer-side TypeScript types
│       ├── App.tsx              # Workspace shell and grid layout orchestration
│       ├── app.css              # Global renderer styles and xterm overrides
│       └── main.tsx             # React entry point
├── scripts/
│   ├── start-dev.cjs            # Dev orchestrator that selects a free port and launches all dev processes
│   ├── start-electron.cjs       # Launch helper for Electron in development
│   └── run-vite-dev.cjs         # Renderer dev launcher that honors SORBET_DEV_PORT
├── dist/                        # Build output
├── index.html                   # Vite HTML entry
├── logo.png                     # Sorbet logo
├── package.json                 # Scripts, dependencies, metadata
├── tsconfig.json                # Renderer TypeScript config
├── tsconfig.main.json           # Main-process TypeScript config
└── vite.config.mjs              # Vite configuration
```

## Architecture Notes

### Main process

The Electron main process is responsible for:

- creating the main browser window
- loading the Vite dev server in development or built files in production
- managing PTY session lifecycle
- forwarding PTY output and exit events to the renderer
- persisting workspace snapshots and theme settings
- exposing native application menus
- opening Sorbet help links externally
- creating and watching user configuration files

### Preload bridge

The preload script exposes:

- `window.sorbet.pty`
- `window.sorbet.store`
- `window.sorbet.clipboard`
- `window.sorbet.platform`

This keeps the renderer isolated from direct Node.js or Electron APIs while still allowing the UI to control terminal sessions and clipboard integration.

### Renderer

The React renderer manages:

- visible and minimized sessions
- active and maximized session state
- grid layout data
- built-in and custom workspace theme selection
- per-window theme overrides and color identity
- user preference loading
- terminal card mounting/unmounting

## Extending the Project

### Add a new built-in theme

Built-in theme definitions live in `src/renderer/themes/index.ts`. Each theme includes:

- an ID and display name
- xterm-compatible terminal colors
- a UI accent color used across the app shell

### Add a custom user theme

Use `File -> Preferences -> Create New Theme` to create a theme template in the user themes directory, then edit the JSON file. Sorbet watches that directory and automatically adds valid theme files to the picker.
