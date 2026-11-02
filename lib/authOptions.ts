import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { OAuth2Client } from 'google-auth-library';

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
}

// Verifies Google ID tokens minted by the native app's Google Sign-In.
const googleTokenVerifier = new OAuth2Client();

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
    // Native app path: the Capacitor app signs in with the phone's native Google
    // picker and sends us the resulting ID token. We verify it against our Google
    // client ID and establish the same JWT session as the web OAuth flow.
    CredentialsProvider({
      id: 'google-native',
      name: 'Google',
      credentials: {
        idToken: { label: 'ID Token', type: 'text' },
      },
      async authorize(credentials) {
        const idToken = credentials?.idToken;
        if (!idToken) return null;
        try {
          const ticket = await googleTokenVerifier.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
          });
          const payload = ticket.getPayload();
          if (!payload?.sub) return null;
          return {
            id: payload.sub,
            name: payload.name ?? null,
            email: payload.email ?? null,
            image: payload.picture ?? null,
          };
        } catch (err) {
          console.error('google-native ID token verification failed', err);
          return null;
        }
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async session({ session, token }: { session: any; token: any }) {
      if (token?.picture) {
        session.user.image = token.picture;
      }
      return session;
    },
  },
};
