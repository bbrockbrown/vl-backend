import express from 'express';
import { 
  getListeningSessionsByUser, 
  getUniqueListeningDays, 
  getListeningTimeByHour, 
  getListeningTimeByDay 
} from '../db/listeningSessions';
import { getTracksBySpotifyIds } from '../db/tracks';
import { getMoodDistribution as getMoodDistributionHelper, calculateAudioFeatureCorrelations } from '../helpers/moodClassification';

export const getUserAnalytics = async (req: express.Request, res: express.Response) => {
  try {
    const user = req.identity;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const timeRange = req.query.timeRange as string || '30d'; // 7d, 30d, 90d, 1y
    const endDate = new Date();
    const startDate = new Date();

    // Calculate start date based on time range
    switch (timeRange) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    // Get listening sessions for the time range
    const sessions = await getListeningSessionsByUser(user._id.toString(), 1000);
    const filteredSessions = sessions.filter(s => 
      s.playedAt >= startDate && s.playedAt <= endDate
    );

    // Calculate basic metrics
    const totalTracks = filteredSessions.length;
    const totalDuration = filteredSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
    const totalHours = Math.round(totalDuration / (1000 * 60 * 60) * 10) / 10;

    // Get unique listening days
    const uniqueDaysResult = await getUniqueListeningDays(user._id.toString(), startDate, endDate);
    const activeDays = uniqueDaysResult[0]?.uniqueDays || 0;

    // Get average energy from tracks
    const trackIds = [...new Set(filteredSessions.map(s => s.trackId))];
    const tracks = await getTracksBySpotifyIds(trackIds);
    const avgEnergy = tracks.length > 0 
      ? Math.round(tracks.reduce((sum, track) => sum + (track.audioFeatures?.energy || 0), 0) / tracks.length * 10) / 10
      : 0;

    // Calculate trends (simple comparison with previous period)
    const previousStartDate = new Date(startDate);
    const previousEndDate = new Date(startDate);
    const periodLength = endDate.getTime() - startDate.getTime();
    previousStartDate.setTime(previousStartDate.getTime() - periodLength);
    previousEndDate.setTime(previousEndDate.getTime() - periodLength);

    const previousSessions = await getListeningSessionsByUser(user._id.toString(), 1000);
    const filteredPreviousSessions = previousSessions.filter(s => 
      s.playedAt >= previousStartDate && s.playedAt <= previousEndDate
    );

    const previousTotalTracks = filteredPreviousSessions.length;
    const previousTotalDuration = filteredPreviousSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
    const previousTotalHours = Math.round(previousTotalDuration / (1000 * 60 * 60) * 10) / 10;

    const tracksChange = previousTotalTracks > 0 
      ? Math.round(((totalTracks - previousTotalTracks) / previousTotalTracks) * 100)
      : 0;
    const hoursChange = previousTotalHours > 0 
      ? Math.round(((totalHours - previousTotalHours) / previousTotalHours) * 100)
      : 0;
    const daysChange = 0; // Would need to calculate previous active days

    res.json({
      overview: {
        totalTracks,
        totalHours,
        activeDays,
        avgEnergy,
        tracksChange,
        hoursChange,
        daysChange
      },
      timeRange
    });
  } catch (error) {
    console.error('Error getting user analytics:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
};

export const getListeningActivity = async (req: express.Request, res: express.Response) => {
  try {
    const user = req.identity;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const timeRange = req.query.timeRange as string || '1y';
    const endDate = new Date();
    const startDate = new Date();

    // Calculate start date
    switch (timeRange) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setFullYear(endDate.getFullYear() - 1);
    }

    // Get monthly data
    const sessions = await getListeningSessionsByUser(user._id.toString(), 10000);
    const filteredSessions = sessions.filter(s => 
      s.playedAt >= startDate && s.playedAt <= endDate
    );

    // Group by month
    const monthlyData = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      const monthSessions = filteredSessions.filter(s => 
        s.playedAt >= monthStart && s.playedAt <= monthEnd
      );
      
      const monthTracks = monthSessions.length;
      const monthDuration = monthSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
      const monthHours = Math.round(monthDuration / (1000 * 60 * 60) * 10) / 10;
      
      monthlyData.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        tracks: monthTracks,
        hours: monthHours
      });
      
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    res.json({
      monthlyData,
      timeRange
    });
  } catch (error) {
    console.error('Error getting listening activity:', error);
    res.status(500).json({ error: 'Failed to get listening activity' });
  }
};

