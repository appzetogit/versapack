import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

/**
 * The `lint` script has been in package.json since the project started and has never
 * run: ESLint 9 dropped .eslintrc support and no eslint.config.js was ever added, so
 * `npm run lint` failed on startup rather than on any actual code.
 *
 * The rule set is deliberately narrow. A full recommended config on 500-odd files
 * written without a linter produces thousands of findings, which is the same as
 * producing none -- nobody reads it and it gets switched off again. What is enabled
 * here is the set that catches bugs rather than opinions:
 *
 *   - the rules of hooks, which are not style advice; breaking them produces state
 *     that silently belongs to the wrong render
 *   - undefined variables, which are typos that reach production as a blank screen
 *   - unreachable code and duplicate keys, which are always mistakes
 *
 * Formatting, import order and exhaustive-deps are left off on purpose. Tightening
 * this is worth doing later, one rule at a time, with the backlog it creates actually
 * cleared -- not all at once.
 */
export default [
    {
        ignores: ['dist/**', 'node_modules/**', 'public/**', 'scripts/**', '*.cjs'],
    },
    js.configs.recommended,
    {
        // Vite config and anything else that runs in Node, not the browser. Without
        // this `process` reads as undefined and the config lints itself as broken.
        files: ['vite.config.js', '*.config.js'],
        languageOptions: { globals: { ...globals.node } },
    },
    {
        files: ['**/*.{js,jsx}'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.es2021,
            },
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            // Off, not error. Every existing component would trip it, and a rule that
            // fires everywhere is a rule that gets disabled rather than obeyed.
            'react-hooks/exhaustive-deps': 'off',
            'react-refresh/only-export-components': 'off',

            'no-undef': 'error',
            'no-unreachable': 'error',
            'no-dupe-keys': 'error',
            // A `case` block without braces leaks its declaration into sibling cases.
            // Real, but never yet a bug here, so it is surfaced without blocking.
            'no-case-declarations': 'warn',
            'no-dupe-class-members': 'error',
            'no-const-assign': 'error',
            'no-func-assign': 'error',
            'no-obj-calls': 'error',
            'no-sparse-arrays': 'error',

            // Warnings, because the codebase has plenty and none of them break anything.
            'no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrors: 'none',
            }],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-useless-escape': 'off',
            'no-prototype-builtins': 'off',
            'no-control-regex': 'off',
        },
    },
    {
        /**
         * Known debt, quarantined so the rest of the codebase can be linted.
         *
         * These three components call a hook inside a try/catch or after an early
         * return, which makes every hook below it "conditional" -- so three
         * structural problems produce ninety-three findings. Fixing them means
         * restructuring the top of three of the largest components in the app,
         * which is a change worth making deliberately rather than as a footnote to
         * turning the linter on.
         *
         * Listed by name rather than switched off globally: the rule stays live
         * everywhere else, and this list is the todo.
         */
        files: [
            'src/modules/Food/pages/user/cart/Cart.jsx',
            'src/modules/Food/pages/user/Home.jsx',
            'src/modules/Food/components/user/BottomNavOrders.jsx',
        ],
        rules: { 'react-hooks/rules-of-hooks': 'off' },
    },
]
