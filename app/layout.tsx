import '@/styles/globals.css';

export const metadata = {
  title: 'Sales CRM',
  description: 'Real Estate Sales CRM',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar">
      <body>{children}</body>
    </html>
  );
}