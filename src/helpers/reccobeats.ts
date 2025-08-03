import { TrackAudioFeatures } from '../types/reccobeats/types';

export async function getAudioFeaturesByIds(
  spotifyTrackIds: string[],
  limit = 40
): Promise<TrackAudioFeatures[]> {
  try {
    const idsParam = limit <= 40 ? spotifyTrackIds.slice(0, limit).join(',') : spotifyTrackIds.slice(0, 40).join(',');
    const response = await fetch(`https://api.reccobeats.com/v1/audio-features?ids=${idsParam}`, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ReccoBeats API Error:', errorText);
      throw new Error(`ReccoBeats API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.content; // return array of TrackAudioFeatures
  } catch (error) {
    console.error('Error fetching from ReccoBeats API:', error);
    throw error; // Re-throw the error to maintain the Promise rejection
  }
}
