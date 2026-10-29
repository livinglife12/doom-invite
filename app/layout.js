import './globals.css'

export const metadata = {
  title: 'Doom Invites You',
  description: 'A summons to witness the end of all resistance.',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#000000',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;800&family=Cinzel+Decorative:wght@700;900&family=IM+Fell+English:ital@0;1&family=Old+Standard+TT:ital,wght@0,400;0,700;1,400&family=UnifrakturMaguntia&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
