import pleaseai from '@pleaseai/eslint-config'

export default pleaseai({
  typescript: true,
  jsx: false,
  type: 'lib',
  ignores: [
    'dist',
    '.impeccable/**',
    'npm',
    'node_modules',
    '.please/memory/**',
    'specs/**',
    'docs/**',
    'ref/**',
    'packages/lsp/test/fixtures/**',
    'packages/lsp/test/fixture/**',
    'packages/format/test/fixtures/**',
    'packages/format/test/fixture/**',
  ],
}, {
  rules: {
    'no-console': 'off',
    'style/max-statements-per-line': 'off',
  },
}, {
  files: ['**/*.md', '**/*.md/**'],
  rules: {
    'markdown/no-multiple-h1': 'off',
  },
})
