import { defineConfig } from 'vitepress'

/**
 * The documentation site.
 *
 * `base` matters on GitHub Pages: a project site is served from a
 * sub-path, so every asset and link has to be built against it. The workflow
 * passes the repository name in, and the site falls back to the root path for
 * local development and for a user or custom-domain site.
 */
export default defineConfig({
  title: 'Fiber Ledger by Kweela',
  description:
    'Wallets, balances, transfers, deposits and withdrawals on Nervos CKB, with optional fast payments over Fiber.',
  base: process.env.____DOCS_BASE ?? '/',
  lastUpdated: true,
  cleanUrls: true,

  head: [
    ['meta', { name: 'theme-color', content: '#0f766e' }],
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }],
  ],

  themeConfig: {
    logo: '/logo.png',
    nav: [
      { text: 'Intro', link: '/guide/introduction' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/configuration' },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/kweela/fiber-ledger' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@kweela/fiber-ledger' }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting started',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Asset modes', link: '/guide/asset-modes' },
          ],
        },
        {
          text: 'Wallets',
          items: [
            { text: 'Wallets and custody', link: '/guide/wallets' },
            { text: 'External wallets', link: '/guide/external-wallets' },
          ],
        },
        {
          text: 'Moving value',
          items: [
            { text: 'Transfers', link: '/guide/transfers' },
            { text: 'Fiber', link: '/guide/fiber' },
            { text: 'Deposits and withdrawals', link: '/guide/deposits-and-withdrawals' },
            { text: 'Settlement', link: '/guide/settlement' },
            { text: 'Idempotency', link: '/guide/idempotency' },
          ],
        },
        {
          text: 'Reading back',
          items: [
            { text: 'Balances', link: '/guide/balances' },
            { text: 'Transactions and history', link: '/guide/transactions' },
            { text: 'Errors', link: '/guide/errors' },
          ],
        },
        {
          text: 'Operating it',
          items: [
            { text: 'Capabilities', link: '/guide/capabilities' },
            { text: 'Health and shutdown', link: '/guide/health' },
            { text: 'Using @kweela/ledger', link: '/guide/shared-interface' },
            { text: 'Testing', link: '/guide/testing' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Configuration', link: '/reference/configuration' },
            { text: 'Operations', link: '/reference/operations' },
            { text: 'Types', link: '/reference/types' },
            { text: 'Error codes', link: '/reference/errors' },
            { text: 'What stays inside', link: '/reference/boundaries' },
          ],
        },
      ],
    },

    outline: [2, 3],
    search: { provider: 'local' },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Kweela',
    },
  },
})
