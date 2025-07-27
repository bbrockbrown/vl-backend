import express from 'express';
import { analyzeQuizAnswers, getSpotifyAnalysis } from '../controllers/quiz';
import { isAuthenticated } from '../middleware';

export default (router: express.Router) => {
  // Quiz analysis routes (require authentication)
  router.post('/api/quiz/analyze', isAuthenticated, analyzeQuizAnswers);
  router.get('/api/quiz/spotify-analysis', isAuthenticated, getSpotifyAnalysis);
}; 