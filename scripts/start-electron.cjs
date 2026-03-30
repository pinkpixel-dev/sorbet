const { spawn } = require('node:child_process')
const path = require('node:path')
const waitOn = require('wait-on')

const electronBinary = require('electron')
const projectRoot = path.resolve(__dirname, '..')
const devPort = process.env.SORBET_DEV_PORT || '38173'
const devServerUrl = `http://localhost:${devPort}`

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
env.SORBET_DEV_PORT = devPort

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
}

void main().catch((error) => {
  console.error(`Failed waiting for ${devServerUrl}:`, error)
  process.exit(1)
})
