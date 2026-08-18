/**
 * CLI entry for dsh-llms-forge.
 *   dsh-llms-forge [dir] [--write] [--overwrite] [--json]
 * Exit: 0 ok, 1 warnings, 2 usage/IO error.
 */

import { forgeLlmsTxt } from './forge.js'

interface Options {
  dir: string
  write: boolean
  overwrite: boolean
  json: boolean
}

function usage(): string {
  return [
    'dsh-llms-forge — generate llms.txt for a dsh plugin repository',
    '',
    'Usage:',
    '  dsh-llms-forge [dir] [--write] [--overwrite] [--json]',
    '',
    'Options:',
    '  --write        write llms.txt to disk',
    '  --overwrite    replace an existing llms.txt (only with --write)',
    '  --json         print the machine-readable result',
    '  --help         show this help',
  ].join('\n')
}

function parseArgs(argv: string[]): Options | { help: true } | { error: string } {
  const options: Options = { dir: '.', write: false, overwrite: false, json: false }
  let positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--help': case '-h': return { help: true }
      case '--write': options.write = true; break
      case '--overwrite': options.overwrite = true; break
      case '--json': options.json = true; break
      default:
        if (arg.startsWith('-')) return { error: `unknown option: ${arg}` }
        positional.push(arg)
    }
  }
  if (positional.length > 1) return { error: 'expected at most one directory' }
  if (positional.length === 1) options.dir = positional[0]
  return options
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv)
  if ('help' in parsed) { process.stdout.write(usage() + '\n'); return 0 }
  if ('error' in parsed) { process.stderr.write(parsed.error + '\n\n' + usage() + '\n'); return 2 }
  try {
    const result = await forgeLlmsTxt(parsed.dir, { write: parsed.write, overwrite: parsed.overwrite })
    if (parsed.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    } else if (result.content === '') {
      process.stdout.write(`dsh-llms-forge SKIP — ${result.path} (${result.warnings.join('; ')})\n`)
    } else {
      process.stdout.write(result.content)
      if (result.written) process.stdout.write(`\n# written: ${result.path}\n`)
      for (const warning of result.warnings) process.stderr.write(`~ ${warning}\n`)
    }
    return result.ok ? 0 : 1
  } catch (error) {
    process.stderr.write(`dsh-llms-forge: ${String(error instanceof Error ? error.message : error)}\n`)
    return 2
  }
}