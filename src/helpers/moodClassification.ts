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

  // Define mood thresholds and characteristics
  const moodDefinitions = {
    Energetic: {
      energy: { min: 0.7, weight: 0.4 },
      tempo: { min: 140, weight: 0.3 },
      danceability: { min: 0.6, weight: 0.3 },
      valence: { min: 0.4, weight: 0.2 }
    },
    Happy: {
      valence: { min: 0.7, weight: 0.5 },
      energy: { min: 0.5, weight: 0.3 },
      danceability: { min: 0.5, weight: 0.2 }
    },
    Chill: {
      energy: { min: 0, max: 0.4, weight: 0.4 },
      acousticness: { min: 0.5, weight: 0.3 },
      valence: { min: 0.3, max: 0.7, weight: 0.3 }
    },
    Melancholic: {
      valence: { min: 0, max: 0.3, weight: 0.5 },
      energy: { min: 0, max: 0.5, weight: 0.3 },
      acousticness: { min: 0.3, weight: 0.2 }
    },
    Aggressive: {
      energy: { min: 0.8, weight: 0.4 },
      valence: { min: 0, max: 0.4, weight: 0.3 },
      tempo: { min: 150, weight: 0.3 }
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
  const totalTracks = tracks.length;

  tracks.forEach(track => {
    if (track.mood?.primary) {
      moodCounts[track.mood.primary] = (moodCounts[track.mood.primary] || 0) + 1;
    }
  });

  // Convert to percentages
  const distribution: { [key: string]: number } = {};
  Object.entries(moodCounts).forEach(([mood, count]) => {
    distribution[mood] = Math.round((count / totalTracks) * 100);
  });

  return distribution;
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

function calculateCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
} 