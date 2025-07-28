import express from 'express';
import axios from 'axios';
import { URLSearchParams } from 'url';
import { getApiUrl, random, stringGenerator, authentication } from '../helpers/index';
import querystring from 'querystring';
import { createUser, getUserByEmail, getUserById } from '../db/users';

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
    return res.redirect(
      '/#' +
        querystring.stringify({
          error: 'state_mismatch',
        })
    );
  }

  if (!code) {
    return res.status(400).json({ error: 'Did not receive code from Spotify in callback' });
  }

  try {
    // Different routing based on prod vs dev
    const redirectUri = `${getApiUrl()}/auth/spotify/callback`;
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

    const profileResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const profileData = await profileResponse.json();
    const { email, id: spotifyId, display_name } = profileData;

    // We have email, so create user
    let user = await getUserByEmail(email);
    if (!user) {
      console.log("this is a new user")
      // Confirmed user does NOT have an account
      const newUser = await createUser({
        email,
        username: display_name || email,
        spotify: {
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: expiresAt,
        },
        authentication: {
          password: 'spotify-auth', // placeholder since password is required
          salt: random(),
          sessionToken: '', // will be set below
        },
      });
      user = await getUserById(newUser._id.toString());
    } else {
      console.log("User already has an account")
      // User has an account, update their tokens
      if (!user.spotify) user.spotify = {}; // keeps TS happy
      user.spotify.accessToken = access_token;
      user.spotify.refreshToken = refresh_token;
      user.spotify.tokenExpiresAt = expiresAt;
    }

    if (user) {
      // Ensure authentication object exists
      if (!user.authentication) {
        user.authentication = {
          password: 'spotify-auth', // placeholder since password is required
          salt: random(),
          sessionToken: '',
        };
      }
      
      // Generate new session token
      const salt = random();
      user.authentication.sessionToken = authentication(salt, user._id.toString());
      await user.save();

      console.log("saved user info", user);

      // Set session token in session (for consistency)
      req.session.sessionToken = user.authentication.sessionToken;
      console.log("req.session.sessionToken", user.authentication.sessionToken);

      // Set HTTP-only cookie (matches login pattern)
      const isProduction = process.env.NODE_ENV === 'production';
      const cookieDomain = process.env.COOKIE_DOMAIN;

      console.log("isProd", isProduction);
      console.log("cookie name", process.env.COOKIE_NAME);
      console.log("cookie domain", cookieDomain);
      
      const cookieOptions: any = {
        path: '/',
        httpOnly: isProduction, // Only httpOnly in production
        secure: isProduction,
        sameSite: isProduction ? 'Lax' : 'lax',
      };

      // Only set domain in production
      if (isProduction && cookieDomain) {
        cookieOptions.domain = cookieDomain;
      }
      
      if (!isProduction) {
        delete cookieOptions.domain;
      }

      res.cookie(process.env.COOKIE_NAME!, user.authentication.sessionToken, cookieOptions);
      console.log("Cookie set with options:", cookieOptions);
      console.log("Cookie value:", user.authentication.sessionToken);
    }
    // Redirect to frontend
    res.redirect(`${process.env.FRONTEND_URL}/quiz?success=true`);
  } catch (error) {
    console.log('Spotify callback error', error);
    res.redirect(`${process.env.FRONTEND_URL}/quiz?error=spotify_auth_failed`);
  }
};

export const spotifyLogin = async (req: express.Request, res: express.Response) => {
  const state = stringGenerator(16);
  const scope = 'user-read-private user-read-email user-read-recently-played user-top-read user-read-playback-state user-library-read playlist-read-private';
  const redirectUri = `${getApiUrl()}/auth/spotify/callback`;
  console.log("BASE API URL", getApiUrl())

  req.session!.spotifyState = state;

  console.log('state', state);
  console.log('isProduction', process.env.NODE_ENV === 'production');
  console.log('redirect_uri', redirectUri);

  res.redirect(
    'https://accounts.spotify.com/authorize?' +
      querystring.stringify({
        response_type: 'code',
        client_id: process.env.SPOTIFY_CLIENT_ID!,
        scope: scope,
        redirect_uri: redirectUri,
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

    user.spotify.accessToken = access_token;
    if (refresh_token) {
      user.spotify.refreshToken = refresh_token;
    }
    user.spotify.tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
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

export const getUserTopTracks = async (req: express.Request, res: express.Response) => {
  try {
    const user = req.identity;
    if (!user || !user.spotify?.accessToken) {
      return res.status(401).json({ error: 'User not authenticated or no Spotify token' });
    }

    const timeRange = req.query.time_range as string || 'short_term'; // short_term, medium_term, long_term
    const limit = req.query.limit as string || '20';

    const response = await fetch(
      `https://api.spotify.com/v1/me/top/tracks?time_range=${timeRange}&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${user.spotify.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching top tracks:', error);
    res.status(500).json({ error: 'Failed to fetch top tracks' });
  }
};

export const getUserRecentlyPlayed = async (req: express.Request, res: express.Response) => {
  try {
    const user = req.identity;
    if (!user || !user.spotify?.accessToken) {
      return res.status(401).json({ error: 'User not authenticated or no Spotify token' });
    }

    const limit = req.query.limit as string || '50';

    const response = await fetch(
      `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${user.spotify.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching recently played:', error);
    res.status(500).json({ error: 'Failed to fetch recently played tracks' });
  }
};

export const getTrackAudioFeatures = async (req: express.Request, res: express.Response) => {
  try {
    const user = req.identity;
    if (!user || !user.spotify?.accessToken) {
      return res.status(401).json({ error: 'User not authenticated or no Spotify token' });
    }

    const trackIds = req.query.ids as string;
    if (!trackIds) {
      return res.status(400).json({ error: 'Track IDs are required' });
    }

    const response = await fetch(
      `https://api.spotify.com/v1/audio-features?ids=${trackIds}`,
      {
        headers: {
          Authorization: `Bearer ${user.spotify.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching audio features:', error);
    res.status(500).json({ error: 'Failed to fetch audio features' });
  }
};

export const getUserSavedTracks = async (req: express.Request, res: express.Response) => {
  try {
    const user = req.identity;
    if (!user || !user.spotify?.accessToken) {
      return res.status(401).json({ error: 'User not authenticated or no Spotify token' });
    }

    const limit = req.query.limit as string || '20';
    const offset = req.query.offset as string || '0';

    const response = await fetch(
      `https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${user.spotify.accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching saved tracks:', error);
    res.status(500).json({ error: 'Failed to fetch saved tracks' });
  }
};