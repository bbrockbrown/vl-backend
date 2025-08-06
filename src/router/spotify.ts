import express from 'express';
import { 
  spotifyLogin, 
  spotifyCallback, 
  refreshSpotifyToken,
  getUserTopTracks,
  getUserRecentlyPlayed,
  getTrackAudioFeatures,
  getUserSavedTracks,
  getTracksAudioFeatures
} from '../controllers/spotify';
import { isAuthenticated } from '../middleware';
import { injectSpotifyApi } from '../middleware/spotify';

export default (router: express.Router) => {
  // Spotify OAuth routes (no auth required - this IS the auth)
  router.get('/auth/spotify/login', spotifyLogin);
  router.get('/auth/spotify/callback', spotifyCallback);
  router.post('/auth/spotify/refresh-token', isAuthenticated, refreshSpotifyToken);
  
  // Spotify API routes (require authentication)
  router.get('/spotify/top-tracks', isAuthenticated, injectSpotifyApi, getUserTopTracks);
  router.get('/spotify/recently-played', isAuthenticated, injectSpotifyApi, getUserRecentlyPlayed);
  router.get('/spotify/audio-features', isAuthenticated, injectSpotifyApi, getTrackAudioFeatures);
  router.get('/spotify/multiple-audio-features', isAuthenticated, injectSpotifyApi, getTracksAudioFeatures);
  router.get('/spotify/saved-tracks', isAuthenticated, injectSpotifyApi, getUserSavedTracks);
};