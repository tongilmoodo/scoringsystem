import { redirect } from 'next/navigation';

// The root URL is the public scoreboard. Admin access is not linked here.
export default function Home() {
  redirect('/scoreboard');
}
