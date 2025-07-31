import express from 'express';
import { analyzeQuizAnswers, getSpotifyAnalysis } from '../controllers/quiz';
import { isAuthenticated } from '../middleware';
import { injectSpotifyApi } from '../middleware/spotify';

export default (router: express.Router) => {
  // Quiz analysis routes (require authentication and Spotify API)
  router.post('/quiz/analyze', isAuthenticated, injectSpotifyApi, analyzeQuizAnswers);
  router.get('/quiz/spotify-analysis', isAuthenticated, injectSpotifyApi, getSpotifyAnalysis);
}; 