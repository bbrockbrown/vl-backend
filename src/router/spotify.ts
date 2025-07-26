import express from 'express';
import { spotifyLogin, spotifyCallback, refreshSpotifyToken } from '../controllers/spotify';
import { isAuthenticated } from '../middleware';

export default (router: express.Router) => {
  // Spotify OAuth routes (no auth required - this IS the auth)
  router.get('/auth/spotify/login', spotifyLogin);
  router.get('/auth/spotify/callback', spotifyCallback);
  router.post('/auth/spotify/refresh-token', isAuthenticated, refreshSpotifyToken);
};