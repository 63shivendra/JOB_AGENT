import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Job Authenticity Agent - Analytics Dashboard',
  description: 'Track your bookmarked job applications and explore analytics on job post authenticity.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "'Inter', sans-serif" }} className="bg-[#0c0a09] text-[#f5f5f4] min-h-screen">
        {children}
      </body>
    </html>
  );
}
