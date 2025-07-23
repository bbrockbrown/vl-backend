import mongoose from 'mongoose';

const MoodEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  mood: { type: String, required: true },
  note: { type: String },
  trackIds: [ { type: String } ],
  createdAt: { type: Date, default: Date.now },
});

export const MoodEntryModel = mongoose.model('MoodEntry', MoodEntrySchema);

export const getMoodEntries = () => MoodEntryModel.find();
export const getMoodEntryByUser = (userId: string) => MoodEntryModel.find({ userId }).sort({ date: -1 });
export const createMoodEntry = (values: Record<string, any>) => new MoodEntryModel(values).save()
  .then((moodEntry) => moodEntry.toObject());
export const deleteMoodEntryById = (id: string) => MoodEntryModel.findOneAndDelete({ _id: id });
export const deleteUserMoodEntriesByEmotion = (userId: string, mood: string) => MoodEntryModel.deleteMany({ userId, mood })
export const updateMoodEntryById = (id: string, values: Record<string, any>) => MoodEntryModel.findByIdAndUpdate(id, values);