import { spawnSync } from 'node:child_process'
import process from 'node:process'
import manifest from '../../.release-please-manifest.json' with { type: 'json' }

const version = manifest['packages/code']
const args = process.argv.slice(2)
const result = spawnSync('bunx', [`@pleaseai/code@${version}`, ...args], {
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
