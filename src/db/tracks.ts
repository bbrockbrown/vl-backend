import mongoose from 'mongoose';

const TrackSchema = new mongoose.Schema({
  spotifyId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  artist: { type: String, required: true },
  album: { type: String },
  duration: { type: Number }, // in milliseconds
  popularity: { type: Number },
  
  // Audio features from Spotify/ReccoBeats
  audioFeatures: {
    danceability: { type: Number },
    energy: { type: Number },
    valence: { type: Number },
    acousticness: { type: Number },
    instrumentalness: { type: Number },
    liveness: { type: Number },
    speechiness: { type: Number },
    tempo: { type: Number },
    loudness: { type: Number },
    key: { type: Number },
    mode: { type: Number },
    time_signature: { type: Number },
  },

  // Calculated mood classification
  mood: {
    primary: { type: String, enum: ['Energetic', 'Happy', 'Chill', 'Melancholic', 'Aggressive'] },
    confidence: { type: Number, min: 0, max: 1 },
    valence: { type: Number },
    energy: { type: Number },
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const TrackModel = mongoose.model('Track', TrackSchema);

export const getTrackBySpotifyId = (spotifyId: string) => TrackModel.findOne({ spotifyId });
export const createTrack = (values: Record<string, any>) => new TrackModel(values).save()
  .then((track) => track.toObject());
export const updateTrackBySpotifyId = (spotifyId: string, values: Record<string, any>) => 
  TrackModel.findOneAndUpdate({ spotifyId }, { ...values, updatedAt: new Date() }, { new: true });
export const getTracksBySpotifyIds = (spotifyIds: string[]) => TrackModel.find({ spotifyId: { $in: spotifyIds } }); 