import type { Executor, Queryable } from './pool.js';

/**
 * Executor yang tidak melakukan apa pun ke database.
 *
 * Dipakai hanya saat DUMMY_MODE=true supaya server tetap bisa hidup tanpa
 * koneksi SQL Server. Router sudah selesai jalan sebelum menyentuh executor,
 * jadi semua query di sini sengaja tidak pernah dieksekusi; kalau sampai
 * dipanggil, itu bug yang harus ketahuan saat development.
 */
export function createDummyExecutor(): Executor {
  const refuse = (sql: string): never => {
    throw new Error(
      `DUMMY_MODE aktif, tapi ada query yang tetap dijalankan: ${sql.slice(0, 80)}...`,
    );
  };

  const notQueryable: Queryable = {
    query: async <T,>(sql: string): Promise<T[]> => refuse(sql),
    execute: async (sql: string): Promise<number> => refuse(sql),
  };

  return {
    query: notQueryable.query,
    execute: notQueryable.execute,
    transaction: async <T,>(fn: (tx: Queryable) => Promise<T>): Promise<T> => fn(notQueryable),
  };
}