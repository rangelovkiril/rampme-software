import type { Metadata, Viewport } from 'next'
import './globals.css'
import 'leaflet/dist/leaflet.css'

export const metadata: Metadata = {
  title: 'RampMe',
  description: 'Карта на градския транспорт в София с достъпност за рампа в реално време',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'RampMe',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title: 'RampMe',
    description: 'Карта на градския транспорт в София с достъпност за рампа в реално време',
    locale: 'bg_BG',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
    { media: '(prefers-color-scheme: light)', color: '#f5f5f5' },
  ],
}

// Runs before first paint so the page never renders in the wrong theme.
const THEME_INIT = `(function() {
  try {
    var theme = localStorage.getItem('theme');
    var supportDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (theme === 'dark' || (!theme && supportDarkMode)) {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})()`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="bg" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a static literal with no
            interpolated input. Inlining is the point: the script must run before first paint,
            and React offers no other way to emit a blocking inline script. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="h-full overflow-hidden font-sans">{children}</body>
    </html>
  )
}
