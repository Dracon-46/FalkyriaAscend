import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'scripts/migrate.ts', 'scripts/seed-demo.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  // Pacotes do monorepo são empacotados; dependências de terceiros ficam externas.
  noExternal: [/^@rpg\//],
  sourcemap: true,
});
