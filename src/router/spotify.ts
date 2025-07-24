import express from 'express';
import { spotifyLogin, spotifyCallback, refreshSpotifyToken } from '../controllers/spotify';
import { isAuthenticated } from '../middleware';

export default (router: express.Router) => {
  // Spotify OAuth routes
  router.get('/auth/spotify/login', isAuthenticated, spotifyLogin);
  router.get('/auth/spotify/callback', isAuthenticated, spotifyCallback);
  router.post('/auth/spotify/refresh-token', isAuthenticated, refreshSpotifyToken);
};