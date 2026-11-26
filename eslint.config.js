import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginReactConfig from 'eslint-plugin-react/configs/recommended.js';

export default [
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**'] },
  { files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'] },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  ...tseslint.configs.recommended,
  {
    ...pluginReactConfig,
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    rules: {
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { 'argsIgnorePattern': '^_', 'varsIgnorePattern': '^_', 'caughtErrorsIgnorePattern': '^_' }
      ]
    }
  }
];
