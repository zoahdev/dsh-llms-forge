#!/usr/bin/env node
/**
 * Packaged integration + real runtime invocation smoke test.
 * Installs the packed tarball, loads the bundle, registers llms_forge,
 * executes it against a fixture, and asserts the render path.
 */

import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tgz = path.resolve(process.argv[2] ?? path.join(root, 'dsh-llms-forge-0.1.0.tgz'))

if (!existsSync(tgz)) {
  console.error(`[integration] missing tarball: ${tgz}`)
  process.exit(1)
}

function runPnpm(args, cwd) {
  if (process.platform === 'win32') {
    return spawnSync(`pnpm ${args.join(' ')}`, { cwd, stdio: 'inherit', shell: true })
  }
  return spawnSync('pnpm', args, { cwd, stdio: 'inherit' })
}

function makeFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-llms-forge-target-'))
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'fixture-target', version: '1.0.0', description: 'Fixture for integration.', license: 'MIT',
  }, null, 2))
  writeFileSync(path.join(dir, 'README.md'), '# fixture-target\n\nBody.')
  return dir
}

async function scenario(name, dshToolsVersion, expectGuard) {
  const dir = mkdtempSync(path.join(tmpdir(), `dsh-llms-forge-${name}-`))
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'dsh-llms-forge-integration-host', private: true, version: '1.0.0',
    dependencies: {
      '@deepseek-ai/cordis': '^4.0.1',
      '@deepseek-ai/dsh-tools': dshToolsVersion,
      '@deepseek-ai/schemastery': '^3.18.1',
      'dsh-llms-forge': `file:${tgz.replaceAll('\\', '/')}`,
    },
  }, null, 2))

  console.log(`[integration:${name}] installing packed tarball (dsh-tools ${dshToolsVersion})...`)
  const install = runPnpm(['install'], dir)
  if (install.status !== 0) { console.error(`[integration:${name}] pnpm install failed`); process.exit(1) }

  const pluginIndex = path.join(dir, 'node_modules', 'dsh-llms-forge', 'lib', 'index.js')
  if (!existsSync(pluginIndex)) throw new Error('packed plugin entry lib/index.js missing after install')

  const plugin = await import(pathToFileURL(pluginIndex).href)
  if (plugin.name !== 'dsh-llms-forge') throw new Error(`unexpected plugin name: ${plugin.name}`)

  const registered = []
  const ctx = { tools: { register: (definition) => { registered.push(definition); return () => {} } } }

  if (expectGuard) {
    let threw = false
    try { plugin.apply(ctx, { write: false, overwrite: false }) } catch (error) {
      threw = true
      if (!String(error instanceof Error ? error.message : error).includes('tested with ^0.1.0-rc.6')) {
        throw new Error(`guard threw an unexpected error: ${String(error)}`)
      }
    }
    if (!threw) throw new Error('runtime guard did not reject the incompatible dsh-tools version')
    console.log(`PASS [${name}] runtime guard rejected @deepseek-ai/dsh-tools ${dshToolsVersion}`)
    rmSync(dir, { recursive: true, force: true })
    return
  }

  plugin.apply(ctx, { write: true, overwrite: true })
  const tool = registered.find((definition) => definition.name === 'llms_forge')
  if (tool === undefined) throw new Error('llms_forge tool was not registered')

  const fixture = makeFixture()
  try {
    const result = await tool.execute({ dir: fixture, options: { write: true, overwrite: true } }, { signal: new AbortController().signal })
    if (result?.schema !== 'dsh-llms-forge/v1') throw new Error(`unexpected canonical result: ${JSON.stringify(result)}`)
    if (result.written !== true) throw new Error('fixture llms.txt was not written')
    if (!result.content.includes('Fixture for integration.')) throw new Error('content missing description')

    const blocks = tool.output.render({ dir: fixture }, result)
    const text = blocks.map((block) => block.text ?? '').join('\n')
    if (!text.includes('WRITTEN')) throw new Error(`render output missing WRITTEN marker: ${JSON.stringify(text)}`)

    console.log(`PASS [${name}] packed artifact loaded, llms_forge registered, handler executed, render asserted`)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
    rmSync(dir, { recursive: true, force: true })
  }
}

await scenario('happy', '0.1.0-rc.6', false)
await scenario('guard', '0.1.0-rc.3', true)