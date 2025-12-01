import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Vital: Maps process.env.API_KEY in code to the actual environment variable during build
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Prevents "process is not defined" errors in other libraries
      'process.env': JSON.stringify(env)
    },
    build: {
      outDir: 'dist',
    }
  };
});