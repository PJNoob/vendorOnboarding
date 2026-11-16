import { spawn } from 'node:child_process'

// Start the queue worker with the web app: verified supplier invitations send automatically.
const children = [
  spawn('pnpm', ['--filter', '@neo/builder', 'dev'], { stdio: 'inherit' }),
  spawn('pnpm', ['--filter', '@neo/builder', 'worker'], { stdio: 'inherit' }),
]
let stopping = false
function stop(signal = 'SIGTERM') {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill(signal)
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal))
for (const child of children) {
  child.on('error', (error) => { console.error(error.message); process.exitCode = 1; stop() })
  child.on('exit', (code) => {
    if (!stopping) { process.exitCode = code || 1; stop() }
  })
}
