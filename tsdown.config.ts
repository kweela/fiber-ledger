import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/react.tsx'],
  format: 'esm',
  dts: true,
  clean: true,
  sourcemap: true,
  deps: {
    neverBundle: ['@kweela/ledger', 'react'],
  },
})
