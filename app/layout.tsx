import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';

import { Providers } from '@/lib/providers/providers';
import { THEME_SCRIPT } from '@/lib/theme';
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
    // the theme script sets data-theme before React hydrates, hence the warning suppressed here
    <html lang="en" className={`${manrope.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background font-sans text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
