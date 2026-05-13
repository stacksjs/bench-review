import type { CLI, SeedOptions } from '@stacksjs/types'
import { existsSync, readdirSync } from 'node:fs'
import process from 'node:process'
import { runAction } from '@stacksjs/actions'
import { intro, log, onUnknownSubcommand, outro } from '@stacksjs/cli'
import { Action } from '@stacksjs/enums'
import { appPath, frameworkPath, projectPath } from '@stacksjs/path'
import { ExitCode } from '@stacksjs/types'

/**
 * Count model files in a directory (recursively)
 */
function countModelFiles(dir: string): number {
  if (!existsSync(dir)) {
    return 0
  }

  let count = 0
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countModelFiles(`${dir}/${entry.name}`)
    }
    else if (entry.name.endsWith('.ts') && !entry.name.startsWith('.') && !entry.name.startsWith('index')) {
      count++
    }
  }

  return count
}

/**
 * Check if models exist in either user directory or defaults directory
 */
function validateModelsExist(): { valid: boolean, error?: string } {
  const userModelsPath = appPath('Models')
  const defaultModelsPath = frameworkPath('defaults/app/Models')

  const userModelCount = countModelFiles(userModelsPath)
  const defaultModelCount = countModelFiles(defaultModelsPath)

  if (userModelCount === 0 && defaultModelCount === 0) {
    return {
      valid: false,
      error: 'No models found. Please create models in app/Models or ensure framework defaults exist.',
    }
  }

  return { valid: true }
}

/**
 * Register `./buddy seed` and `./buddy factory`.
 *
 * The split keeps fixture data (real records the app needs in every
 * environment — known judges, lookup tables, demo accounts) separate
 * from synthetic data (per-model factories that generate random rows
 * for development / load testing).
 *
 *   ./buddy seed       — runs class seeders from database/seeders/.
 *                        Fixed, intentional data. Idempotent if the
 *                        seeder is written that way.
 *
 *   ./buddy factory    — runs the model auto-seeder (every model's
 *                        `useSeeder.count` factory). Random faker
 *                        data. Convenient for filling a dev DB.
 *
 * Both flows still write through the same ORM layer, so model events,
 * timestamps, and validation apply consistently. The split is purely
 * "which inputs feed the inserts".
 */
export function seed(buddy: CLI): void {
  const descriptions = {
    seed: 'Run fixed-data class seeders from database/seeders/',
    factory: 'Run model factories (random/faker-generated data) for every model with useSeeder',
    project: 'Target a specific project',
    verbose: 'Enable verbose output',
  }

  // ── ./buddy seed ── runs class seeders only ──────────────────────
  //
  // A seeder is any `.ts` file under `database/seeders/` exporting a
  // default class with `async run()`. See `@stacksjs/database`'s
  // `Seeder` base class for the contract. The framework already ships
  // `runClassSeeders` for discovery + execution; this command is a
  // thin wrapper around that.
  buddy
    .command('seed', descriptions.seed)
    .alias('db:seed')
    .option('-c, --class [class]', 'Run a specific seeder class from database/seeders/', { default: '' })
    .option('-p, --project [project]', descriptions.project, { default: false })
    .option('--verbose', descriptions.verbose, { default: false })
    .action(async (options: { class?: string, verbose?: boolean, project?: string | boolean }) => {
      log.debug('Running `buddy seed` ...', options)
      const perf = await intro('buddy seed')

      const seedersDir = projectPath('database/seeders')
      if (!existsSync(seedersDir)) {
        log.warn(`No seeders directory at ${seedersDir}.`)
        log.info('Create one and add classes that extend `Seeder` from `@stacksjs/database`.')
        log.info('For random factory data instead, run `./buddy factory`.')
        await outro('No seeders to run', { startTime: perf, useSeconds: true })
        process.exit(ExitCode.Success)
      }

      const { runClassSeeders } = await import('@stacksjs/database')
      const result = await runClassSeeders(options.class ? { class: options.class } : {})

      if (result.ran.length === 0) {
        if (options.class)
          log.warn(`No seeder named "${options.class}" was found under database/seeders/.`)
        else
          log.warn('No class seeders found under database/seeders/.')
      }
      else {
        log.success(`Ran ${result.ran.length} seeder(s): ${result.ran.join(', ')}`)
      }
      if (result.skipped.length > 0)
        log.info(`Skipped: ${result.skipped.join(', ')}`)

      const APP_ENV = process.env.APP_ENV || 'local'
      await outro(`Seeded your ${APP_ENV} database with fixed data.`, {
        startTime: perf,
        useSeconds: true,
      })
      process.exit(result.ran.length > 0 || options.class === '' ? ExitCode.Success : ExitCode.FatalError)
    })

  // ── ./buddy factory ── runs model factories ──────────────────────
  //
  // This is the old `./buddy seed` behavior — walks every model with a
  // `useSeeder` trait and inserts `count` faker-generated rows. Useful
  // for dev databases where realistic random data is more valuable than
  // intentional fixtures.
  buddy
    .command('factory', descriptions.factory)
    .alias('db:factory')
    .option('-p, --project [project]', descriptions.project, { default: false })
    .option('--verbose', descriptions.verbose, { default: false })
    .action(async (options: SeedOptions) => {
      log.debug('Running `buddy factory` ...', options)
      const perf = await intro('buddy factory')

      const validation = validateModelsExist()
      if (!validation.valid) {
        console.error(`\n❌ Error: ${validation.error!}\n`)
        process.exit(ExitCode.FatalError)
      }

      const result = await runAction(Action.Seed, options)
      if (result.isErr) {
        await outro(
          'While running the factory command, there was an issue',
          { startTime: perf, useSeconds: true },
          result.error,
        )
        process.exit(ExitCode.FatalError)
      }

      const APP_ENV = process.env.APP_ENV || 'local'
      await outro(`Filled your ${APP_ENV} database with factory data.`, {
        startTime: perf,
        useSeconds: true,
      })
      process.exit(ExitCode.Success)
    })

  onUnknownSubcommand(buddy, 'seed')
}
