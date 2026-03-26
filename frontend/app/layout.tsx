import type { Metadata } from 'next'
import './globals.css'
import 'leaflet/dist/leaflet.css'

export const metadata: Metadata = {
  title: 'Sofia Live Transport',
  description: 'Live public transport map for Sofia, Bulgaria',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="bg" className="h-full antialiased">
      <body className="h-full overflow-hidden bg-surface text-on-surface font-sans">
        {children}
      </body>
    </html>
  )
}
