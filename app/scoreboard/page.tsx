export const dynamic = 'force-dynamic';

import CourtDisplay from '@/components/CourtDisplay';

export default function ScoreboardPage() {
  return (
    <main className="grid min-h-screen gap-4 bg-gray-950 p-4 md:grid-cols-2">
      <CourtDisplay court={1} />
      <CourtDisplay court={2} />
    </main>
  );
}
