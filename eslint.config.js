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
    'packages/**/test/fixtures/**',
  ],
}, {
  rules: {
    'no-console': 'off',
  },
})
