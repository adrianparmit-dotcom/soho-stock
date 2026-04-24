// @ts-nocheck
import './globals.css';

export const metadata = {
  title: 'SOHO Stock',
  description: 'Gestión de stock SOHO Natural Center',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0a0a0b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-bg-base text-neutral-100">
        {children}
      </body>
    </html>
  );
}
