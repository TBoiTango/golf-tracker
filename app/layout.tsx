import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Golf Tracker',
  description: 'Live golf scores',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white min-h-screen">
        <header className="bg-green-900 px-4 py-3 flex items-center gap-3 shadow-lg">
          <span className="text-2xl">⛳</span>
          <div>
            <h1 className="font-bold text-lg leading-tight">Golf Tracker</h1>
            <p className="text-green-300 text-xs">Live Scores</p>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
