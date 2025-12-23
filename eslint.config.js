import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  jsx: false,
  type: 'lib',
  ignores: [
    'dist',
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
  },
})
