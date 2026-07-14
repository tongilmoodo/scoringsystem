import Link from 'next/link';

const LINKS = [
  { href: '/scoreboard', label: 'Public Scoreboard', desc: 'Live scores for both courts. No login.' },
  { href: '/court/1', label: 'Court A Scorer', desc: 'Tablet interface. Scorer PIN required.' },
  { href: '/court/2', label: 'Court B Scorer', desc: 'Tablet interface. Scorer PIN required.' },
  { href: '/admin', label: 'Admin Dashboard', desc: 'Tournament control. Admin PIN required.' },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-black">Mombasa Open</h1>
      <p className="mb-4 text-gray-400">Tong-Il Moo-Do Scoring System</p>
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="rounded-xl border border-gray-800 bg-gray-900 p-5 hover:border-gray-600"
        >
          <span className="text-xl font-bold">{l.label}</span>
          <p className="text-gray-400">{l.desc}</p>
        </Link>
      ))}
    </main>
  );
}
