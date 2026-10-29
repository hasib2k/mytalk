'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import React, { Suspense } from 'react';

const FEATURES = [
  {
    title: 'Crystal-clear HD audio',
    sub: 'Low-latency voice built for real conversations',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3f6fe0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v4" />
      </svg>
    ),
  },
  {
    title: 'Up to 2,500 participants',
    sub: 'Scale from a quick call to a town hall',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    title: 'Private & secure rooms',
    sub: 'Lock rooms and approve guests with knock-to-join',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d98a12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
];

function LoginContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Brand */}
        <div style={styles.brandRow}>
          <img src="/icons/logo_icon.png" alt="MyTalk" style={styles.logoImg} />
          <span style={styles.brandText}>
            My<span style={{ color: '#3f6fe0' }}>Talk</span>
          </span>
        </div>

        <h1 style={styles.title}>Welcome to MyTalk</h1>
        <p style={styles.subtitle}>
          Sign in with your Google account to join or create meetings
        </p>

        <button
          onClick={() => signIn('google', { callbackUrl })}
          style={styles.googleBtn}
          className="login-google-btn"
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>What you get</span>
          <span style={styles.dividerLine} />
        </div>

        {/* Feature highlights */}
        <div style={styles.features}>
          {FEATURES.map((f) => (
            <div key={f.title} style={styles.featureRow}>
              <div style={styles.featureIcon}>{f.icon}</div>
              <div style={styles.featureText}>
                <span style={styles.featureTitle}>{f.title}</span>
                <span style={styles.featureSub}>{f.sub}</span>
              </div>
            </div>
          ))}
        </div>

        <p style={styles.footer}>
          By continuing you agree to use MyTalk responsibly. No downloads, works in your browser.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e6e9f0', color: 'rgba(0, 0, 0, 0.5)' }}>Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#e6e9f0',
    padding: '24px 16px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    padding: '2.5rem 2.25rem',
    background: '#e6e9f0',
    border: 'none',
    borderRadius: '1.75rem',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '8px 8px 20px #cdd2de, -7px -7px 16px #eef1f7',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '0.25rem',
  },
  logoImg: {
    width: '46px',
    height: '46px',
    objectFit: 'contain',
  },
  brandText: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#1f2440',
    letterSpacing: '-0.01em',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#1f2440',
    margin: 0,
    textAlign: 'center',
    letterSpacing: '-0.01em',
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#7d849f',
    margin: 0,
    textAlign: 'center',
    lineHeight: 1.5,
  },
  googleBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    width: '100%',
    padding: '0.875rem 1.5rem',
    background: '#e6e9f0',
    color: '#1f2440',
    border: 'none',
    borderRadius: '1rem',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: '0.25rem',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    marginTop: '0.5rem',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: '#d4d8e2',
  },
  dividerText: {
    fontSize: '0.72rem',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#9aa0b8',
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
  },
  featureRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '12px 14px',
    borderRadius: '16px',
    background: '#e6e9f0',
    boxShadow: 'inset 3px 3px 7px #cdd2de, inset -3px -3px 7px #eef1f7',
  },
  featureIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '12px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#e6e9f0',
    boxShadow: '3px 3px 7px #cdd2de, -3px -3px 7px #eef1f7',
  },
  featureText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
  },
  featureTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#1f2440',
  },
  featureSub: {
    fontSize: '0.78rem',
    color: '#7d849f',
    lineHeight: 1.35,
  },
  footer: {
    fontSize: '0.75rem',
    color: '#9aa0b8',
    margin: 0,
    textAlign: 'center',
    marginTop: '0.25rem',
    lineHeight: 1.5,
  },
};
