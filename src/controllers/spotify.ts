import express from 'express';
import axios from 'axios';
import { URLSearchParams } from 'url';
import { stringGenerator } from '../helpers/index';
import querystring from 'querystring';

export const spotifyCallback = async (req: express.Request, res: express.Response) => {
  // Error checking for callback
  const error = req.query.error as string;
  if (error) {
    return res.redirect('/#' + querystring.stringify({ error }));
  }

  const code = req.query.code as string | null;
  const state = req.query.state as string | null;
  const originalState = req.session?.spotifyState;

  // Make sure same state as request
  if (state === null || state !== originalState) {
    res.redirect(
      '/#' +
        querystring.stringify({
          error: 'state_mismatch',
        })
    );
  }

  if (!code) {
    return res.sendStatus(400);
  }

  try {
    // Different routing based on prod vs dev
    const isProduction = process.env.NODE_ENV === 'production';
    const redirectUri = isProduction
      ? `${process.env.BACKEND_URL!}/auth/spotify/callback`
      : `${process.env.BACKEND_URL_DEV!}/auth/spotify/callback`;
    const authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      },
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(
            process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
          ).toString('base64'),
      },
      json: true,
    };

    const tokenResponse = await axios.post(authOptions.url, new URLSearchParams(authOptions.form), {
      headers: authOptions.headers,
    });

    // With access token, we can now perform operations related to user data
    const { access_token, refresh_token, expires_in } = tokenResponse.data;
  
    // Calculate expiry time
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Find the user that just allowed Spotify auth (from middleware)
    const user = req.identity;

    if (!user) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Update user's Spotify tokens
    user.spotifyAccessToken = access_token;
    user.spotifyRefreshToken = refresh_token;
    user.spotifyTokenExpiresAt = expiresAt;

    // Save the user info
    await user.save();

    // Redirect to frontend
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?success=true`);
  } catch (error) {
    console.log('Spotify callback error', error);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=spotify_auth_failed`);
  }
};

export const spotifyLogin = async (req: express.Request, res: express.Response) => {
  const state = stringGenerator(16);
  const scope = 'user-read-private user-read-email';
  const isProduction = process.env.NODE_ENV === 'production';

  req.session!.spotifyState = state;

  console.log('state', state);
  console.log('isProduction', isProduction);
  console.log(
    'redirect_uri',
    isProduction
      ? `${process.env.BACKEND_URL!}/auth/spotify/callback`
      : `${process.env.BACKEND_URL_DEV!}/auth/spotify/callback`
  );

  res.redirect(
    'https://accounts.spotify.com/authorize?' +
      querystring.stringify({
        response_type: 'code',
        client_id: process.env.SPOTIFY_CLIENT_ID!,
        scope: scope,
        redirect_uri: isProduction
          ? `${process.env.BACKEND_URL!}/auth/spotify/callback`
          : `${process.env.BACKEND_URL_DEV!}/auth/spotify/callback`,
        state: state,
      })
  );
};

export const refreshSpotifyToken = async (req: express.Request, res: express.Response) => {
  const refreshToken = req.body.refresh_token;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    const tokenResponse = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(
              process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
            ).toString('base64'),
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Update stored tokens in database
    const user = req.identity;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    user.spotifyAccessToken = access_token;
    if (refresh_token) {
      user.spotifyRefreshToken = refresh_token;
    }
    user.spotifyTokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    await user.save();

    res.json({
      access_token,
      refresh_token,
      expires_in,
      token_type: 'Bearer',
    });
  } catch (error) {
    console.log('Token refresh error', error);
    res.status(400).json({ error: 'Failed to refresh token' });
  }
};
