interface AudioFeatures {
  valence: number;
  energy: number;
  danceability: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  speechiness: number;
  tempo: number;
}

interface MoodClassification {
  primary: string;
  confidence: number;
  valence: number;
  energy: number;
}

export function classifyTrackMood(audioFeatures: AudioFeatures): MoodClassification {
  const { valence, energy, danceability, acousticness, instrumentalness, liveness, speechiness, tempo } = audioFeatures;

  // Define mood thresholds and characteristics using audio features
  const moodDefinitions = {
    Energetic: {
      energy: { min: 0.7, weight: 0.25 },
      tempo: { min: 140, weight: 0.2 },
      danceability: { min: 0.6, weight: 0.2 },
      valence: { min: 0.4, weight: 0.15 },
      liveness: { min: 0.3, weight: 0.1 },
      speechiness: { min: 0, max: 0.2, weight: 0.1 }
    },
    Happy: {
      valence: { min: 0.7, weight: 0.3 },
      energy: { min: 0.5, weight: 0.2 },
      danceability: { min: 0.5, weight: 0.2 },
      liveness: { min: 0.2, weight: 0.15 },
      speechiness: { min: 0, max: 0.3, weight: 0.1 },
      acousticness: { min: 0, max: 0.4, weight: 0.05 }
    },
    Chill: {
      energy: { min: 0, max: 0.5, weight: 0.25 },
      acousticness: { min: 0.3, weight: 0.25 },
      valence: { min: 0.3, max: 0.7, weight: 0.2 },
      instrumentalness: { min: 0.2, weight: 0.15 },
      liveness: { min: 0, max: 0.4, weight: 0.1 },
      speechiness: { min: 0, max: 0.15, weight: 0.05 }
    },
    Melancholic: {
      valence: { min: 0, max: 0.3, weight: 0.3 },
      energy: { min: 0, max: 0.5, weight: 0.2 },
      acousticness: { min: 0.3, weight: 0.2 },
      instrumentalness: { min: 0.2, weight: 0.15 },
      liveness: { min: 0, max: 0.2, weight: 0.1 },
      speechiness: { min: 0, max: 0.1, weight: 0.05 }
    },
    Aggressive: {
      energy: { min: 0.7, weight: 0.25 },
      valence: { min: 0, max: 0.4, weight: 0.2 },
      tempo: { min: 140, weight: 0.2 },
      liveness: { min: 0.3, weight: 0.15 },
      speechiness: { min: 0.05, weight: 0.1 },
      instrumentalness: { min: 0, max: 0.2, weight: 0.1 }
    },
    Intimate: {
      acousticness: { min: 0.4, weight: 0.3 },
      instrumentalness: { min: 0.2, weight: 0.25 },
      energy: { min: 0, max: 0.4, weight: 0.2 },
      liveness: { min: 0, max: 0.3, weight: 0.15 },
      speechiness: { min: 0, max: 0.1, weight: 0.1 }
    },
    Dynamic: {
      liveness: { min: 0.3, weight: 0.25 },
      energy: { min: 0.5, weight: 0.2 },
      danceability: { min: 0.3, weight: 0.2 },
      speechiness: { min: 0.1, weight: 0.15 },
      tempo: { min: 110, weight: 0.15 },
      valence: { min: 0.3, max: 0.7, weight: 0.05 }
    }
  };

  // Calculate scores for each mood
  const moodScores: { [key: string]: number } = {};

  Object.entries(moodDefinitions).forEach(([mood, criteria]) => {
    let score = 0;
    let totalWeight = 0;

    Object.entries(criteria).forEach(([feature, config]) => {
      const featureValue = audioFeatures[feature as keyof AudioFeatures] as number;
      const { min, max, weight } = config as { min: number; max?: number; weight: number };

      let featureScore = 0;
      if (max !== undefined) {
        // Range-based scoring
        if (featureValue >= min && featureValue <= max) {
          featureScore = 1;
        } else {
          featureScore = Math.max(0, 1 - Math.abs(featureValue - (min + max) / 2) / ((max - min) / 2));
        }
      } else {
        // Threshold-based scoring
        if (featureValue >= min) {
          featureScore = 1;
        } else {
          featureScore = Math.max(0, featureValue / min);
        }
      }

      score += featureScore * weight;
      totalWeight += weight;
    });

    moodScores[mood] = totalWeight > 0 ? score / totalWeight : 0;
  });

  // Find the mood with highest score
  const primaryMood = Object.entries(moodScores).reduce((a, b) => 
    moodScores[a[0]] > moodScores[b[0]] ? a : b
  )[0];

  const confidence = moodScores[primaryMood];

  return {
    primary: primaryMood,
    confidence,
    valence,
    energy
  };
}

