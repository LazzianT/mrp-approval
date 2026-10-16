/**
 * mssql adalah paket CommonJS, jadi di Node ESMS named import tidak bisa dipakai
 * (server gagal start dengan "does not provide an export named 'ConnectionPool'").
 * Karena itu ambil default lalu destructure.
 */
import mssql from 'mssql';
import type {
  ConnectionPool as ConnectionPoolType,
  Transaction as TransactionType,
  config as MssqlConfig,
} from 'mssql';

const { ConnectionPool, Transaction } = mssql;
import { env } from '../config/env.js';

/** Abstraksi tipis di atas SQL Server supaya service bisa diuji tanpa database. */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: Record<string, unknown>): Promise<T[]>;
  /** Jumlah baris yang benar-benar berubah. Dipakai untuk deteksi race condition. */
  execute(sql: string, params?: Record<string, unknown>): Promise<number>;
}

export interface Executor extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

const poolConfig: MssqlConfig = {
  server: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  options: {
    encrypt: env.DB_ENCRYPT,
    trustServerCertificate: env.DB_TRUST_SERVER_CERTIFICATE,
    enableArithAbort: true,
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
  requestTimeout: 15_000,
};

export async function createPool(): Promise<Executor> {
  const pool = await new ConnectionPool(poolConfig).connect();
  return wrapPool(pool);
}
function wrapPool(pool: ConnectionPoolType): Executor {
  const runQuery = async <T>(
    conn: ConnectionPoolType | TransactionType,
    sql: string,
    params: Record<string, unknown> = {},
  ): Promise<T[]> => {
    const request = conn.request();
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value === undefined || value === null ? null : (value as never));
    }
    const result = await request.query(sql);
    return result.recordset as T[];
  };

  const runExecute = async (
    conn: ConnectionPoolType | TransactionType,
    sql: string,
    params: Record<string, unknown> = {},
  ): Promise<number> => {
    const request = conn.request();
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value === undefined || value === null ? null : (value as never));
    }
    const result = await request.query(sql);
    return result.rowsAffected.reduce<number>((sum, n) => sum + n, 0);
  };

  return {
    query: (sql, params) => runQuery(pool, sql, params),
    execute: (sql, params) => runExecute(pool, sql, params),
    transaction: async (fn) => {
      const tx = new Transaction(pool);
      await tx.begin();
      try {
        const result = await fn({
          query: (sql, params) => runQuery(tx, sql, params),
          execute: (sql, params) => runExecute(tx, sql, params),
        });
        await tx.commit();
        return result;
      } catch (error) {
        await tx.rollback().catch(() => undefined);
        throw error;
      }
    },
  };
}