import type { ReactNode } from 'react';

interface StateMessageProps {
  tone: 'info' | 'error' | 'success' | 'warning';
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  busy?: boolean;
}

const TONES: Record<StateMessageProps['tone'], { wrapper: string; iconWrap: string; glyph: string }> = {
  info: { wrapper: 'border-slate-200 bg-white text-slate-900', iconWrap: 'text-slate-400', glyph: 'i' },
  error: { wrapper: 'border-red-200 bg-red-50 text-red-900', iconWrap: 'text-red-500', glyph: '!' },
  success: {
    wrapper: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    iconWrap: 'text-emerald-600',
    glyph: '\u2713',
  },
  warning: { wrapper: 'border-amber-200 bg-amber-50 text-amber-900', iconWrap: 'text-amber-500', glyph: '!' },
};

export function StateMessage({ tone, title, description, action, busy = false }: StateMessageProps) {
  const palette = TONES[tone];

  return (
    <section aria-busy={busy} className={`rounded-lg border p-5 text-center ${palette.wrapper}`}>
      <span
        aria-hidden="true"
        className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 border-current text-lg font-bold ${palette.iconWrap}`}
      >
        {palette.glyph}
      </span>
      <h2 className="mt-3 text-base font-semibold">{title}</h2>
      {description && <div className="mt-1 text-sm leading-relaxed">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}