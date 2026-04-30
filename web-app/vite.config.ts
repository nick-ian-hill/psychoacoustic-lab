import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const isLibrary = mode === 'library';

  return {
    base: './',
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: isLibrary ? {
        entry: resolve(__dirname, 'src/entry-component.ts'),
        name: 'PsychoacousticRunner',
        fileName: 'psychoacoustic-runner',
        formats: ['es', 'umd']
      } : undefined,
      rollupOptions: {
        // In app mode, we use the standard index.html
        // In lib mode, we only care about the entry-component
        input: isLibrary ? undefined : resolve(__dirname, 'index.html'),
      },
      // Ensure the worker is bundled correctly
      assetsInlineLimit: 0,
    },
    server: {
      port: 3000
    }
  };
});
