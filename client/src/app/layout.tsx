import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ToasterProvider } from '@/components/providers/ToasterProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import FloatingDockNav from '@/components/FloatingDockNav';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  metadataBase: new URL('http://ultimoversio.com'),
  title: {
    default: 'Ultimoversio',
    template: '%s | Ultimoversio',
  },
  description:
    'AI-powered content processing and publishing studio. Upload, analyse, edit, and export documents — with teleprompter mode, text-to-speech, and PowerPoint export.',
  keywords: ['AI writing', 'content studio', 'teleprompter', 'grammar check', 'document editor'],
  authors: [{ name: 'Ultimoversio' }],
  robots: 'noindex',
};

export const viewport: Viewport = {
  themeColor: '#4F46E5',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          {/* Global static grid — fixed to viewport, never scrolls */}
          <div
            aria-hidden
            className="pointer-events-none fixed inset-0 -z-10"
            style={{
              backgroundImage:
                'linear-gradient(to right, var(--grid-color) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          <AuthProvider>
            <ToasterProvider />
            <FloatingDockNav />
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