export function getMoodDistribution(tracks: any[]): { [key: string]: number } {
  const moodCounts: { [key: string]: number } = {};
  
  // Only count tracks that have mood classifications
  const tracksWithMood = tracks.filter(track => track.mood?.primary);
  const totalTracksWithMood = tracksWithMood.length;

  tracksWithMood.forEach(track => {
    if (track.mood?.primary) {
      moodCounts[track.mood.primary] = (moodCounts[track.mood.primary] || 0) + 1;
    }
  });

  // Convert to percentages based on tracks with mood only
  const distribution: { [key: string]: number } = {};
  Object.entries(moodCounts).forEach(([mood, count]) => {
    distribution[mood] = totalTracksWithMood > 0 ? Math.round((count / totalTracksWithMood) * 100) : 0;
  });

  return distribution;
}

export async function enrichTracksWithAudioFeaturesAndMood(tracks: any[], spotifyHelper: any): Promise<any[]> {
  // Get audio features for tracks that need them
  const trackIds = tracks.map(track => track.spotifyId);
  const audioFeatures = await spotifyHelper.getAudioFeaturesByIds(trackIds);
  
  // Since ReccoBeats returns different IDs and fewer features than requested,
  // need to map by position/index for the available features
  const enrichedTracks = tracks.map((track, index) => {
    // Check if we have audio features for this position
    if (index < audioFeatures.length) {
      const audioFeaturesForTrack = audioFeatures[index];
      
      if (audioFeaturesForTrack && audioFeaturesForTrack.id) {
        // Use position-based mapping (trust that ReccoBeats returns in order)
        const moodClassification = classifyTrackMood(audioFeaturesForTrack);
        return {
          ...track,
          audioFeatures: audioFeaturesForTrack,
          mood: moodClassification
        };
      } else {
        // Create fallback audio features with null values
        const fallbackFeatures = {
          id: track.spotifyId,
          acousticness: null,
          danceability: null,
          energy: null,
          instrumentalness: null,
          liveness: null,
          loudness: null,
          speechiness: null,
          tempo: null,
          valence: null
        };
        return {
          ...track,
          audioFeatures: fallbackFeatures,
          mood: null
        };
      }
    } else {
      // No audio features available for this position (beyond what ReccoBeats returned)
      const fallbackFeatures = {
        id: track.spotifyId,
        acousticness: null,
        danceability: null,
        energy: null,
        instrumentalness: null,
        liveness: null,
        loudness: null,
        speechiness: null,
        tempo: null,
        valence: null
      };
      return {
        ...track,
        audioFeatures: fallbackFeatures,
        mood: null
      };
    }
  });
  
  return enrichedTracks;
}

export function calculateAudioFeatureCorrelations(tracks: any[]): Array<{
  feature1: string;
  feature2: string;
  correlation: number;
}> {
  const features = ['valence', 'energy', 'danceability', 'acousticness', 'instrumentalness', 'liveness', 'speechiness', 'tempo'];
  const correlations: Array<{ feature1: string; feature2: string; correlation: number }> = [];

  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const feature1 = features[i];
      const feature2 = features[j];

      const values1 = tracks.map(t => t.audioFeatures?.[feature1]).filter(v => v !== undefined);
      const values2 = tracks.map(t => t.audioFeatures?.[feature2]).filter(v => v !== undefined);

      if (values1.length > 0 && values2.length > 0) {
        const correlation = calculateCorrelation(values1, values2);
        correlations.push({
          feature1,
          feature2,
          correlation
        });
      }
    }
  }

  return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
}

// Calculate correlation using Pearson's correlation coefficient 
function calculateCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);                     // # data points
  if (n === 0) return 0;

  const sumX = x.reduce((a, b) => a + b, 0);                  // sum x
  const sumY = y.reduce((a, b) => a + b, 0);                  // sum y
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0); // sum x * y
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);      // sum x²
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);      // sum y²

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
} 