import type { Metadata } from 'next'
import './globals.css'
import 'leaflet/dist/leaflet.css'

export const metadata: Metadata = {
  title: 'Sofia Live Transport',
  description: 'Live public transport map for Sofia, Bulgaria'
}

/**
 * Root layout component for the application; sets the document language to Bulgarian and ensures
 * an initial color theme (`dark` class) is applied before hydration.
 *
 * Renders the top-level HTML structure (<html>, <head>, <body>) and injects the provided children
 * into the body.
 *
 * @param children - The React node(s) to render inside the document body
 * @returns The HTML root element containing head and body with the provided children
 */
export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="bg" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function() {
              try {
                var theme = localStorage.getItem('theme');
                var supportDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (theme === 'dark' || (!theme && supportDarkMode)) {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            })()`
          }}
        />
      </head>
      <body className="h-full overflow-hidden font-sans">{children}</body>
    </html>
  )
}