export const getMoodDistribution = async (req: express.Request, res: express.Response) => {
  try {
    const user = req.identity;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const timeRange = req.query.timeRange as string || '30d';
    const endDate = new Date();
    const startDate = new Date();

    // Calculate start date
    switch (timeRange) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    // Get sessions and tracks
    const sessions = await getListeningSessionsByUser(user._id.toString(), 1000);
    const filteredSessions = sessions.filter(s => 
      s.playedAt >= startDate && s.playedAt <= endDate
    );

    const trackIds = [...new Set(filteredSessions.map(s => s.trackId))];
    const tracks = await getTracksBySpotifyIds(trackIds);

    // Calculate mood distribution
    const moodDistribution = getMoodDistributionHelper(tracks);

    // Calculate average energy and valence
    const tracksWithMood = tracks.filter(t => t.mood?.primary);
    const avgEnergy = tracksWithMood.length > 0 
      ? Math.round(tracksWithMood.reduce((sum, track) => sum + (track.mood?.energy || 0), 0) / tracksWithMood.length * 100) / 100
      : 0;
    const avgValence = tracksWithMood.length > 0 
      ? Math.round(tracksWithMood.reduce((sum, track) => sum + (track.mood?.valence || 0), 0) / tracksWithMood.length * 100) / 100
      : 0;

    res.json({
      moodDistribution,
      avgEnergy,
      avgValence,
      timeRange
    });
  } catch (error) {
    console.error('Error getting mood distribution:', error);
    res.status(500).json({ error: 'Failed to get mood distribution' });
  }
};

export const getListeningPatterns = async (req: express.Request, res: express.Response) => {
  try {
    const user = req.identity;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const timeRange = req.query.timeRange as string || '30d';
    const endDate = new Date();
    const startDate = new Date();

    // Calculate start date
    switch (timeRange) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    // Get time patterns
    const hourPatterns = await getListeningTimeByHour(user._id.toString(), startDate, endDate);
    const dayPatterns = await getListeningTimeByDay(user._id.toString(), startDate, endDate);

    // Convert to percentage format
    const totalHourDuration = hourPatterns.reduce((sum, pattern) => sum + pattern.totalDuration, 0);
    const totalDayDuration = dayPatterns.reduce((sum, pattern) => sum + pattern.totalDuration, 0);

    const timeOfDay = hourPatterns.map(pattern => ({
      hour: pattern._id,
      percentage: totalHourDuration > 0 ? Math.round((pattern.totalDuration / totalHourDuration) * 100) : 0,
      duration: pattern.totalDuration
    }));

    const dayOfWeek = dayPatterns.map(pattern => ({
      day: pattern._id,
      percentage: totalDayDuration > 0 ? Math.round((pattern.totalDuration / totalDayDuration) * 100) : 0,
      duration: pattern.totalDuration
    }));

    // Find peak times
    const peakHour = timeOfDay.reduce((a, b) => a.percentage > b.percentage ? a : b);
    const peakDay = dayOfWeek.reduce((a, b) => a.percentage > b.percentage ? a : b);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    res.json({
      timeOfDay,
      dayOfWeek: dayOfWeek.map(d => ({ ...d, dayName: dayNames[d.day] })),
      peakTime: `${peakHour.hour}:00`,
      peakDay: dayNames[peakDay.day],
      timeRange
    });
  } catch (error) {
    console.error('Error getting listening patterns:', error);
    res.status(500).json({ error: 'Failed to get listening patterns' });
  }
};

export const getAudioFeaturesCorrelation = async (req: express.Request, res: express.Response) => {
  try {
    const user = req.identity;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const timeRange = req.query.timeRange as string || '30d';
    const endDate = new Date();
    const startDate = new Date();

    // Calculate start date
    switch (timeRange) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    // Get sessions and tracks
    const sessions = await getListeningSessionsByUser(user._id.toString(), 1000);
    const filteredSessions = sessions.filter(s => 
      s.playedAt >= startDate && s.playedAt <= endDate
    );

    const trackIds = [...new Set(filteredSessions.map(s => s.trackId))];
    const tracks = await getTracksBySpotifyIds(trackIds);

    // Calculate correlations
    const correlations = calculateAudioFeatureCorrelations(tracks);

    // Find strongest correlation
    const strongestCorrelation = correlations[0] || { feature1: '', feature2: '', correlation: 0 };

    res.json({
      correlations: correlations.slice(0, 6), // Top 6 correlations
      strongestCorrelation,
      totalRelationships: correlations.length,
      timeRange
    });
  } catch (error) {
    console.error('Error getting audio features correlation:', error);
    res.status(500).json({ error: 'Failed to get audio features correlation' });
  }
}; 