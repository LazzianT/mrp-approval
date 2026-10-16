import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// API_KEY dibaca dari .env di root project (server/.env tidak ada).
// Dipakai hanya untuk development: Vite proxy menyisipkan header x-api-key
// saat browser memanggil /api/mrpApproval/createLink, jadi kunci tidak pernah
// ikut terkirim ke browser.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotenv({ path: path.join(rootDir, '.env') });

export default defineConfig({
  plugins: [react()],
  server: {
    // CLIENT_PORT hanya untuk port Vite. Jangan pakai PORT, itu milik server Express.
    port: Number(process.env.CLIENT_PORT) || 5173,
    // Gagal keras kalau port sudah dipakai, daripada diam-diam pindah ke 5174
    // dan bikin tautan approval menunjuk ke server yang salah.
    strictPort: true,
    // Bind ke semua interface supaya halaman bisa dibuka dari HP di jaringan
    // kantor lewat IP LAN ini, bukan hanya localhost.
    host: true,
    // Halaman CI (app.bmc.co.id) memanggil proxy ini langsung saat membuat
    // tautan approval, jadi lintas origin. Development perlu CORS terbuka;
    // production tidak memakai Vite sehingga aturan ini tidak ikut ke build.
    cors: true,
    // Semua request API lewat proxy, jadi development tidak ada CORS sama sekali.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        headers: process.env.API_KEY ? { 'x-api-key': process.env.API_KEY } : {},
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});