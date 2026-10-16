const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
});

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeZone: 'Asia/Jakarta',
});

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return dateTimeFormatter.format(parsed);
}

export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return dateFormatter.format(parsed);
}

/** Sisa waktu dalam bahasa manusia, mis. "2 hari 5 jam lagi". */
export function formatRemaining(expiredAt: string): string {
  const parsed = new Date(expiredAt);
  if (Number.isNaN(parsed.getTime())) return '-';

  const diffMs = parsed.getTime() - Date.now();
  if (diffMs <= 0) return 'sudah kedaluwarsa';

  const totalHours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days > 0) return `${days} hari ${hours} jam lagi`;
  if (totalHours > 0) return `${totalHours} jam lagi`;

  const minutes = Math.max(1, Math.floor(diffMs / 60_000));
  return `${minutes} menit lagi`;
}