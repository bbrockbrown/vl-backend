import express from 'express';
import axios from 'axios';
import { getAudioFeaturesByIds } from '../helpers/reccobeats';
import { PlayHistory, Track } from '../types/spotify/types';

interface QuizAnswer {
  questionId: string;
  answer: string | number;
  category: string;
}

interface PersonalityProfile {
  moodProfile: string;
  energyLevel: string;
  socialStyle: string;
  creativityLevel: string;
  lifestylePattern: string;
}

interface MusicCorrelation {
  moodMusicMatch: number;
  energyMusicMatch: number;
  socialMusicMatch: number;
  creativityMusicMatch: number;
}

interface QuizResult {
  personalityTraits: PersonalityProfile;
  musicCorrelations: MusicCorrelation;
  insights: string[];
  recommendations: string[];
}

// Helper function to fetch Spotify data directly
async function fetchSpotifyData(user: any, endpoint: string, params: any = {}) {
  try {
    const response = await axios.get(`https://api.spotify.com/v1${endpoint}`, {
      headers: {
        Authorization: `Bearer ${user.spotify.accessToken}`,
      },
      params
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching Spotify data from ${endpoint}:`, error);
    return null;
  }
}

// Submit + analyze quiz answers and correlate with Spotify data
export const analyzeQuizAnswers = async (req: express.Request, res: express.Response) => {
  try {
    const { answers } = req.body as { answers: QuizAnswer[] };
    const user = req.identity;

    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const spotifyHelper = res.locals.spotifyHelper;

    // Get Spotify data using SpotifyHelper
    const [topTracksData, recentlyPlayedData] = await Promise.all([
      spotifyHelper!.getUserTopTracks('short_term', 20, 0),
      // Note: SpotifyHelper doesn't have a method for recently played, so we'll keep the direct API call for that
      spotifyHelper!.getUserRecentlyPlayed(50)
    ]);

    // Extract track IDs for audio features with proper error handling
    const spotifyTrackIds = [
      ...(topTracksData?.items?.map((track: Track) => track.id) || []),
      ...(recentlyPlayedData?.map((item: PlayHistory) => item.track.id) || [])
    ].slice(0, 50); // Limit to 50 tracks for audio features

    // Get audio features from ReccoBeats API
    const trackAudioFeatures = await spotifyHelper!.getAudioFeaturesByIds(spotifyTrackIds, spotifyTrackIds.length);
    
    // Use ReccoBeats as primary, Chartmetric as fallback (or vice versa)
    const audioFeaturesData = {
      reccobeats: trackAudioFeatures,
    };

    // Analyze personality from quiz answers
    const personalityTraits = analyzePersonalityFromAnswers(answers);

    // Analyze music patterns
    const musicPatterns = analyzeMusicPatterns(audioFeaturesData);

    // Correlate personality with music
    const musicCorrelations = correlatePersonalityWithMusic(personalityTraits, musicPatterns);

    // Generate insights and recommendations
    const { insights, recommendations } = generateInsightsAndRecommendations(
      personalityTraits,
      musicPatterns,
      musicCorrelations
    );

    const result: QuizResult = {
      personalityTraits,
      musicCorrelations,
      insights,
      recommendations
    };

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to analyze quiz answers' });
  }
};

// Get detailed Spotify analysis
export const getSpotifyAnalysis = async (req: express.Request, res: express.Response) => {
  try {
    const user = req.identity;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const spotifyHelper = res.locals.spotifyHelper;

    // Get comprehensive Spotify data using SpotifyHelper
    const [topTracksShort, topTracksMedium, topTracksLong, recentlyPlayed] = await Promise.all([
      spotifyHelper!.getUserTopTracks('short_term', 20, 0),
      spotifyHelper!.getUserTopTracks('medium_term', 20, 0),
      spotifyHelper!.getUserTopTracks('long_term', 20, 0),
      fetchSpotifyData(user, '/me/player/recently-played', { limit: 50 })
    ]);

    // Get audio features for all tracks with proper error handling
    const allTrackIds = [
      ...(topTracksShort?.items?.map((track: any) => track.id) || []),
      ...(topTracksMedium?.items?.map((track: any) => track.id) || []),
      ...(topTracksLong?.items?.map((track: any) => track.id) || []),
      ...(recentlyPlayed?.items?.map((item: any) => item.track.id) || [])
    ];

    const uniqueTrackIds = [...new Set(allTrackIds)].slice(0, 100);
    const audioFeatures = uniqueTrackIds.length > 0
      ? await fetchSpotifyData(user, '/audio-features', { ids: uniqueTrackIds.join(',') })
      : { audio_features: [] };

    // Calculate listening patterns
    const listeningPatterns = calculateListeningPatterns(audioFeatures);

    res.json({
      topTracks: {
        shortTerm: topTracksShort,
        mediumTerm: topTracksMedium,
        longTerm: topTracksLong
      },
      recentlyPlayed,
      audioFeatures,
      listeningPatterns
    });
  } catch (error) {
    console.error('Error getting Spotify analysis:', error);
    res.status(500).json({ error: 'Failed to get Spotify analysis' });
  }
};

// Helper functions
function analyzePersonalityFromAnswers(answers: QuizAnswer[]): PersonalityProfile {
  const moodAnswers = answers.filter(a => a.category === 'mood');
  const energyAnswers = answers.filter(a => a.category === 'energy');
  const socialAnswers = answers.filter(a => a.category === 'social');
  const creativityAnswers = answers.filter(a => a.category === 'creativity');
  const lifestyleAnswers = answers.filter(a => a.category === 'lifestyle');

  return {
    moodProfile: analyzeMoodProfile(moodAnswers),
    energyLevel: analyzeEnergyLevel(energyAnswers),
    socialStyle: analyzeSocialStyle(socialAnswers),
    creativityLevel: analyzeCreativityLevel(creativityAnswers),
    lifestylePattern: analyzeLifestylePattern(lifestyleAnswers)
  };
}

function analyzeMoodProfile(moodAnswers: QuizAnswer[]): string {
  const moodQuestion = moodAnswers.find(a => a.questionId === 'mood_general');
  const stressQuestion = moodAnswers.find(a => a.questionId === 'stress_level');

  if (moodQuestion?.answer === 'Generally happy and positive') {
    return 'Optimistic and Positive';
  } else if (moodQuestion?.answer === 'Calm and relaxed') {
    return 'Calm and Balanced';
  } else if (moodQuestion?.answer === 'Energetic and excited') {
    return 'Energetic and Enthusiastic';
  } else if (moodQuestion?.answer === 'Thoughtful and introspective') {
    return 'Thoughtful and Reflective';
  } else {
    return 'Adaptable and Variable';
  }
}

function analyzeEnergyLevel(energyAnswers: QuizAnswer[]): string {
  const energyQuestion = energyAnswers.find(a => a.questionId === 'energy_level');
  const workoutQuestion = energyAnswers.find(a => a.questionId === 'workout_frequency');

  const energyValue = typeof energyQuestion?.answer === 'number' ? energyQuestion.answer : 3;
  const workoutValue = workoutQuestion?.answer;

  if (energyValue >= 4 && workoutValue === 'Daily or almost daily') {
    return 'High Energy and Active';
  } else if (energyValue >= 4) {
    return 'High Energy';
  } else if (energyValue <= 2) {
    return 'Low Energy and Relaxed';
  } else {
    return 'Moderate Energy';
  }
}

function analyzeSocialStyle(socialAnswers: QuizAnswer[]): string {
  const socialQuestion = socialAnswers.find(a => a.questionId === 'social_preference');
  const danceQuestion = socialAnswers.find(a => a.questionId === 'dance_enjoyment');
  const introvertQuestion = socialAnswers.find(a => a.questionId === 'introvert_extrovert');

  const danceValue = typeof danceQuestion?.answer === 'number' ? danceQuestion.answer : 3;
  const introvertValue = typeof introvertQuestion?.answer === 'number' ? introvertQuestion.answer : 3;

  if (socialQuestion?.answer === 'Socializing with friends' && danceValue >= 4) {
    return 'Extroverted and Social';
  } else if (socialQuestion?.answer === 'Quiet time alone' && introvertValue <= 2) {
    return 'Introverted and Private';
  } else if (socialQuestion?.answer === 'Active outdoor activities') {
    return 'Active and Outdoorsy';
  } else {
    return 'Balanced and Adaptable';
  }
}

function analyzeCreativityLevel(creativityAnswers: QuizAnswer[]): string {
  const explorationQuestion = creativityAnswers.find(a => a.questionId === 'creativity_exploration');
  const discoveryQuestion = creativityAnswers.find(a => a.questionId === 'music_discovery');

  if (explorationQuestion?.answer === 'I love exploring and discovering') {
    return 'Highly Creative and Exploratory';
  } else if (explorationQuestion?.answer === 'I prefer familiar things') {
    return 'Comfort-Seeking and Traditional';
  } else if (discoveryQuestion?.answer === 'Spotify recommendations') {
    return 'Open to New Experiences';
  } else {
    return 'Moderately Creative';
  }
}

function analyzeLifestylePattern(lifestyleAnswers: QuizAnswer[]): string {
  const musicPurposeQuestion = lifestyleAnswers.find(a => a.questionId === 'music_purpose');

  switch (musicPurposeQuestion?.answer) {
    case 'To boost my mood':
      return 'Mood-Focused and Emotional';
    case 'To relax and unwind':
      return 'Relaxation-Oriented';
    case 'To focus while working':
      return 'Productivity-Focused';
    case 'To dance and have fun':
      return 'Fun-Seeking and Energetic';
    case 'To explore new sounds':
      return 'Discovery-Oriented';
    default:
      return 'Balanced Lifestyle';
  }
}

function analyzeMusicPatterns(audioFeatures: any): any {
  if (!audioFeatures.audio_features || audioFeatures.audio_features.length === 0) {
    return {
      averageValence: 0.5,
      averageEnergy: 0.5,
      averageDanceability: 0.5,
      averageTempo: 120,
      averageAcousticness: 0.5,
      averageInstrumentalness: 0.5
    };
  }

  const features = audioFeatures.audio_features;
  const total = features.length;

  return {
    averageValence: features.reduce((sum: number, f: any) => sum + (f.valence || 0), 0) / total,
    averageEnergy: features.reduce((sum: number, f: any) => sum + (f.energy || 0), 0) / total,
    averageDanceability: features.reduce((sum: number, f: any) => sum + (f.danceability || 0), 0) / total,
    averageTempo: features.reduce((sum: number, f: any) => sum + (f.tempo || 120), 0) / total,
    averageAcousticness: features.reduce((sum: number, f: any) => sum + (f.acousticness || 0), 0) / total,
    averageInstrumentalness: features.reduce((sum: number, f: any) => sum + (f.instrumentalness || 0), 0) / total
  };
}

function correlatePersonalityWithMusic(personality: PersonalityProfile, musicPatterns: any): MusicCorrelation {
  // Simple correlation logic - can be enhanced with more sophisticated algorithms
  const moodMusicMatch = calculateMoodMusicMatch(personality.moodProfile, musicPatterns.averageValence);
  const energyMusicMatch = calculateEnergyMusicMatch(personality.energyLevel, musicPatterns.averageEnergy);
  const socialMusicMatch = calculateSocialMusicMatch(personality.socialStyle, musicPatterns.averageDanceability);
  const creativityMusicMatch = calculateCreativityMusicMatch(personality.creativityLevel, musicPatterns.averageInstrumentalness);

  return {
    moodMusicMatch,
    energyMusicMatch,
    socialMusicMatch,
    creativityMusicMatch
  };
}

function calculateMoodMusicMatch(moodProfile: string, averageValence: number): number {
  const moodValenceMap: { [key: string]: number } = {
    'Optimistic and Positive': 0.8,
    'Calm and Balanced': 0.6,
    'Energetic and Enthusiastic': 0.7,
    'Thoughtful and Reflective': 0.4,
    'Adaptable and Variable': 0.5
  };

  const expectedValence = moodValenceMap[moodProfile] || 0.5;
  return Math.max(0, 1 - Math.abs(averageValence - expectedValence));
}

function calculateEnergyMusicMatch(energyLevel: string, averageEnergy: number): number {
  const energyMap: { [key: string]: number } = {
    'High Energy and Active': 0.8,
    'High Energy': 0.7,
    'Low Energy and Relaxed': 0.3,
    'Moderate Energy': 0.5
  };

  const expectedEnergy = energyMap[energyLevel] || 0.5;
  return Math.max(0, 1 - Math.abs(averageEnergy - expectedEnergy));
}

function calculateSocialMusicMatch(socialStyle: string, averageDanceability: number): number {
  const socialDanceMap: { [key: string]: number } = {
    'Extroverted and Social': 0.8,
    'Introverted and Private': 0.3,
    'Active and Outdoorsy': 0.6,
    'Balanced and Adaptable': 0.5
  };

  const expectedDanceability = socialDanceMap[socialStyle] || 0.5;
  return Math.max(0, 1 - Math.abs(averageDanceability - expectedDanceability));
}

function calculateCreativityMusicMatch(creativityLevel: string, averageInstrumentalness: number): number {
  const creativityInstrumentalMap: { [key: string]: number } = {
    'Highly Creative and Exploratory': 0.6,
    'Comfort-Seeking and Traditional': 0.2,
    'Open to New Experiences': 0.5,
    'Moderately Creative': 0.4
  };

  const expectedInstrumentalness = creativityInstrumentalMap[creativityLevel] || 0.4;
  return Math.max(0, 1 - Math.abs(averageInstrumentalness - expectedInstrumentalness));
}

function generateInsightsAndRecommendations(
  personality: PersonalityProfile,
  musicPatterns: any,
  correlations: MusicCorrelation
): { insights: string[]; recommendations: string[] } {
  const insights: string[] = [];
  const recommendations: string[] = [];

  // Generate insights based on correlations
  if (correlations.moodMusicMatch > 0.8) {
    insights.push("Your music choices perfectly reflect your mood profile!");
  } else if (correlations.moodMusicMatch < 0.4) {
    insights.push("Your music choices might be compensating for your mood - interesting!");
  }

  if (correlations.energyMusicMatch > 0.8) {
    insights.push("Your energy level and music energy are perfectly aligned.");
  } else if (correlations.energyMusicMatch < 0.4) {
    insights.push("You might be using music to balance your energy levels.");
  }

  // Generate recommendations
  if (musicPatterns.averageValence < 0.4 && personality.moodProfile.includes('Positive')) {
    recommendations.push("Try adding more upbeat tracks to boost your mood!");
  }

  if (musicPatterns.averageEnergy < 0.3 && personality.energyLevel.includes('High')) {
    recommendations.push("Consider adding higher energy tracks to match your active lifestyle.");
  }

  if (musicPatterns.averageDanceability < 0.4 && personality.socialStyle.includes('Social')) {
    recommendations.push("Add some danceable tracks for your social gatherings!");
  }

  return { insights, recommendations };
}

function calculateListeningPatterns(audioFeatures: any): any {
  if (!audioFeatures.audio_features || audioFeatures.audio_features.length === 0) {
    return {
      averageValence: 0.5,
      averageEnergy: 0.5,
      averageDanceability: 0.5,
      averageTempo: 120,
      averageAcousticness: 0.5,
      averageInstrumentalness: 0.5
    };
  }

  const features = audioFeatures.audio_features;
  const total = features.length;

  return {
    averageValence: features.reduce((sum: number, f: any) => sum + (f.valence || 0), 0) / total,
    averageEnergy: features.reduce((sum: number, f: any) => sum + (f.energy || 0), 0) / total,
    averageDanceability: features.reduce((sum: number, f: any) => sum + (f.danceability || 0), 0) / total,
    averageTempo: features.reduce((sum: number, f: any) => sum + (f.tempo || 120), 0) / total,
    averageAcousticness: features.reduce((sum: number, f: any) => sum + (f.acousticness || 0), 0) / total,
    averageInstrumentalness: features.reduce((sum: number, f: any) => sum + (f.instrumentalness || 0), 0) / total
  };
} 