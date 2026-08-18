/**
 * dsh-llms-forge — generate llms.txt for DeepSeek Harness plugin repos.
 * @module dsh-llms-forge
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createRequire } from 'node:module'
import { satisfiesCaret } from './version.js'
import { forgeLlmsTxt, type ForgeResult } from './forge.js'

export const name = 'dsh-llms-forge'

export const inject = ['tools']

export const TESTED_PEER_RANGE = '^0.1.0-rc.6'

const require = createRequire(import.meta.url)

export function resolvedDshToolsVersion(): string {
  try {
    const pkg = require('@deepseek-ai/dsh-tools/package.json') as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unresolved'
  }
}

export function assertPeerCompatible(): void {
  const version = resolvedDshToolsVersion()
  if (!satisfiesCaret(version, TESTED_PEER_RANGE)) {
    throw new Error(
      `dsh-llms-forge: resolved @deepseek-ai/dsh-tools ${version}, but this plugin is tested with `
      + `${TESTED_PEER_RANGE}. Upgrade DeepSeek Harness to 0.1.0-rc.6 or later, then reinstall this plugin.`,
    )
  }
}

export interface Config {
  write?: boolean
  overwrite?: boolean
}

export const Config: Schema<Config> = Schema.object({
  write: Schema.boolean().default(false),
  overwrite: Schema.boolean().default(false),
})

export function renderResult(result: ForgeResult): string[] {
  const lines: string[] = []
  if (result.content === '') {
    lines.push(`dsh-llms-forge SKIP — ${result.path}`)
  } else {
    lines.push(`dsh-llms-forge ${result.written ? 'WRITTEN' : 'READY'} — ${result.path}`)
    lines.push('---')
    lines.push(...result.content.split('\n').filter((line, index, all) => index < 40 || line !== ''))
  }
  for (const warning of result.warnings) lines.push(`~ ${warning}`)
  return lines
}

export function apply(ctx: Context, config: Config): void {
  assertPeerCompatible()
  ctx.tools.register(defineTool({
    name: 'llms_forge',
    description:
      'Generate an llms.txt file for a dsh plugin repository from its package.json and README, '
      + 'making it AI-readable and discoverable. Returns the proposed content plus warnings; '
      + 'writes the file only when options.write is true (overwrite must be set to replace an existing file).',
    parameters: {
      dir: { type: 'string', required: true, description: 'Directory containing package.json and README.md' },
      options: {
        type: 'object',
        additionalProperties: true,
        description: 'Forge options (write/overwrite)',
        properties: {
          write: { type: 'boolean' },
          overwrite: { type: 'boolean' },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          schema: { type: 'string' },
          target: { type: 'string' },
          ok: { type: 'boolean' },
          path: { type: 'string' },
          written: { type: 'boolean' },
          warnings: { type: 'array' },
          content: { type: 'string' },
        },
      },
      render: (_args, value) => renderResult(value as ForgeResult).map((text) => ({ type: 'text' as const, text })),
    },
    async execute(args, _exec): Promise<ForgeResult> {
      return forgeLlmsTxt(args.dir, {
        write: args.options?.write ?? config.write,
        overwrite: args.options?.overwrite ?? config.overwrite,
      })
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `Forge llms.txt: ${args.dir}`,
      kind: 'other',
      rawInput: args,
    }),
  }))
}