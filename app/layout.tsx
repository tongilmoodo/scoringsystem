import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mombasa Open Tong-Il Moo-Do Scoring System',
  description: 'Live tournament scoring for the Mombasa Open',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  );
}
