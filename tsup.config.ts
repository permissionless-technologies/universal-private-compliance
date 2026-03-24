import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/core/index.ts',
    'src/providers/index.ts',
    'src/operator/index.ts',
    'src/react/index.ts',
    'src/asp/index.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: ['viem', 'react', 'react-dom', 'wagmi', '@tanstack/react-query'],
})
