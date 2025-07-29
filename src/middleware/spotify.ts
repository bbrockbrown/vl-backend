import express from 'express';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { createSpotifyHelper } from '../helpers/spotifyHelpers';

export const injectSpotifyApi = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const accessToken = req.identity?.spotify.accessToken;

    if (accessToken) {
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
