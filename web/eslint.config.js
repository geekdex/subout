import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import configPrettier from 'eslint-config-prettier';

export default [
  // 1. Language Options & Globals
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
    },
  },

  // 2. Vue 3 Recommended Flat Configurations
  ...pluginVue.configs['flat/recommended'],

  // 3. Prettier configuration to disable formatting conflicts
  configPrettier,

  // 4. Custom project rules
  {
    files: ['**/*.js', '**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off', // Allow single-word components like App.vue or Dashboard.vue
      'no-unused-vars': 'warn',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    },
  },
];
