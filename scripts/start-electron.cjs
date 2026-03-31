const { spawn } = require('node:child_process')
const path = require('node:path')
const waitOn = require('wait-on')

const electronBinary = require('electron')
const projectRoot = path.resolve(__dirname, '..')
const devPort = process.env.SORBET_DEV_PORT || '38173'
const devServerUrl = `http://localhost:${devPort}`
const isWindows = process.platform === 'win32'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
env.SORBET_DEV_PORT = devPort

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

async function main() {
  await waitOn({
    resources: [
      devServerUrl,
      path.join(projectRoot, 'dist/main/main.js'),
      path.join(projectRoot, 'dist/main/preload.js'),
    ],
  })

  const child = spawn(electronBinary, ['.'], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
    detached: !isWindows,
  })

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
}

void main().catch((error) => {
  console.error(`Failed waiting for ${devServerUrl}:`, error)
  process.exit(1)
})
