import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'
import { LuaLsServer } from '../../src/server/lua'
import { TerraformServer } from '../../src/server/terraform'
import { TexlabServer } from '../../src/server/texlab'
import { AUTO_INSTALL_ENV, isAutoInstallEnabled } from '../../src/server/utils'

describe('isAutoInstallEnabled', () => {
  test('defaults to enabled when unset, true, or an unsubstituted placeholder', () => {
    expect(isAutoInstallEnabled({})).toBe(true)
    expect(isAutoInstallEnabled({ [AUTO_INSTALL_ENV]: 'true' })).toBe(true)
    // eslint-disable-next-line no-template-curly-in-string
    expect(isAutoInstallEnabled({ [AUTO_INSTALL_ENV]: '${user_config.auto_install}' })).toBe(true)
  })

  test.each(['false', 'FALSE', ' off ', '0', 'no'])('is disabled for %j', (value) => {
    expect(isAutoInstallEnabled({ [AUTO_INSTALL_ENV]: value })).toBe(false)
  })
})

describe('spawn with a stubbed network (auto-install off unless a test turns it on)', () => {
  const saved = {
    path: process.env.PATH,
    flag: process.env[AUTO_INSTALL_ENV],
    fetch: globalThis.fetch,
  }
  let tmp: string
  let fetchCalls: string[]
  let homedirSpy: ReturnType<typeof spyOn>

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-install-'))
    await fs.mkdir(path.join(tmp, 'emptybin'))
    homedirSpy = spyOn(os, 'homedir').mockReturnValue(tmp)
    process.env.PATH = path.join(tmp, 'emptybin')
    process.env[AUTO_INSTALL_ENV] = 'false'
    fetchCalls = []
    globalThis.fetch = (async (input: unknown) => {
      fetchCalls.push(String(input))
      throw new Error('network access is not allowed in this test')
    }) as unknown as typeof fetch
  })

  afterEach(async () => {
    const restore = (key: string, value: string | undefined): void => {
      if (value === undefined) {
        delete process.env[key]
      }
      else {
        process.env[key] = value
      }
    }
    homedirSpy.mockRestore()
    restore('PATH', saved.path)
    restore(AUTO_INSTALL_ENV, saved.flag)
    globalThis.fetch = saved.fetch
    await fs.rm(tmp, { recursive: true, force: true })
  })

  test.each([
    ['texlab', TexlabServer],
    ['terraform', TerraformServer],
  ])('%s returns undefined without downloading', async (_name, server) => {
    expect(os.homedir()).toBe(tmp)
    expect(await server.spawn(tmp)).toBeUndefined()
    expect(fetchCalls).toEqual([])
  })

  test.skipIf(process.platform === 'win32')('texlab still runs a binary already in the cache', async () => {
    const cacheDir = path.join(tmp, '.cache', 'dora', 'texlab-lsp')
    await fs.mkdir(cacheDir, { recursive: true })
    const bin = path.join(cacheDir, 'texlab')
    await fs.writeFile(bin, '#!/bin/sh\nexit 0\n', { mode: 0o755 })

    const handle = await TexlabServer.spawn(tmp)

    expect(handle).toBeDefined()
    expect(fetchCalls).toEqual([])
    handle?.process.kill()
  })

  test.skipIf(process.platform === 'win32')('lua-ls still runs a binary from an earlier download', async () => {
    const binDir = path.join(tmp, '.cache', 'dora', 'lua-lsp', `lua-language-server-${process.arch}-${process.platform}`, 'bin')
    await fs.mkdir(binDir, { recursive: true })
    await fs.writeFile(path.join(binDir, 'lua-language-server'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })

    const handle = await LuaLsServer.spawn(tmp)

    expect(handle).toBeDefined()
    expect(fetchCalls).toEqual([])
    handle?.process.kill()
  })

  test.skipIf(process.platform === 'win32')('lua-ls download replaces a broken leftover and cleans up staging', async () => {
    process.env[AUTO_INSTALL_ENV] = 'true'
    const resourcesDir = path.join(tmp, '.cache', 'dora', 'lua-lsp')
    const installDir = path.join(resourcesDir, `lua-language-server-${process.arch}-${process.platform}`)
    await fs.mkdir(path.join(installDir, 'script'), { recursive: true })

    const src = path.join(tmp, 'archive-src')
    await fs.mkdir(path.join(src, 'bin'), { recursive: true })
    await fs.writeFile(path.join(src, 'bin', 'lua-language-server'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    const archive = path.join(tmp, 'lua.tar.gz')
    expect(Bun.spawnSync(['tar', '-czf', archive, '-C', src, '.']).exitCode).toBe(0)
    const assetName = `lua-language-server-9.9.9-${process.platform}-${process.arch}.tar.gz`
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input)
      fetchCalls.push(url)
      if (url.includes('/releases/latest')) {
        return Response.json({ tag_name: 'v9.9.9', assets: [{ name: assetName, browser_download_url: 'https://example.test/lua.tar.gz' }] })
      }
      return new Response(await fs.readFile(archive))
    }) as unknown as typeof fetch

    const handle = await LuaLsServer.spawn(tmp)

    expect(handle).toBeDefined()
    expect(fetchCalls).toHaveLength(2)
    await fs.access(path.join(installDir, 'bin', 'lua-language-server'))
    expect((await fs.readdir(resourcesDir)).filter(name => name.includes('.partial-'))).toEqual([])
    handle?.process.kill()
  })
})
