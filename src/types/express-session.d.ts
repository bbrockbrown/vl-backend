import 'express-session';

declare module 'express-session' {
  interface SessionData {
    spotifyState?: string;
    sessionToken?: string;
    userId?: string;
  }
} 