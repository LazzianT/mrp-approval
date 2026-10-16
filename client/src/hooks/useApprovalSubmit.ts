import { useState } from 'react';
import { submitApproval, type ApprovalRef } from '../api/mrpApproval';
import type { ApiFail, SubmitResponse } from '../types/approval';

export const MIN_REJECT_NOTE_LENGTH = 5;

export type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; result: SubmitResponse }
  | { status: 'error'; fail: ApiFail | null; message: string };

/**
 * Kunci submit ganda ditangani di hook ini juga, bukan hanya dengan disable tombol:
 * pengaman kedua kalau ada pemicu lain (mis. tombol enter cepat).
 */
export function useApprovalSubmit(ref: ApprovalRef) {
  const [state, setState] = useState<SubmitState>({ status: 'idle' });
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  const isSubmitting = state.status === 'submitting';

  // Perubahan teks harus langsung menghapus pesan validasi lama; kalau tidak,
  // pesan "minimal 5 karakter" tetap menempel padahal sudah diperbaiki.
  function updateNote(value: string): void {
    setNote(value);
    if (noteError) setNoteError(null);
  }

  async function approve(): Promise<void> {
    if ((!ref.token && !ref.m) || isSubmitting) return;
    setState({ status: 'submitting' });

    try {
      const response = await submitApproval(ref, 'approve');
      if (response.success) {
        setState({ status: 'success', result: response });
        return;
      }
      setState({
        status: 'error',
        fail: response,
        message: response.message,
      });
    } catch (error) {
      setState({
        status: 'error',
        fail: null,
        message: error instanceof Error ? error.message : 'Terjadi kesalahan. Silakan coba lagi.',
      });
    }
  }

  async function reject(): Promise<boolean> {
    if ((!ref.token && !ref.m) || isSubmitting) return false;

    const trimmed = note.trim();
    if (trimmed.length < MIN_REJECT_NOTE_LENGTH) {
      setNoteError(`Alasan penolakan wajib diisi minimal ${MIN_REJECT_NOTE_LENGTH} karakter.`);
      return false;
    }

    setNoteError(null);
    setState({ status: 'submitting' });

    try {
      const response = await submitApproval(ref, 'reject', trimmed);
      if (response.success) {
        setState({ status: 'success', result: response });
        return true;
      }
      setState({ status: 'error', fail: response, message: response.message });
      return false;
    } catch (error) {
      setState({
        status: 'error',
        fail: null,
        message: error instanceof Error ? error.message : 'Terjadi kesalahan. Silakan coba lagi.',
      });
      return false;
    }
  }

  return {
    state,
    note,
    setNote: updateNote,
    noteError,
    approve,
    reject,
    isSubmitting,
    isSuccess: state.status === 'success',
  };
}