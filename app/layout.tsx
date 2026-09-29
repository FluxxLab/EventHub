import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';

import { Providers } from '@/lib/providers/providers';
import './globals.css';

// Manrope, the typeface the delegate app uses, so the console reads as the same product.
const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: { default: 'PIC Events Admin', template: '%s · PIC Events Admin' },
  description: 'Organiser console for PIC Events: programme, tickets, delegates and live operations.',
  icons: { icon: '/pic-logo.png' },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
