import axios from 'axios';

/**
 * Error jaringan / 5xx dibedakan dari kegagalan bisnis supaya UI bisa
 * menawarkan tombol "Coba lagi" hanya pada kasus yang memang perlu diulang.
 */
export class NetworkError extends Error {
  readonly retryable = true;
  constructor(message = 'Tidak dapat terhubung ke server. Periksa koneksi Anda.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export const http = axios.create({
  baseURL: '/api',
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const serverMessage =
        (error.response?.data as { message?: string } | undefined)?.message;

      if (!error.response) {
        return Promise.reject(new NetworkError());
      }
      if (serverMessage) {
        return Promise.reject(new Error(serverMessage));
      }
      return Promise.reject(new NetworkError('Terjadi masalah pada server. Silakan coba lagi.'));
    }
    return Promise.reject(error);
  },
);

/** Endpoint yang gagal secara bisnis tetap HTTP 200, jadi bentuk respons selalu seragam. */
export function isApiSuccess<T>(response: { success: boolean; data?: T }): response is { success: true; data: T } {
  return response.success === true;
}