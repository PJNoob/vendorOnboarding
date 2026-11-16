import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { constants } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const [name, command, ...args] = process.argv.slice(2)
if (!name || !/^[a-z-]+$/.test(name) || !command) {
  throw new Error('Usage: node run-with-logs.mjs <log-name> <command> [args...]')
}
const directory = process.env.APPLICATION_LOG_DIR || fileURLToPath(new URL('../logs/', import.meta.url))
mkdirSync(directory, { recursive: true })
const path = resolve(directory, `${name}.log`)
const file = openSync(path, 'a', 0o600)
const record = (stream, data) => {
  writeSync(file, `[${new Date().toISOString()}] [${stream}] ${data}`)
}
record('process', `Starting ${command} ${args.join(' ')}\n`)
console.log(`Writing logs to ${path}`)
const child = spawn(command, args, {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
})
child.stdout.on('data', (data) => { record('stdout', data); process.stdout.write(data) })
child.stderr.on('data', (data) => { record('stderr', data); process.stderr.write(data) })
child.on('error', (error) => {
  record('error', `${error.message}\n`)
  console.error(error.message)
})
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => { child.kill(signal) })
}
child.on('close', (code, signal) => {
  record('process', `Stopped: ${signal || code}\n`)
  closeSync(file)
  process.exitCode = code ?? (signal ? 128 + constants.signals[signal] : 1)
})
