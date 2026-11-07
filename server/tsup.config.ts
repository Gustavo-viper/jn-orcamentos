import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/scripts/migrate.ts', 'src/scripts/backup.ts', 'src/scripts/create-admin.ts', 'src/scripts/import-legacy.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  noExternal: ['@jn/shared'],
  sourcemap: true,
});
