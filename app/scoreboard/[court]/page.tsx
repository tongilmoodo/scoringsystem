import CourtDisplay from '@/components/CourtDisplay';

export default function SingleCourtScoreboard({ params }: { params: { court: string } }) {
  const court = Number(params.court);
  return (
    <main className="flex min-h-screen flex-col bg-black p-4">
      <CourtDisplay court={court === 2 ? 2 : 1} big />
    </main>
  );
}
