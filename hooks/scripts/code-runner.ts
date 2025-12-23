import { spawnSync } from 'node:child_process'
import process from 'node:process'
import manifest from '../../.release-please-manifest.json' with { type: 'json' }

const version = manifest['packages/code']
if (!version) {
  console.error(
    'Error: Could not find version for \'packages/code\' in .release-please-manifest.json',
  )
  process.exit(1)
}

const args = process.argv.slice(2)
const result = spawnSync('bunx', [`@pleaseai/code@${version}`, ...args], {
  stdio: 'inherit',
})

if (result.error) {
  console.error('Error: Failed to spawn bunx command.', result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
