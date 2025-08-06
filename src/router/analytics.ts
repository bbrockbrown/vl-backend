import express from 'express';
import { 
  getUserAnalytics,
  getListeningActivity,
  getMoodDistribution,
  getListeningPatterns,
  getAudioFeaturesCorrelation,
  getUserTrackIds,
  getConsolidatedAnalytics
} from '../controllers/analytics';
import { isAuthenticated } from '../middleware';
import { injectSpotifyApi } from '../middleware/spotify';

export default (router: express.Router) => {
  // Analytics routes (require authentication)
  router.get('/analytics/overview', isAuthenticated, injectSpotifyApi, getUserAnalytics);
  router.get('/analytics/listening-activity', isAuthenticated, injectSpotifyApi, getListeningActivity);
  router.get('/analytics/mood-distribution', isAuthenticated, injectSpotifyApi, getMoodDistribution);
  router.get('/analytics/listening-patterns', isAuthenticated, injectSpotifyApi, getListeningPatterns);
  router.get('/analytics/audio-features-correlation', isAuthenticated, injectSpotifyApi, getAudioFeaturesCorrelation);
  router.get('/analytics/user-track-ids', isAuthenticated, injectSpotifyApi, getUserTrackIds);
  router.get('/analytics/consolidated', isAuthenticated, injectSpotifyApi, getConsolidatedAnalytics);
}; 