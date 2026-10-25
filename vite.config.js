import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig(() => ({
  // Production build is served at connectiqo.com/admin; local dev stays at root for convenience.
  // base: command === 'build' ? '/admin/' : '/',
  base: '/',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  test: {
    // Pure logic runs in Node; component tests opt into a DOM with `@vitest-environment jsdom`.
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries change rarely; separate files let browsers keep them cached across deploys.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'gsap', test: /node_modules[\\/]gsap[\\/]/ },
          ],
        },
      },
    },
  },
}))
