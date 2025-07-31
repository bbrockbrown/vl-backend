export type AudioFeature = number | null;

export interface TrackAudioFeatures {
  id: string; // different from Spotify ID
  acousticness: AudioFeature;
  danceability: AudioFeature;
  energy: AudioFeature;
  instrumentalness: AudioFeature;
  liveness: AudioFeature;
  loudness: AudioFeature;
  speechiness: AudioFeature;
  tempo: AudioFeature;
  valence: AudioFeature;
}
