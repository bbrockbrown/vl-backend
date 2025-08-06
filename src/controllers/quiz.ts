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
    console.log("trackAudioFeatures", trackAudioFeatures)

    // Analyze personality from quiz answers
    const personalityTraits = analyzePersonalityFromAnswers(answers);
    console.log("personality Traits", personalityTraits);

    // Analyze music patterns
    const musicPatterns = analyzeMusicPatterns(trackAudioFeatures);
    console.log("musicPatterns", musicPatterns);

    // Correlate personality with music
    const musicCorrelations = correlatePersonalityWithMusic(personalityTraits, musicPatterns);
    console.log("musicCorrelations", musicCorrelations);

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

    // Get audio features from ReccoBeats API
    const trackAudioFeatures = await spotifyHelper!.getAudioFeaturesByIds(uniqueTrackIds, uniqueTrackIds.length);

    // Analyze music patterns
    const musicPatterns = analyzeMusicPatterns(trackAudioFeatures);

    res.json({
      topTracks: {
        shortTerm: topTracksShort,
        mediumTerm: topTracksMedium,
        longTerm: topTracksLong
      },
      recentlyPlayed,
      trackAudioFeatures,
      musicPatterns
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
  // Handle the case where audioFeatures is a direct array
  let features = audioFeatures;
  
  // If it's wrapped in an object with audio_features property
  if (audioFeatures && audioFeatures.audio_features) {
    features = audioFeatures.audio_features;
  }
  
  // Filter out null/undefined features and ensure we have valid data
  const validFeatures = features.filter((f: any) => 
    f && 
    typeof f.valence === 'number' && 
    typeof f.energy === 'number' && 
    typeof f.danceability === 'number'
  );

  if (!validFeatures || validFeatures.length === 0) {
    return {
      averageValence: 0.5,
      averageEnergy: 0.5,
      averageDanceability: 0.5,
      averageTempo: 120,
      averageAcousticness: 0.5,
      averageInstrumentalness: 0.5
    };
  }

  const total = validFeatures.length;

  return {
    averageValence: validFeatures.reduce((sum: number, f: any) => sum + (f.valence || 0), 0) / total,
    averageEnergy: validFeatures.reduce((sum: number, f: any) => sum + (f.energy || 0), 0) / total,
    averageDanceability: validFeatures.reduce((sum: number, f: any) => sum + (f.danceability || 0), 0) / total,
    averageTempo: validFeatures.reduce((sum: number, f: any) => sum + (f.tempo || 120), 0) / total,
    averageAcousticness: validFeatures.reduce((sum: number, f: any) => sum + (f.acousticness || 0), 0) / total,
    averageInstrumentalness: validFeatures.reduce((sum: number, f: any) => sum + (f.instrumentalness || 0), 0) / total
  };
}

function correlatePersonalityWithMusic(personality: PersonalityProfile, musicPatterns: any): MusicCorrelation {
  // Enhanced correlation logic with weighted scoring and feature interactions
  const moodMusicMatch = calculateMoodMusicMatch(personality.moodProfile, musicPatterns);
  const energyMusicMatch = calculateEnergyMusicMatch(personality.energyLevel, musicPatterns);
  const socialMusicMatch = calculateSocialMusicMatch(personality.socialStyle, musicPatterns);
  const creativityMusicMatch = calculateCreativityMusicMatch(personality.creativityLevel, musicPatterns);

  return {
    moodMusicMatch,
    energyMusicMatch,
    socialMusicMatch,
    creativityMusicMatch
  };
}

function calculateMoodMusicMatch(moodProfile: string, musicPatterns: any): number {
  const { averageValence, averageEnergy, averageAcousticness } = musicPatterns;
  
  // Multi-dimensional mood mapping with feature interactions
  const moodProfiles: { [key: string]: any } = {
    'Optimistic and Positive': {
      valence: { expected: 0.75, weight: 0.4 },
      energy: { expected: 0.65, weight: 0.3 },
      acousticness: { expected: 0.3, weight: 0.3 }
    },
    'Calm and Balanced': {
      valence: { expected: 0.6, weight: 0.3 },
      energy: { expected: 0.4, weight: 0.4 },
      acousticness: { expected: 0.5, weight: 0.3 }
    },
    'Energetic and Enthusiastic': {
      valence: { expected: 0.7, weight: 0.3 },
      energy: { expected: 0.8, weight: 0.5 },
      acousticness: { expected: 0.2, weight: 0.2 }
    },
    'Thoughtful and Reflective': {
      valence: { expected: 0.4, weight: 0.3 },
      energy: { expected: 0.3, weight: 0.3 },
      acousticness: { expected: 0.6, weight: 0.4 }
    },
    'Adaptable and Variable': {
      valence: { expected: 0.55, weight: 0.4 },
      energy: { expected: 0.5, weight: 0.3 },
      acousticness: { expected: 0.4, weight: 0.3 }
    }
  };

  const profile = moodProfiles[moodProfile] || moodProfiles['Adaptable and Variable'];
  
  // Calculate weighted score with non-linear scaling
  const valenceScore = calculateFeatureScore(averageValence, profile.valence.expected, profile.valence.weight);
  const energyScore = calculateFeatureScore(averageEnergy, profile.energy.expected, profile.energy.weight);
  const acousticnessScore = calculateFeatureScore(averageAcousticness, profile.acousticness.expected, profile.acousticness.weight);
  
  return (valenceScore + energyScore + acousticnessScore) / 3;
}

function calculateEnergyMusicMatch(energyLevel: string, musicPatterns: any): number {
  const { averageEnergy, averageTempo, averageDanceability } = musicPatterns;
  
  const energyProfiles: { [key: string]: any } = {
    'High Energy and Active': {
      energy: { expected: 0.8, weight: 0.4 },
      tempo: { expected: 140, weight: 0.3 },
      danceability: { expected: 0.7, weight: 0.3 }
    },
    'High Energy': {
      energy: { expected: 0.7, weight: 0.5 },
      tempo: { expected: 130, weight: 0.3 },
      danceability: { expected: 0.6, weight: 0.2 }
    },
    'Low Energy and Relaxed': {
      energy: { expected: 0.3, weight: 0.5 },
      tempo: { expected: 90, weight: 0.3 },
      danceability: { expected: 0.3, weight: 0.2 }
    },
    'Moderate Energy': {
      energy: { expected: 0.5, weight: 0.4 },
      tempo: { expected: 120, weight: 0.3 },
      danceability: { expected: 0.5, weight: 0.3 }
    }
  };

  const profile = energyProfiles[energyLevel] || energyProfiles['Moderate Energy'];
  
  // Normalize tempo to 0-1 scale (assuming 60-200 BPM range)
  const normalizedTempo = Math.min(Math.max((averageTempo - 60) / 140, 0), 1);
  
  const energyScore = calculateFeatureScore(averageEnergy, profile.energy.expected, profile.energy.weight);
  const tempoScore = calculateFeatureScore(normalizedTempo, (profile.tempo.expected - 60) / 140, profile.tempo.weight);
  const danceabilityScore = calculateFeatureScore(averageDanceability, profile.danceability.expected, profile.danceability.weight);
  
  return (energyScore + tempoScore + danceabilityScore) / 3;
}

function calculateSocialMusicMatch(socialStyle: string, musicPatterns: any): number {
  const { averageDanceability, averageEnergy, averageLiveness } = musicPatterns;
  
  const socialProfiles: { [key: string]: any } = {
    'Extroverted and Social': {
      danceability: { expected: 0.8, weight: 0.4 },
      energy: { expected: 0.7, weight: 0.3 },
      liveness: { expected: 0.5, weight: 0.3 }
    },
    'Introverted and Private': {
      danceability: { expected: 0.3, weight: 0.4 },
      energy: { expected: 0.4, weight: 0.3 },
      liveness: { expected: 0.2, weight: 0.3 }
    },
    'Active and Outdoorsy': {
      danceability: { expected: 0.6, weight: 0.3 },
      energy: { expected: 0.7, weight: 0.4 },
      liveness: { expected: 0.4, weight: 0.3 }
    },
    'Balanced and Adaptable': {
      danceability: { expected: 0.5, weight: 0.4 },
      energy: { expected: 0.5, weight: 0.3 },
      liveness: { expected: 0.3, weight: 0.3 }
    }
  };

  const profile = socialProfiles[socialStyle] || socialProfiles['Balanced and Adaptable'];
  
  const danceabilityScore = calculateFeatureScore(averageDanceability, profile.danceability.expected, profile.danceability.weight);
  const energyScore = calculateFeatureScore(averageEnergy, profile.energy.expected, profile.energy.weight);
  const livenessScore = calculateFeatureScore(averageLiveness || 0.3, profile.liveness.expected, profile.liveness.weight);
  
  return (danceabilityScore + energyScore + livenessScore) / 3;
}

function calculateCreativityMusicMatch(creativityLevel: string, musicPatterns: any): number {
  const { averageInstrumentalness, averageAcousticness, averageSpeechiness } = musicPatterns;
  
  const creativityProfiles: { [key: string]: any } = {
    'Highly Creative and Exploratory': {
      instrumentalness: { expected: 0.6, weight: 0.4 },
      acousticness: { expected: 0.4, weight: 0.3 },
      speechiness: { expected: 0.1, weight: 0.3 }
    },
    'Comfort-Seeking and Traditional': {
      instrumentalness: { expected: 0.2, weight: 0.3 },
      acousticness: { expected: 0.6, weight: 0.4 },
      speechiness: { expected: 0.05, weight: 0.3 }
    },
    'Open to New Experiences': {
      instrumentalness: { expected: 0.5, weight: 0.4 },
      acousticness: { expected: 0.5, weight: 0.3 },
      speechiness: { expected: 0.08, weight: 0.3 }
    },
    'Moderately Creative': {
      instrumentalness: { expected: 0.4, weight: 0.4 },
      acousticness: { expected: 0.4, weight: 0.3 },
      speechiness: { expected: 0.06, weight: 0.3 }
    }
  };

  const profile = creativityProfiles[creativityLevel] || creativityProfiles['Moderately Creative'];
  
  const instrumentalnessScore = calculateFeatureScore(averageInstrumentalness, profile.instrumentalness.expected, profile.instrumentalness.weight);
  const acousticnessScore = calculateFeatureScore(averageAcousticness, profile.acousticness.expected, profile.acousticness.weight);
  const speechinessScore = calculateFeatureScore(averageSpeechiness || 0.05, profile.speechiness.expected, profile.speechiness.weight);
  
  return (instrumentalnessScore + acousticnessScore + speechinessScore) / 3;
}

// Enhanced feature scoring with non-linear scaling and better tolerance
function calculateFeatureScore(actual: number, expected: number, weight: number): number {
  const difference = Math.abs(actual - expected);
  
  // Use exponential decay for better tolerance of small differences
  // This gives higher scores for closer matches and more graceful degradation
  const score = Math.exp(-difference * 2) * weight;
  
  // Ensure score is between 0 and 1
  return Math.max(0, Math.min(1, score));
}

function generateInsightsAndRecommendations(
  personality: PersonalityProfile,
  musicPatterns: any,
  correlations: MusicCorrelation
): { insights: string[]; recommendations: string[] } {
  const insights: string[] = [];
  const recommendations: string[] = [];

  // Enhanced insights based on multi-dimensional correlations
  if (correlations.moodMusicMatch > 0.8) {
    insights.push("Your music choices perfectly reflect your mood profile!");
  } else if (correlations.moodMusicMatch > 0.6) {
    insights.push("Your music choices align well with your mood preferences.");
  } else if (correlations.moodMusicMatch < 0.4) {
    insights.push("Your music choices might be compensating for your mood - interesting!");
  }

  if (correlations.energyMusicMatch > 0.8) {
    insights.push("Your energy level and music energy are perfectly aligned.");
  } else if (correlations.energyMusicMatch > 0.6) {
    insights.push("Your music energy matches your lifestyle well.");
  } else if (correlations.energyMusicMatch < 0.4) {
    insights.push("You might be using music to balance your energy levels.");
  }

  if (correlations.socialMusicMatch > 0.8) {
    insights.push("Your social style and music preferences are in perfect harmony!");
  } else if (correlations.socialMusicMatch > 0.6) {
    insights.push("Your music choices complement your social preferences.");
  } else if (correlations.socialMusicMatch < 0.4) {
    insights.push("Your music might be helping you explore different social dynamics.");
  }

  if (correlations.creativityMusicMatch > 0.8) {
    insights.push("Your creative spirit shines through in your music choices!");
  } else if (correlations.creativityMusicMatch > 0.6) {
    insights.push("Your music reflects your creative personality well.");
  } else if (correlations.creativityMusicMatch < 0.4) {
    insights.push("You might enjoy exploring more experimental music genres.");
  }

  // Enhanced recommendations based on feature analysis
  const { averageValence, averageEnergy, averageDanceability, averageAcousticness, averageInstrumentalness, averageTempo } = musicPatterns;

  // Mood-based recommendations
  if (averageValence < 0.4 && personality.moodProfile.includes('Positive')) {
    recommendations.push("Try adding more upbeat tracks to boost your mood!");
  } else if (averageValence > 0.7 && personality.moodProfile.includes('Reflective')) {
    recommendations.push("Consider adding more contemplative tracks for deeper reflection.");
  }

  // Energy-based recommendations
  if (averageEnergy < 0.3 && personality.energyLevel.includes('High')) {
    recommendations.push("Consider adding higher energy tracks to match your active lifestyle.");
  } else if (averageEnergy > 0.7 && personality.energyLevel.includes('Relaxed')) {
    recommendations.push("Try adding more calming tracks for relaxation and focus.");
  }

  // Social-based recommendations
  if (averageDanceability < 0.4 && personality.socialStyle.includes('Social')) {
    recommendations.push("Add some danceable tracks for your social gatherings!");
  } else if (averageDanceability > 0.7 && personality.socialStyle.includes('Private')) {
    recommendations.push("Consider adding more intimate, low-key tracks for personal time.");
  }

  // Creativity-based recommendations
  if (averageAcousticness < 0.3 && personality.creativityLevel.includes('Traditional')) {
    recommendations.push("You might enjoy more acoustic and organic sounds.");
  } else if (averageAcousticness > 0.7 && personality.creativityLevel.includes('Exploratory')) {
    recommendations.push("Try exploring electronic and experimental genres for new experiences.");
  }

  if (averageInstrumentalness < 0.2 && personality.creativityLevel.includes('Exploratory')) {
    recommendations.push("Try exploring instrumental music for creative inspiration.");
  } else if (averageInstrumentalness > 0.6 && personality.creativityLevel.includes('Traditional')) {
    recommendations.push("Consider adding more vocal-driven tracks for emotional connection.");
  }

  // Lifestyle-based recommendations
  if (personality.lifestylePattern.includes('Productivity') && averageEnergy > 0.6) {
    recommendations.push("Try adding more ambient and focus-oriented tracks for work sessions.");
  } else if (personality.lifestylePattern.includes('Fun-Seeking') && averageEnergy < 0.5) {
    recommendations.push("Add some high-energy party tracks for your fun activities!");
  }

  if (personality.lifestylePattern.includes('Relaxation') && averageAcousticness < 0.4) {
    recommendations.push("Consider adding more soothing acoustic tracks for relaxation.");
  } else if (personality.lifestylePattern.includes('Discovery') && averageInstrumentalness < 0.3) {
    recommendations.push("Explore world music and diverse cultural sounds for discovery.");
  }

  // Tempo-based recommendations
  if (averageTempo > 140 && personality.energyLevel.includes('Relaxed')) {
    recommendations.push("Try adding slower tempo tracks for a more relaxed listening experience.");
  } else if (averageTempo < 100 && personality.energyLevel.includes('Active')) {
    recommendations.push("Add some faster-paced tracks to match your active lifestyle.");
  }

  // Ensure at least 2 recommendations
  if (recommendations.length < 2) {
    // Add general recommendations based on overall patterns
    if (averageValence < 0.5) {
      recommendations.push("Consider adding more positive and uplifting tracks to your playlist.");
    }
    if (averageEnergy < 0.4) {
      recommendations.push("Try incorporating more energetic tracks for variety.");
    }
    if (averageDanceability < 0.5) {
      recommendations.push("Add some groovy tracks to get you moving!");
    }
    if (averageAcousticness < 0.4) {
      recommendations.push("Explore acoustic and unplugged versions of your favorite songs.");
    }
    if (averageInstrumentalness < 0.3) {
      recommendations.push("Try adding instrumental tracks for background listening.");
    }
  }

  return { insights, recommendations };
}