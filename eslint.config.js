import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Gameplay reads the active content (getConfig / getLevels from src/content/active),
    // so a loaded pack takes effect. The static defaults are for tests and tools only.
    files: ['src/components/**', 'src/store/**', 'src/sim/**', 'src/hooks/**', 'src/App.tsx'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '../config/levels', message: 'Use getLevels() from src/content/active.' },
            { name: '../content/defaultContent', message: 'Use getContent() from src/content/active.' },
            { name: '../config/defaults', importNames: ['DEFAULT_CONFIG'], message: 'Use getConfig() from src/content/active.' },
          ],
        },
      ],
    },
  },
)
