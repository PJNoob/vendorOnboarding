import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const app = resolve('apps/builder')
const files = readdirSync(`${app}/src`, { recursive: true })
  .filter((file) => /\.test\.tsx?$/.test(file)).sort().map((file) => `${app}/src/${file}`)
if (!files.length) throw new Error('No application tests found')
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...files], { cwd: app, stdio: 'inherit' })
process.exit(result.status ?? 1)
