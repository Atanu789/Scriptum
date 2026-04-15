import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import { ToasterProvider } from '@/components/providers/ToasterProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import FloatingDockNav from '@/components/FloatingDockNav';
import { VortexBackground } from '@/components/ui/vortex-background';

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
  metadataBase: new URL('https://ultimoversio.com'),
  title: {
    default: 'Ultimoversio',
    template: '%s | Ultimoversio',
  },
  description:
    'AI-powered content processing and publishing studio.',
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
    <ClerkProvider>
      <html
        lang="en"
        className={`${inter.variable} ${jetbrainsMono.variable}`}
        suppressHydrationWarning
      >
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
            <VortexBackground className="pointer-events-none fixed inset-0 z-0 opacity-75 dark:opacity-90" compact />

            <div
              aria-hidden
              className="app-grid-overlay pointer-events-none fixed inset-0 z-[1] opacity-70 blur-[1.5px] dark:opacity-55"
            />

            <div className="relative z-10">
              <AuthProvider>
                <ToasterProvider />
                <FloatingDockNav />
                {children}
              </AuthProvider>
            </div>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}