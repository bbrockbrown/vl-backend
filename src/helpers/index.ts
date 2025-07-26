import crypto from 'crypto';

const HASH_SECRET = process.env.HASH_SECRET!;

// For password security and authentication
export const random = () => crypto.randomBytes(128).toString('base64');
export const authentication = (salt: string, password: string) =>
  crypto.createHmac('sha256', [salt, password].join('/')).update(HASH_SECRET).digest('hex');

// Random string to keep track of Spotify state for a user
export const stringGenerator = (length: number) =>
  Array.from({ length }, () =>
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(
      Math.floor(Math.random() * 62)
    )
  ).join('');

export const getApiUrl = () =>
  process.env.NODE_ENV === 'production' ? process.env.BACKEND_URL : process.env.BACKEND_URL_DEV;
