/**
 * Environment untuk test. Berjalan sebelum modul apa pun diimpor, jadi
 * config/env.ts melihat nilai di sini dan bukan nilai .env lokal.
 */
process.env.NODE_ENV = 'test';
process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '1433';
process.env.DB_USER = process.env.DB_USER ?? 'sa';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'x';
process.env.DB_NAME = process.env.DB_NAME ?? 'BMC';
process.env.APP_URL = 'https://approval.test';
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET ?? 'secret-uji-minimal-32-karakter-panjang-sekali';
process.env.API_KEY = process.env.API_KEY ?? 'api-key-uji-123456';

// Dipaksa, bukan pakai ??: nilai dari .env lokal tidak boleh memengaruhi test,
// termasuk PUBLIC_APP_URL (IP laptop) dan ALLOW_UNSIGNED_LINK (mode QA).
process.env.PUBLIC_APP_URL = '';
process.env.ALLOW_UNSIGNED_LINK = 'false';

// Test memakai database palsu, jadi dummy mode harus mati.
process.env.DUMMY_MODE = 'false';

// Test menguji penulisan kolom ringkasan; perilaku default
// (tidak menulis) diuji terpisah di test/statusSummary.test.ts.
process.env.WRITE_STATUS_SUMMARY = 'true';
