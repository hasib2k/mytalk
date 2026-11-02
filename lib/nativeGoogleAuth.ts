'use client';

import { signIn } from 'next-auth/react';

/**
 * Native Google Sign-In for the Capacitor app.
 *
 * Google blocks OAuth inside embedded WebViews ("disallowed_useragent"), so the
 * web redirect flow can't work in the native shell. Instead we trigger the
 * phone's native Google account picker via @capgo/capacitor-social-login, get a
 * Google ID token (JWT), and hand it to NextAuth's `google-native` credentials
 * provider, which verifies it server-side and sets the session cookie INSIDE the
 * WebView — so the rest of the app sees a normal logged-in session.
 */

let initialized = false;

export async function nativeGoogleSignIn(): Promise<{ ok: boolean; error?: string }> {
  const webClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!webClientId) {
    return { ok: false, error: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured' };
  }
  try {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    if (!initialized) {
      await SocialLogin.initialize({ google: { webClientId } });
      initialized = true;
    }
    // No `scopes` here on purpose: requesting Google API scopes triggers the
    // AuthorizationClient (access-token) path, which needs MainActivity changes.
    // We only need authentication — the Google ID token already carries the
    // email/profile claims via Credential Manager.
    const res = await SocialLogin.login({
      provider: 'google',
      options: {},
    });
    const result = res?.result as { idToken?: string | null } | undefined;
    const idToken = result?.idToken;
    if (!idToken) {
      return { ok: false, error: 'Google did not return an ID token' };
    }
    const signInRes = await signIn('google-native', { idToken, redirect: false });
    if (!signInRes || signInRes.error) {
      return { ok: false, error: signInRes?.error || 'Session sign-in failed' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
