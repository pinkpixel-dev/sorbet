const { spawn } = require('node:child_process')
const net = require('node:net')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const isWindows = process.platform === 'win32'
const npmCommand = isWindows ? 'npm.cmd' : 'npm'

function findAvailablePort(preferredPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()

    server.unref()

    server.on('error', (error) => {
      if (error && error.code === 'EADDRINUSE' && preferredPort !== 0) {
        resolve(findAvailablePort(0))
        return
      }

      reject(error)
    })

    server.listen(preferredPort, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : preferredPort
      server.close((closeError) => {
        if (closeError) {
          reject(closeError)
          return
        }

        resolve(port)
      })
    })
  })
}

function spawnChild(label, script, env) {
  const child = spawn(npmCommand, ['run', script], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  })

  child.on('error', (error) => {
    console.error(`[${label}] failed to start:`, error)
  })

  return child
}

async function main() {
  const preferredPort = Number(process.env.SORBET_DEV_PORT || '38173')
  const selectedPort = await findAvailablePort(preferredPort)
  const env = {
    ...process.env,
    SORBET_DEV_PORT: String(selectedPort),
  }

  console.log(`Using Sorbet dev port ${selectedPort}`)

  const children = [
    spawnChild('renderer', 'dev:renderer', env),
    spawnChild('main', 'dev:main', env),
    spawnChild('electron', 'electron', env),
  ]

  let shuttingDown = false

  function shutdown(signal) {
    if (shuttingDown) return
    shuttingDown = true

    for (const child of children) {
      if (!child.killed) {
        try {
          child.kill(signal)
        } catch {}
      }
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  for (const child of children) {
    child.on('exit', (code, signal) => {
      if (shuttingDown) return

      if (signal) {
        console.log(`A dev process exited due to signal ${signal}`)
        shutdown('SIGTERM')
        process.exit(1)
        return
      }

      if (code && code !== 0) {
        console.error(`A dev process exited with code ${code}`)
        shutdown('SIGTERM')
        process.exit(code)
      }
    })
  }
}

void main().catch((error) => {
  console.error('Failed to start Sorbet dev environment:', error)
  process.exit(1)
})
