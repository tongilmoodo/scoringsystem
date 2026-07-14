import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tong-Il Moo-Do Scoring System',
  description: 'Multi-tournament live scoring platform for Tong-Il Moo-Do events',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  );
}
