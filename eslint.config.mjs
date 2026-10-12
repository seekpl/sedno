import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'brand/**',
      'public/**',
      'test-results/**',
      'playwright-report/**',
      'artifacts/**',
      'next-env.d.ts',
    ],
  },
  {
    rules: {
      // Zasada 7: wygląd wyłącznie z brand/. Zakaz bibliotek UI i Tailwinda.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message: "Importuj z '@/lib/zod' (tryb bez eval zgodny z CSP).",
            },
          ],
          patterns: [
            {
              group: ['tailwindcss', 'tailwindcss/*'],
              message: 'Wygląd wyłącznie z brand/ (CLAUDE.md, zasada 7).',
            },
            {
              group: [
                '@mui/*',
                '@chakra-ui/*',
                '@radix-ui/*',
                '@headlessui/*',
                'antd',
                'antd/*',
                '@mantine/*',
              ],
              message: 'Bez bibliotek komponentów UI (CLAUDE.md, zasada 7).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['lib/zod.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];

export default config;
