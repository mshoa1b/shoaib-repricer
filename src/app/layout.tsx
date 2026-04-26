import type { Metadata } from "next";
import "./globals.css";
import { LogoutButton } from "./components/logout-button";

import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "The Ecosystem",
  description: "B2B Invoice Pricing & Export System",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.has("auth");

  return (
    <html lang="en">
      <body>
        <nav style={{
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '1rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ fontWeight: 600, fontSize: '1.25rem' }}>
            The <span style={{ color: 'var(--accent-primary)' }}>Ecosystem</span>
          </div>
          {isAuthenticated && (
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <a href="/dashboard" style={{ color: 'var(--text-secondary)' }}>Dashboard</a>
              <LogoutButton />
            </div>
          )}
        </nav>
        <main className="container">
          {children}
        </main>
      </body>
    </html>
  );
}
