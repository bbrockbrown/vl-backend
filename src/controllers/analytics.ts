import express from 'express';
import { 
  getListeningSessionsByUser, 
  getUniqueListeningDays, 
  getListeningTimeByHour, 
  getListeningTimeByDay 
} from '../db/listeningSessions';
import { getTracksBySpotifyIds } from '../db/tracks';
import { getMoodDistribution as getMoodDistributionHelper, calculateAudioFeatureCorrelations, enrichTracksWithAudioFeaturesAndMood } from '../helpers/moodClassification';

export const getUserAnalytics = async (req: express.Request, res: express.Response) => {
  try {
    const user = req.identity;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const timeRange = req.query.timeRange as string || '30d'; // 7d, 30d, 90d, 1y
    const endDate = new Date();
    const startDate = new Date();

    console.log('=== getUserAnalytics Debug ===');
    console.log('User ID:', user._id.toString());
    console.log('Time Range:', timeRange);
    console.log('Start Date:', startDate.toISOString());
    console.log('End Date:', endDate.toISOString());

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
    console.log('Total sessions fetched:', sessions.length);
    
    const filteredSessions = sessions.filter(s => 
      s.playedAt >= startDate && s.playedAt <= endDate
    );
    console.log('Filtered sessions in time range:', filteredSessions.length);

    // Calculate basic metrics
    const totalTracks = filteredSessions.length;
    const totalDuration = filteredSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
    const totalHours = Math.round(totalDuration / (1000 * 60 * 60) * 10) / 10;
    
    console.log('Total tracks:', totalTracks);
    console.log('Total duration (ms):', totalDuration);
    console.log('Total hours:', totalHours);

    // Get unique listening days
    const uniqueDaysResult = await getUniqueListeningDays(user._id.toString(), startDate, endDate);
    const activeDays = uniqueDaysResult[0]?.uniqueDays || 0;
    console.log('Active days:', activeDays);
    console.log('Unique days result:', uniqueDaysResult);

    // Get average energy from tracks with audio features
    const trackIds = [...new Set(filteredSessions.map(s => s.trackId))];
    console.log('Unique track IDs:', trackIds.length);
    console.log('Sample track IDs:', trackIds.slice(0, 5));
    
    const tracks = await getTracksBySpotifyIds(trackIds);
    console.log('Tracks fetched from DB:', tracks.length);
    
    // Enrich tracks with audio features from Spotify API
    const spotifyHelper = res.locals.spotifyHelper;
    console.log('Enriching tracks with audio features...');
    const enrichedTracks = await enrichTracksWithAudioFeaturesAndMood(tracks, spotifyHelper);
    console.log('Tracks after enrichment:', enrichedTracks.length);
    
    // Filter tracks that have audio features and calculate average energy
    const tracksWithAudioFeatures = enrichedTracks.filter(track => track.audioFeatures?.energy !== undefined && track.audioFeatures?.energy !== null);
    console.log('Tracks with audio features:', tracksWithAudioFeatures.length);
    console.log('Tracks without audio features:', enrichedTracks.length - tracksWithAudioFeatures.length);
    
    if (tracksWithAudioFeatures.length > 0) {
      console.log('Sample energy values:', tracksWithAudioFeatures.slice(0, 5).map(t => t.audioFeatures?.energy));
    }
    
    const avgEnergy = tracksWithAudioFeatures.length > 0 
      ? Math.round(tracksWithAudioFeatures.reduce((sum, track) => sum + (track.audioFeatures!.energy || 0), 0) / tracksWithAudioFeatures.length * 100) / 100
      : 0;
    
    console.log('Average energy:', avgEnergy);

    // Calculate trends (simple comparison with previous period)
    const previousStartDate = new Date(startDate);
    const previousEndDate = new Date(startDate);
    const periodLength = endDate.getTime() - startDate.getTime();
    previousStartDate.setTime(previousStartDate.getTime() - periodLength);
    previousEndDate.setTime(previousEndDate.getTime() - periodLength);
    
    console.log('Previous period - Start:', previousStartDate.toISOString());
    console.log('Previous period - End:', previousEndDate.toISOString());

    const previousSessions = await getListeningSessionsByUser(user._id.toString(), 1000);
    const filteredPreviousSessions = previousSessions.filter(s => 
      s.playedAt >= previousStartDate && s.playedAt <= previousEndDate
    );
    console.log('Previous period sessions:', filteredPreviousSessions.length);

    const previousTotalTracks = filteredPreviousSessions.length;
    const previousTotalDuration = filteredPreviousSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
    const previousTotalHours = Math.round(previousTotalDuration / (1000 * 60 * 60) * 10) / 10;
    
    console.log('Previous total tracks:', previousTotalTracks);
    console.log('Previous total hours:', previousTotalHours);

    // Calculate previous period energy for comparison
    const previousTrackIds = [...new Set(filteredPreviousSessions.map(s => s.trackId))];
    console.log('Previous unique track IDs:', previousTrackIds.length);
    
    const previousTracks = await getTracksBySpotifyIds(previousTrackIds);
    console.log('Previous tracks fetched from DB:', previousTracks.length);
    
    // Enrich previous tracks with audio features
    let previousEnrichedTracks: any[] = [];
    if (previousTracks.length > 0) {
      console.log('Enriching previous tracks with audio features...');
      previousEnrichedTracks = await enrichTracksWithAudioFeaturesAndMood(previousTracks, spotifyHelper);
      console.log('Previous tracks after enrichment:', previousEnrichedTracks.length);
    }
    
    const previousTracksWithAudioFeatures = previousEnrichedTracks.filter(track => track.audioFeatures?.energy !== undefined && track.audioFeatures?.energy !== null);
    console.log('Previous tracks with audio features:', previousTracksWithAudioFeatures.length);
    
    const previousAvgEnergy = previousTracksWithAudioFeatures.length > 0 
      ? Math.round(previousTracksWithAudioFeatures.reduce((sum, track) => sum + (track.audioFeatures!.energy || 0), 0) / previousTracksWithAudioFeatures.length * 100) / 100
      : 0;
    
    console.log('Previous average energy:', previousAvgEnergy);

    const tracksChange = previousTotalTracks > 0 
      ? Math.round(((totalTracks - previousTotalTracks) / previousTotalTracks) * 100)
      : 0;
    const hoursChange = previousTotalHours > 0 
      ? Math.round(((totalHours - previousTotalHours) / previousTotalHours) * 100)
      : 0;
    const energyChange = previousAvgEnergy > 0 
      ? Math.round(((avgEnergy - previousAvgEnergy) / previousAvgEnergy) * 100)
      : 0;
    const daysChange = 0; // Would need to calculate previous active days
    
    console.log('=== Change Calculations ===');
    console.log('Tracks change:', tracksChange + '%');
    console.log('Hours change:', hoursChange + '%');
    console.log('Energy change:', energyChange + '%');
    console.log('Days change:', daysChange + '%');

    const response = {
      overview: {
        totalTracks,
        totalHours,
        activeDays,
        avgEnergy,
        tracksChange,
        hoursChange,
        energyChange,
        daysChange
      },
      timeRange
    };
    
    console.log('=== Final Response ===');
    console.log('Response:', JSON.stringify(response, null, 2));
    console.log('=== End getUserAnalytics Debug ===');
    
    res.json(response);
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
    console.log('currentDate', currentDate);
    console.log('endDate', endDate);
    
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

    // Enrich tracks with audio features and mood data
    const spotifyHelper = res.locals.spotifyHelper;
    const enrichedTracks = await enrichTracksWithAudioFeaturesAndMood(tracks, spotifyHelper);

    // Calculate mood distribution
    const moodDistribution = getMoodDistributionHelper(enrichedTracks);

    // Calculate average energy and valence from enriched tracks
    const tracksWithMood = enrichedTracks.filter(t => t.mood?.primary);
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

    // Enrich tracks with audio features and mood data
    const spotifyHelper = res.locals.spotifyHelper;
    const enrichedTracks = await enrichTracksWithAudioFeaturesAndMood(tracks, spotifyHelper);

    // Calculate correlations using enriched tracks
    const correlations = calculateAudioFeatureCorrelations(enrichedTracks);

    // Find strongest correlation
    const strongestCorrelation = correlations[0] || { feature1: '', feature2: '', correlation: 0 };

    // Calculate most influential feature (appears most in top correlations)
    const featureCounts: { [key: string]: number } = {};
    correlations.slice(0, 10).forEach(corr => {
      featureCounts[corr.feature1] = (featureCounts[corr.feature1] || 0) + 1;
      featureCounts[corr.feature2] = (featureCounts[corr.feature2] || 0) + 1;
    });
    const mostInfluential = Object.entries(featureCounts).reduce((a, b) => 
      featureCounts[a[0]] > featureCounts[b[0]] ? a : b
    )[0];

    res.json({
      correlations: correlations, // Top 10 correlations
      strongestCorrelation,
      mostInfluential,
      totalRelationships: correlations.length,
      timeRange
    });
  } catch (error) {
    console.error('Error getting audio features correlation:', error);
    res.status(500).json({ error: 'Failed to get audio features correlation' });
  }
};

