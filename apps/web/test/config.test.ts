import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { gitlabCredentials, gitlabDiagnostics, loadEnvFiles, parseEnvFile } from '~/server/config'

describe('parseEnvFile', () => {
  it('reads quoted values, ignores comments and keeps tokens intact', () => {
    expect(
      parseEnvFile(
        [
          '# comentário',
          '',
          'HORIZON_GITLAB_URL=https://gitlab.example.com # inline',
          'export HORIZON_GITLAB_TOKEN="glpat-abc#123"',
          'INVALIDO',
        ].join('\n'),
      ),
    ).toEqual({
      HORIZON_GITLAB_URL: 'https://gitlab.example.com',
      HORIZON_GITLAB_TOKEN: 'glpat-abc#123',
    })
  })
})

describe('loadEnvFiles', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'horizon-env-'))
    delete process.env.HORIZON_TEST_FROM_FILE
    process.env.HORIZON_TEST_FROM_ENV = 'do ambiente'
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
    delete process.env.HORIZON_TEST_FROM_FILE
    delete process.env.HORIZON_TEST_FROM_ENV
  })

  it('fills only what the environment does not already define', async () => {
    await writeFile(
      join(directory, '.env.local'),
      'HORIZON_TEST_FROM_FILE=do arquivo\nHORIZON_TEST_FROM_ENV=ignorado\n',
    )

    loadEnvFiles(directory)

    expect(process.env.HORIZON_TEST_FROM_FILE).toBe('do arquivo')
    expect(process.env.HORIZON_TEST_FROM_ENV).toBe('do ambiente')
  })
})

describe('gitlabDiagnostics', () => {
  const previous = { ...process.env }

  afterEach(() => {
    process.env = { ...previous }
  })

  it('names the variables the deployment still has to provide', () => {
    delete process.env.HORIZON_GITLAB_URL
    delete process.env.HORIZON_GITLAB_TOKEN

    expect(gitlabDiagnostics()).toMatchObject({
      configured: false,
      missing: ['HORIZON_GITLAB_URL', 'HORIZON_GITLAB_TOKEN'],
    })
    expect(gitlabCredentials()).toBeUndefined()
  })

  it('rejects a URL that is not HTTP', () => {
    process.env.HORIZON_GITLAB_URL = 'gitlab.example.com'
    process.env.HORIZON_GITLAB_TOKEN = 'glpat-x'

    expect(gitlabDiagnostics().configured).toBe(false)
    expect(gitlabDiagnostics().invalidUrl).toContain('HORIZON_GITLAB_URL')
  })

  it('accepts a complete environment', () => {
    process.env.HORIZON_GITLAB_URL = 'https://gitlab.example.com'
    process.env.HORIZON_GITLAB_TOKEN = 'glpat-x'

    expect(gitlabDiagnostics()).toMatchObject({ configured: true, host: 'gitlab.example.com' })
    expect(gitlabCredentials()).toEqual({
      url: 'https://gitlab.example.com',
      token: 'glpat-x',
    })
  })
})
