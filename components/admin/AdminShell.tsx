'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/ui/Logo';
import { useActiveTournament } from '@/lib/useTournament';

const NAV = [
  { href: '/setup/admin', label: 'Dashboard' },
  { href: '/setup/admin/athletes', label: 'Athletes' },
  { href: '/setup/admin/draw', label: 'Draw' },
  { href: '/setup/admin/matches', label: 'Matches' },
  { href: '/setup/admin/results', label: 'Results' },
  { href: '/setup/admin/users', label: 'Users' },
  { href: '/setup/admin/system', label: 'System' },
  { href: '/setup/admin/audit', label: 'Audit' },
  { href: '/setup/admin/backup', label: 'Backup' },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { tournament } = useActiveTournament();

  return (
    <div className="flex min-h-screen bg-navy text-white">
      <aside className="no-print flex w-52 shrink-0 flex-col gap-1 border-r border-white/10 bg-bg-dark p-4">
        <div className="mb-4 flex items-center gap-2">
          <Logo size={32} />
          <span className="font-headline text-sm font-bold uppercase leading-tight tracking-widest">Scoring System</span>
        </div>
        {tournament && <p className="mb-3 truncate text-xs text-text-muted">{tournament.name}</p>}
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-r px-3 py-2 text-sm font-bold transition ${
                active ? 'border-l-4 border-gold bg-white/5 text-white' : 'border-l-4 border-transparent text-text-muted hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </aside>
      <div className="flex-1 overflow-x-auto">{children}</div>
    </div>
  );
}
