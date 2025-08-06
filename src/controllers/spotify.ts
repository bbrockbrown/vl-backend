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
    const { email, id: spotifyId, display_name, images } = profileData;
    // Pfp info
    const { imgUrl } = images;

    // We have email, so create user
    let user = await getUserByEmail(email);
    if (!user) {
      console.log('this is a new user');
      // Confirmed user does NOT have an account
      const newUser = await createUser({
        email,
        username: display_name || email,
        premium: false,
        pfpLink: imgUrl,
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
      console.log('User already has an account');
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

      // console.log("saved user info", user);

      // Set session token in session (for consistency)
      req.session.sessionToken = user.authentication.sessionToken;
      // console.log("req.session.sessionToken", user.authentication.sessionToken);

      // Set HTTP-only cookie (matches login pattern)
      const isProduction = process.env.NODE_ENV === 'production';
      const cookieDomain = process.env.COOKIE_DOMAIN;

      // console.log("isProd", isProduction);
      // console.log("cookie name", process.env.COOKIE_NAME);
      // console.log("cookie domain", cookieDomain);

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
      // console.log("Cookie set with options:", cookieOptions);
      // console.log("Cookie value:", user.authentication.sessionToken);
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
  const scope =
    'user-read-private user-read-email user-read-recently-played user-top-read user-read-playback-state user-library-read playlist-read-private';
  const redirectUri = `${getApiUrl()}/auth/spotify/callback`;
  // console.log("BASE API URL", getApiUrl())

  req.session!.spotifyState = state;

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
  const { timeRange, limit, offset } = req.query;
  const allowedRanges = ['short_term', 'medium_term', 'long_term'];
  if (!timeRange || !allowedRanges.includes(timeRange as string)) {
    return res.status(400).json({ error: 'Time range must be provided for top tracks' });
  }

  const spotifyHelper = res.locals.spotifyHelper;
  if (!spotifyHelper) {
    return res.status(400).json({ error: 'spotifyHelper not initialized' });
  }

  try {
    const response = await spotifyHelper.getUserTopTracks(
      timeRange as 'short_term' | 'medium_term' | 'long_term',
      limit ? parseInt(limit as string) : undefined,
      offset ? parseInt(offset as string) : undefined
    );
    res.json(response);
  } catch (error) {
    return res.status(400).json({ error: "Failed to get User's top tracks" });
  }
};

export const getUserRecentlyPlayed = async (req: express.Request, res: express.Response) => {
  const { limit, after, before } = req.query;
  if (!limit) {
    return res.status(400).json({ error: "Recently Played must have a limit" });
  }

  const spotifyHelper = res.locals.spotifyHelper;
  if (!spotifyHelper) {
    return res.status(400).json({ error: 'spotifyHelper not initialized' });
  }

  try {
    const response = await spotifyHelper.getUserRecentlyPlayed(
      parseInt(limit as string),
      after ? after as string : undefined,
      before ? before as string : undefined
    );
    res.json(response);
  } catch (error) {
    return res.status(400).json({ error: "Failed to get User's recently played tracks" });
  }
};

export const getTrackAudioFeatures = async (req: express.Request, res: express.Response) => {
  const { trackId } = req.query;
  if (!trackId) {
    return res.status(400).json({ error: 'Track ID must be provided' });
  }

  const spotifyHelper = res.locals.spotifyHelper;
  if (!spotifyHelper) {
    return res.status(400).json({ error: 'spotifyHelper not initialized' });
  }

  try {
    const response = await spotifyHelper.getAudioFeaturesById(trackId as string);
    res.json(response);
  } catch (error) {
    return res.status(400).json({ error: 'Failed to get track audio features' });
  }
};

export const getTracksAudioFeatures = async (req: express.Request, res: express.Response) => {
  const { trackIds } = req.query;
  if (!trackIds || (Array.isArray(trackIds) && trackIds.length === 0)) {
    return res.status(400).json({ error: 'Track IDs must be provided' });
  }

  const spotifyHelper = res.locals.spotifyHelper;
  if (!spotifyHelper) {
    console.log('returning')
    return res.status(400).json({ error: 'spotifyHelper not initialized' });
  }

  try {
    // Convert to array and ensure all values are strings
    const trackIdsArray = Array.isArray(trackIds) 
      ? trackIds.map(id => String(id))
      : [String(trackIds)];
    const response = await spotifyHelper.getAudioFeaturesByIds(trackIdsArray);
    res.json(response);
  } catch (error) {
    return res.status(400).json({ error: 'Failed to get track audio features' });
  }
};

export const getUserSavedTracks = async (req: express.Request, res: express.Response) => {
  const { limit, offset } = req.query;

  const spotifyHelper = res.locals.spotifyHelper;
  if (!spotifyHelper) {
    return res.status(400).json({ error: 'spotifyHelper not initialized' });
  }

  try {
    const response = await spotifyHelper.getUserSavedTracks(
      limit ? parseInt(limit as string) : undefined,
      offset ? parseInt(offset as string) : undefined
    );
    res.json(response);
  } catch (error) {
    return res.status(400).json({ error: "Failed to get User's saved tracks" });
  }
};
