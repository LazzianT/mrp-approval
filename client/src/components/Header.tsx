interface HeaderProps {
  mrpNo: string;
  tahapLabel: string;
}

export function Header({ mrpNo, tahapLabel }: HeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Approval Budget Plan
      </p>
      <h1 className="mt-1 break-words text-lg font-semibold text-slate-900 sm:text-xl">{mrpNo}</h1>
      <span className="mt-2 inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
        Tahap: {tahapLabel}
      </span>
    </header>
  );
}