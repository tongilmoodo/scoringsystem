import type { Metadata, Viewport } from 'next';
import { Oswald, Inter, Roboto_Mono } from 'next/font/google';
import './globals.css';

const oswald = Oswald({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-oswald' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const robotoMono = Roboto_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-roboto-mono' });

export const metadata: Metadata = {
  title: 'Tong-Il Moo-Do Scoring System',
  description: 'Multi-tournament live scoring platform for Tong-Il Moo-Do events',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0f0f1a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${inter.variable} ${robotoMono.variable}`}>
      <body className="bg-bg-dark font-body text-white antialiased">{children}</body>
    </html>
  );
}
