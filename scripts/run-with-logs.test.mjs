import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const runner = fileURLToPath(new URL('./run-with-logs.mjs', import.meta.url))
test('logs stdout and stderr, preserves exit status, and appends across restarts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vendor-logs-'))
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = spawnSync(process.execPath, [runner, 'application', process.execPath, '-e',
        'console.log("request completed"); console.error("request failed"); process.exitCode = 7'], {
        env: { ...process.env, APPLICATION_LOG_DIR: directory }, encoding: 'utf8',
      })
      assert.equal(result.status, 7)
      assert.match(result.stdout, /request completed/)
      assert.match(result.stderr, /request failed/)
    }
    const log = readFileSync(join(directory, 'application.log'), 'utf8')
    assert.equal((log.match(/\[stdout\] request completed/g) || []).length, 2)
    assert.equal((log.match(/\[stderr\] request failed/g) || []).length, 2)
    assert.match(log, /\[\d{4}-.*Z\] \[process\] Starting/)
    assert.equal((log.match(/Stopped: 7/g) || []).length, 2)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
