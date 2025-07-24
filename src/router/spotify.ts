import express from 'express';
import { spotifyLogin, spotifyCallback, refreshSpotifyToken } from '../controllers/spotify';

export default (router: express.Router) => {
  // Spotify OAuth routes
  router.get('/auth/spotify/login', spotifyLogin);
  router.get('/auth/spotify/callback', spotifyCallback);
  router.post('/auth/spotify/refresh-token', refreshSpotifyToken);
};