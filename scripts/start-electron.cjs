const { spawn } = require('node:child_process')
const path = require('node:path')

const electronBinary = require('electron')
const projectRoot = path.resolve(__dirname, '..')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

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
