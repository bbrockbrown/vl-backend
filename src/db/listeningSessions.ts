import mongoose from 'mongoose';

const ListeningSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  trackId: { type: String, required: true }, // Spotify track ID
  playedAt: { type: Date, required: true },
  duration: { type: Number }, // listening duration in milliseconds
  source: { type: String, enum: ['recently_played', 'top_tracks', 'manual'], default: 'recently_played' },
  
  // Time-based data for analytics
  hourOfDay: { type: Number, min: 0, max: 23 },
  dayOfWeek: { type: Number, min: 0, max: 6 }, // 0 = Sunday
  month: { type: Number, min: 1, max: 12 },
  year: { type: Number },
  
  createdAt: { type: Date, default: Date.now },
});

// Indexes for efficient querying
ListeningSessionSchema.index({ userId: 1, playedAt: -1 });
ListeningSessionSchema.index({ userId: 1, hourOfDay: 1 });
ListeningSessionSchema.index({ userId: 1, dayOfWeek: 1 });
ListeningSessionSchema.index({ playedAt: 1 });

export const ListeningSessionModel = mongoose.model('ListeningSession', ListeningSessionSchema);

export const createListeningSession = (values: Record<string, any>) => 
  new ListeningSessionModel(values).save().then((session) => session.toObject());

export const getListeningSessionsByUser = (userId: string, limit = 1000) => 
  ListeningSessionModel.find({ userId }).sort({ playedAt: -1 }).limit(limit);

export const getListeningSessionsByDateRange = (userId: string, startDate: Date, endDate: Date) =>
  ListeningSessionModel.find({
    userId,
    playedAt: { $gte: startDate, $lte: endDate }
  }).sort({ playedAt: -1 });

export const getUniqueListeningDays = (userId: string, startDate: Date, endDate: Date) =>
  ListeningSessionModel.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        playedAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$playedAt' },
          month: { $month: '$playedAt' },
          day: { $dayOfMonth: '$playedAt' }
        }
      }
    },
    {
      $count: 'uniqueDays'
    }
  ]);

export const getListeningTimeByHour = (userId: string, startDate: Date, endDate: Date) =>
  ListeningSessionModel.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        playedAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$hourOfDay',
        totalDuration: { $sum: '$duration' },
        trackCount: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

export const getListeningTimeByDay = (userId: string, startDate: Date, endDate: Date) =>
  ListeningSessionModel.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        playedAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$dayOfWeek',
        totalDuration: { $sum: '$duration' },
        trackCount: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]); 