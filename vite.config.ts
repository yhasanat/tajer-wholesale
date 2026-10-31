import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root:'src',
  publicDir:'../public',
  base:'./',
  assetsInclude:['**/*.xlsx'],
  plugins:[react()],
  build:{outDir:'../dist',emptyOutDir:true,cssCodeSplit:false,assetsInlineLimit:1024*1024,rollupOptions:{output:{inlineDynamicImports:true}}},
});
