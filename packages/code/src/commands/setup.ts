/**
 * Setup command - Check and install required tools
 */

import process from 'node:process'
import chalk from 'chalk'
import { Command } from 'commander'
import { checkAllTools, checkTool, getTool, getToolIds, tools } from '../tools'

interface SetupOptions {
  check?: boolean
}

/**
 * Display tool status with colored output
 */
function displayToolStatus(
  name: string,
  installed: boolean,
  version?: string,
  path?: string,
): void {
  if (installed) {
    const versionStr = version ? ` (${version})` : ''
    const pathStr = path ? chalk.dim(` - ${path}`) : ''
    console.log(`  ${chalk.green('✓')} ${name}${versionStr}${pathStr}`)
  }
  else {
    console.log(`  ${chalk.red('✗')} ${name} ${chalk.dim('(not installed)')}`)
  }
}

/**
 * Prompt user for confirmation (simple y/n)
 */
async function confirm(message: string): Promise<boolean> {
  const stdin = process.stdin
  const stdout = process.stdout

  return new Promise((resolve) => {
    stdout.write(`${message} [Y/n] `)

    // Check if stdin is a TTY
    if (!stdin.isTTY) {
      // Non-interactive mode: default to yes
      console.log('y')
      resolve(true)
      return
    }

    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    const onData = (key: string): void => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)

      console.log(key.trim() || 'y')

      if (key.toLowerCase() === 'n') {
        resolve(false)
      }
      else {
        resolve(true)
      }
    }

    stdin.on('data', onData)
  })
}

/**
 * Run setup for all tools
 */
async function setupAll(options: SetupOptions): Promise<void> {
  console.log(chalk.bold('\nChecking tools...\n'))

  const statuses = await checkAllTools()
  const missing = statuses.filter(s => !s.installed)

  // Display status
  for (const status of statuses) {
    displayToolStatus(status.name, status.installed, status.version, status.path)
  }

  console.log()

  // Check-only mode
  if (options.check) {
    if (missing.length > 0) {
      console.log(chalk.yellow(`${missing.length} tool(s) not installed.`))
      console.log(chalk.dim('Run `npx @pleaseai/code setup` to install.\n'))
      process.exit(1)
    }
    else {
      console.log(chalk.green('All tools installed!\n'))
    }
    return
  }

  // Install missing tools
  if (missing.length === 0) {
    console.log(chalk.green('All tools ready!\n'))
    return
  }

  const names = missing.map(m => m.name).join(', ')
  const shouldInstall = await confirm(`\nInstall missing tools (${names})?`)

  if (!shouldInstall) {
    console.log(chalk.dim('\nSkipped.\n'))
    return
  }

  console.log()

  for (const status of missing) {
    const tool = getTool(status.id)
    if (!tool)
      continue

    process.stdout.write(`  Installing ${status.name}... `)

    try {
      await tool.install()
      console.log(chalk.green('done'))
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(chalk.red('failed'))
      console.log(chalk.red(`    ${message}`))
    }
  }

  console.log(chalk.green('\nSetup complete!\n'))
}

/**
 * Run setup for a specific tool
 */
async function setupTool(toolId: string, options: SetupOptions): Promise<void> {
  const tool = getTool(toolId)
  if (!tool) {
    console.log(chalk.red(`Unknown tool: ${toolId}`))
    console.log(chalk.dim(`Available tools: ${getToolIds().join(', ')}\n`))
    process.exit(1)
  }

  console.log(chalk.bold(`\nChecking ${tool.name}...\n`))

  const status = await checkTool(toolId)
  if (!status) {
    console.log(chalk.red('Failed to check tool status\n'))
    process.exit(1)
  }

  displayToolStatus(status.name, status.installed, status.version, status.path)
  console.log()

  // Check-only mode
  if (options.check) {
    if (!status.installed) {
      console.log(chalk.yellow(`${tool.name} is not installed.`))
      console.log(chalk.dim(`Run \`npx @pleaseai/code setup ${toolId}\` to install.\n`))
      process.exit(1)
    }
    return
  }

  // Already installed
  if (status.installed) {
    console.log(chalk.green(`${tool.name} is ready!\n`))
    return
  }

  // Install
  const shouldInstall = await confirm(`Install ${tool.name}?`)

  if (!shouldInstall) {
    console.log(chalk.dim('\nSkipped.\n'))
    return
  }

  process.stdout.write(`\n  Installing ${tool.name}... `)

  try {
    await tool.install()
    console.log(chalk.green('done\n'))
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(chalk.red('failed'))
    console.log(chalk.red(`  ${message}\n`))
    process.exit(1)
  }
}

/**
 * Create the setup command
 */
export function createSetupCommand(): Command {
  const command = new Command('setup')
    .description('Check and install required tools')
    .argument('[tool]', 'Specific tool to setup (optional)')
    .option('-c, --check', 'Check only, do not install')
    .action(async (toolId: string | undefined, options: SetupOptions) => {
      if (toolId) {
        await setupTool(toolId, options)
      }
      else {
        await setupAll(options)
      }
    })

  // Add list of available tools to help
  command.addHelpText('after', `
Available tools:
${tools.map(t => `  ${t.id.padEnd(15)} ${t.description}`).join('\n')}

Examples:
  $ npx @pleaseai/code setup            # Check and install all tools
  $ npx @pleaseai/code setup --check    # Check only
  $ npx @pleaseai/code setup ast-grep   # Setup specific tool
`)

  return command
}
