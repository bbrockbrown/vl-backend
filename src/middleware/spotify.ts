import express from 'express';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { createSpotifyHelper } from '../helpers/spotifyHelpers';

export const injectSpotifyApi = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const user = req.identity;
    const accessTokenString = user?.spotify?.accessToken;

    if (accessTokenString && user?.spotify?.tokenExpiresAt) {
      // Create proper AccessToken for SDK 
      const accessToken = {
        access_token: accessTokenString,
        token_type: 'Bearer',
        expires_in: Math.floor((new Date(user.spotify.tokenExpiresAt).getTime() - Date.now()) / 1000),
        refresh_token: user.spotify.refreshToken || '',
        expires: new Date(user.spotify.tokenExpiresAt).getTime()
      };

      const spotifyApi = SpotifyApi.withAccessToken(
        process.env.SPOTIFY_CLIENT_ID!,
        accessToken
      );
      res.locals.spotifyApi = spotifyApi;
      res.locals.spotifyHelper = createSpotifyHelper(spotifyApi);
    } else {
      // fallback for unauthenticated users
      const spotifyApi = SpotifyApi.withClientCredentials(
        process.env.SPOTIFY_CLIENT_ID!,
        process.env.SPOTIFY_CLIENT_SECRET!
      );
      res.locals.spotifyApi = spotifyApi;
      res.locals.spotifyHelper = createSpotifyHelper(spotifyApi);
    }

    next();
  } catch (err) {
    console.error('Error injecting spotifyApi', err);
    res.locals.spotifyApi = null;
    res.locals.spotifyHelper = null;
    next();
  }
};
