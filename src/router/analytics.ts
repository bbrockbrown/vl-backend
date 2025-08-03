import express from 'express';
import { 
  getUserAnalytics,
  getListeningActivity,
  getMoodDistribution,
  getListeningPatterns,
  getAudioFeaturesCorrelation
} from '../controllers/analytics';
import { isAuthenticated } from '../middleware';

export default (router: express.Router) => {
  // Analytics routes (require authentication)
  router.get('/analytics/overview', isAuthenticated, getUserAnalytics);
  router.get('/analytics/listening-activity', isAuthenticated, getListeningActivity);
  router.get('/analytics/mood-distribution', isAuthenticated, getMoodDistribution);
  router.get('/analytics/listening-patterns', isAuthenticated, getListeningPatterns);
  router.get('/analytics/audio-features-correlation', isAuthenticated, getAudioFeaturesCorrelation);
}; 