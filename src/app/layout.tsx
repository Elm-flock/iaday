import type { Metadata } from 'next';
import { Public_Sans } from 'next/font/google';
import './globals.css';

// Respaldo de Tomato Grotesk mientras no estén los archivos con licencia.
const publicSans = Public_Sans({
  variable: '--font-public-sans',
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'OKR Platform',
  description: 'Plataforma de gestión de OKRs, check-ins y CFR de Flock IT',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-AR" className={`${publicSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
