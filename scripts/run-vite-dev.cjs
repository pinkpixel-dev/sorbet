const { spawn } = require('node:child_process')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const devPort = process.env.SORBET_DEV_PORT || '38173'
const isWindows = process.platform === 'win32'

function terminateChild(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return
  }

  try {
    if (!isWindows && typeof child.pid === 'number') {
      process.kill(-child.pid, signal)
      return
    }

    child.kill(signal)
  } catch {}
}

const child = spawn(
  isWindows ? 'npx.cmd' : 'npx',
  ['vite', '--config', 'vite.config.mjs'],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      SORBET_DEV_PORT: devPort,
    },
    stdio: 'inherit',
    detached: !isWindows,
  }
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

process.on('SIGINT', () => terminateChild(child, 'SIGINT'))
process.on('SIGTERM', () => terminateChild(child, 'SIGTERM'))
process.on('exit', () => terminateChild(child, 'SIGTERM'))
