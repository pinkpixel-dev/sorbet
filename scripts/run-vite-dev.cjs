const { spawn } = require('node:child_process')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const devPort = process.env.SORBET_DEV_PORT || '38173'

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', '--config', 'vite.config.mjs'],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      SORBET_DEV_PORT: devPort,
    },
    stdio: 'inherit',
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
