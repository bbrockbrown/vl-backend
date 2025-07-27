import express from 'express';
import { 
  spotifyLogin, 
  spotifyCallback, 
  refreshSpotifyToken,
  getUserTopTracks,
  getUserRecentlyPlayed,
  getTrackAudioFeatures,
  getUserSavedTracks
} from '../controllers/spotify';
import { isAuthenticated } from '../middleware';

export default (router: express.Router) => {
  // Spotify OAuth routes (no auth required - this IS the auth)
  router.get('/auth/spotify/login', spotifyLogin);
  router.get('/auth/spotify/callback', spotifyCallback);
  router.post('/auth/spotify/refresh-token', isAuthenticated, refreshSpotifyToken);
  
  // Spotify API routes (require authentication)
  router.get('/api/spotify/top-tracks', isAuthenticated, getUserTopTracks);
  router.get('/api/spotify/recently-played', isAuthenticated, getUserRecentlyPlayed);
  router.get('/api/spotify/audio-features', isAuthenticated, getTrackAudioFeatures);
  router.get('/api/spotify/saved-tracks', isAuthenticated, getUserSavedTracks);
};