export const getUserTrackIds = async (req: express.Request, res: express.Response) => {
  try {
    const user = req.identity;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const timeRange = req.query.timeRange as string || '30d';
    const limit = parseInt(req.query.limit as string) || 50;
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

    // Get listening sessions for the time range
    const sessions = await getListeningSessionsByUser(user._id.toString(), 1000);
    const filteredSessions = sessions.filter(s => 
      s.playedAt >= startDate && s.playedAt <= endDate
    );

    // Get unique track IDs, limited by the specified limit
    const trackIds = [...new Set(filteredSessions.map(s => s.trackId))].slice(0, limit);

    res.json({
      trackIds,
      timeRange,
      totalTracks: filteredSessions.length,
      uniqueTracks: trackIds.length
    });
  } catch (error) {
    console.error('Error getting user track IDs:', error);
    res.status(500).json({ error: 'Failed to get user track IDs' });
  }
};

// New consolidated analytics endpoint
export const getConsolidatedAnalytics = async (req: express.Request, res: express.Response) => {
  try {
    const user = req.identity;
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const timeRange = req.query.timeRange as string || '30d';
    const endDate = new Date();
    const startDate = new Date();

    console.log('=== getConsolidatedAnalytics Debug ===');
    console.log('User ID:', user._id.toString());
    console.log('Time Range:', timeRange);

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

    console.log('Start Date:', startDate.toISOString());
    console.log('End Date:', endDate.toISOString());

    // Get listening sessions for the time range (consistent 1000 sessions)
    const sessions = await getListeningSessionsByUser(user._id.toString(), 1000);
    const filteredSessions = sessions.filter(s => 
      s.playedAt >= startDate && s.playedAt <= endDate
    );
    console.log('Filtered sessions in time range:', filteredSessions.length);

    // Get unique track IDs and fetch tracks
    const trackIds = [...new Set(filteredSessions.map(s => s.trackId))];
    console.log('Unique track IDs:', trackIds.length);
    
    const tracks = await getTracksBySpotifyIds(trackIds);
    console.log('Tracks fetched from DB:', tracks.length);

    // Enrich tracks with audio features and mood data (consistent enrichment)
    const spotifyHelper = res.locals.spotifyHelper;
    console.log('Enriching tracks with audio features and mood...');
    const enrichedTracks = await enrichTracksWithAudioFeaturesAndMood(tracks, spotifyHelper);
    console.log('Tracks after enrichment:', enrichedTracks.length);

    // 1. Overview Analytics
    const totalTracks = filteredSessions.length;
    const totalDuration = filteredSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
    const totalHours = Math.round(totalDuration / (1000 * 60 * 60) * 10) / 10;
    
    const uniqueDaysResult = await getUniqueListeningDays(user._id.toString(), startDate, endDate);
    const activeDays = uniqueDaysResult[0]?.uniqueDays || 0;
    
    const tracksWithAudioFeatures = enrichedTracks.filter(track => track.audioFeatures?.energy !== undefined && track.audioFeatures?.energy !== null);
    const avgEnergy = tracksWithAudioFeatures.length > 0 
      ? Math.round(tracksWithAudioFeatures.reduce((sum, track) => sum + (track.audioFeatures!.energy || 0), 0) / tracksWithAudioFeatures.length * 100) / 100
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

    const previousTrackIds = [...new Set(filteredPreviousSessions.map(s => s.trackId))];
    const previousTracks = await getTracksBySpotifyIds(previousTrackIds);
    let previousEnrichedTracks: any[] = [];
    if (previousTracks.length > 0) {
      previousEnrichedTracks = await enrichTracksWithAudioFeaturesAndMood(previousTracks, spotifyHelper);
    }
    
    const previousTracksWithAudioFeatures = previousEnrichedTracks.filter(track => track.audioFeatures?.energy !== undefined && track.audioFeatures?.energy !== null);
    const previousAvgEnergy = previousTracksWithAudioFeatures.length > 0 
      ? Math.round(previousTracksWithAudioFeatures.reduce((sum, track) => sum + (track.audioFeatures!.energy || 0), 0) / previousTracksWithAudioFeatures.length * 100) / 100
      : 0;

    const tracksChange = previousTotalTracks > 0 
      ? Math.round(((totalTracks - previousTotalTracks) / previousTotalTracks) * 100)
      : 0;
    const hoursChange = previousTotalHours > 0 
      ? Math.round(((totalHours - previousTotalHours) / previousTotalHours) * 100)
      : 0;
    const energyChange = previousAvgEnergy > 0 
      ? Math.round(((avgEnergy - previousAvgEnergy) / previousAvgEnergy) * 100)
      : 0;
    const daysChange = 0; // Would need to calculate previous active days

    const overview = {
      totalTracks,
      totalHours,
      activeDays,
      avgEnergy,
      tracksChange,
      hoursChange,
      energyChange,
      daysChange
    };

    // 2. Mood Distribution
    const moodDistribution = getMoodDistributionHelper(enrichedTracks);
    const tracksWithMood = enrichedTracks.filter(t => t.mood?.primary);
    const avgValence = tracksWithMood.length > 0 
      ? Math.round(tracksWithMood.reduce((sum, track) => sum + (track.mood?.valence || 0), 0) / tracksWithMood.length * 100) / 100
      : 0;

    // 3. Listening Activity (monthly data for the time range)
    const monthlyData = [];
    const currentDate = new Date(startDate);
    console.log('startDate', startDate);
    console.log('endDate', endDate);
    console.log('currentDate', currentDate)
    
    while (currentDate <= endDate) {
      const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      console.log('monthStart', monthStart);
      console.log('monthEnd', monthEnd);
      
      const monthSessions = filteredSessions.filter(s => 
        s.playedAt >= monthStart && s.playedAt <= monthEnd
      );

      console.log('monthSessions', monthSessions);
      
      const monthTracks = monthSessions.length;
      const monthDuration = monthSessions.reduce((sum, session) => sum + (session.duration || 0), 0);
      const monthHours = Math.round(monthDuration / (1000 * 60 * 60) * 10) / 10;
      
      monthlyData.push({
        month: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        tracks: monthTracks,
        hours: monthHours
      });
      
      currentDate.setMonth(currentDate.getMonth() + 1);
      currentDate.setDate(currentDate.getDate() - 2);
      console.log("New currentDate", currentDate);
    }

    // 4. Listening Patterns
    const hourPatterns = await getListeningTimeByHour(user._id.toString(), startDate, endDate);
    const dayPatterns = await getListeningTimeByDay(user._id.toString(), startDate, endDate);

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

    const peakHour = timeOfDay.reduce((a, b) => a.percentage > b.percentage ? a : b);
    const peakDay = dayOfWeek.reduce((a, b) => a.percentage > b.percentage ? a : b);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const listeningPatterns = {
      timeOfDay,
      dayOfWeek: dayOfWeek.map(d => ({ ...d, dayName: dayNames[d.day] })),
      peakTime: `${peakHour.hour}:00`,
      peakDay: dayNames[peakDay.day]
    };

    // 5. Audio Features Correlation
    const correlations = calculateAudioFeatureCorrelations(enrichedTracks);
    const strongestCorrelation = correlations[0] || { feature1: '', feature2: '', correlation: 0 };

    const featureCounts: { [key: string]: number } = {};
    correlations.slice(0, 10).forEach(corr => {
      featureCounts[corr.feature1] = (featureCounts[corr.feature1] || 0) + 1;
      featureCounts[corr.feature2] = (featureCounts[corr.feature2] || 0) + 1;
    });
    const mostInfluential = Object.entries(featureCounts).reduce((a, b) => 
      featureCounts[a[0]] > featureCounts[b[0]] ? a : b
    )[0];

    const audioFeaturesCorrelation = {
      correlations: correlations,
      strongestCorrelation,
      mostInfluential,
      totalRelationships: correlations.length,
      timeRange
    };

    // 6. Audio Features Radar (using same enriched tracks)
    const audioFeaturesRadar = [
      {
        name: 'Instrumentalness',
        value: tracksWithAudioFeatures.length > 0 
          ? tracksWithAudioFeatures.reduce((sum, track) => sum + (track.audioFeatures?.instrumentalness || 0), 0) / tracksWithAudioFeatures.length
          : 0,
        color: '#3B82F6',
      },
      {
        name: 'Danceability',
        value: tracksWithAudioFeatures.length > 0 
          ? tracksWithAudioFeatures.reduce((sum, track) => sum + (track.audioFeatures?.danceability || 0), 0) / tracksWithAudioFeatures.length
          : 0,
        color: '#10B981',
      },
      {
        name: 'Valence',
        value: tracksWithAudioFeatures.length > 0 
          ? tracksWithAudioFeatures.reduce((sum, track) => sum + (track.audioFeatures?.valence || 0), 0) / tracksWithAudioFeatures.length
          : 0,
        color: '#F59E0B',
      },
      {
        name: 'Acousticness',
        value: tracksWithAudioFeatures.length > 0 
          ? tracksWithAudioFeatures.reduce((sum, track) => sum + (track.audioFeatures?.acousticness || 0), 0) / tracksWithAudioFeatures.length
          : 0,
        color: '#8B5CF6',
      },
      {
        name: 'Energy',
        value: tracksWithAudioFeatures.length > 0 
          ? tracksWithAudioFeatures.reduce((sum, track) => sum + (track.audioFeatures?.energy || 0), 0) / tracksWithAudioFeatures.length
          : 0,
        color: '#EF4444',
      },
      {
        name: 'Liveness',
        value: tracksWithAudioFeatures.length > 0 
          ? tracksWithAudioFeatures.reduce((sum, track) => sum + (track.audioFeatures?.liveness || 0), 0) / tracksWithAudioFeatures.length
          : 0,
        color: '#06B6D4',
      },
    ];

    const response = {
      overview,
      moodDistribution,
      avgEnergy,
      avgValence,
      listeningActivity: monthlyData,
      listeningPatterns,
      audioFeaturesCorrelation,
      audioFeaturesRadar,
      timeRange
    };

    console.log('=== Final Consolidated Response ===');
    console.log('Response keys:', Object.keys(response));
    console.log('=== End getConsolidatedAnalytics Debug ===');

    res.json(response);
  } catch (error) {
    console.error('Error getting consolidated analytics:', error);
    res.status(500).json({ error: 'Failed to get consolidated analytics' });
  }
}; 