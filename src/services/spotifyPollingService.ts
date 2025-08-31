import { getUsers } from '../db/users';
import { getTrackBySpotifyId, createTrack, updateTrackBySpotifyId } from '../db/tracks';
import { createListeningSession } from '../db/listeningSessions';
import { classifyTrackMood } from '../helpers/moodClassification';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { createSpotifyHelper } from '../helpers/spotifyHelpers';
import axios from 'axios';
import { ListeningSessionModel } from '../db/listeningSessions';

interface PollingResult {
  userId: string;
  tracksProcessed: number;
  newTracks: number;
  newSessions: number;
  errors: string[];
}

class SpotifyPollingService {
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;

  async startPolling() {
    if (this.isRunning) {
      return;
    }

    console.log('Starting Spotify polling service...');
    this.isRunning = true;

    // Run initial poll
    await this.pollAllUsers();

    // Set up interval for every 15 minutes
    this.pollInterval = setInterval(async () => {
      await this.pollAllUsers();
    }, 15 * 60 * 1000); // 15 minutes
  }

  async stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
    console.log('Spotify polling service stopped');
  }

  private async refreshUserToken(user: any): Promise<boolean> {
    try {
      if (!user.spotify?.refreshToken) {
        return false;
      }

      const tokenResponse = await axios.post(
        'https://accounts.spotify.com/api/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: user.spotify.refreshToken,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization:
              'Basic ' +
              Buffer.from(
                process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
              ).toString('base64'),
          },
        }
      );

      const { access_token, refresh_token, expires_in } = tokenResponse.data;

      // Update user's tokens in database
      user.spotify.accessToken = access_token;
      if (refresh_token) {
        user.spotify.refreshToken = refresh_token;
      }
      user.spotify.tokenExpiresAt = new Date(Date.now() + expires_in * 1000);
      await user.save();

      return true;
    } catch (error) {
      console.error(`Failed to refresh token for user ${user._id}:`, error);
      return false;
    }
  }

  private async pollAllUsers(): Promise<void> {
    try {
      const users = await getUsers();
      const results: PollingResult[] = [];

      for (const user of users) {
        if (!user.spotify?.accessToken) {
          continue;
        }

        try {
          const result = await this.pollUser(user);
          results.push(result);
        } catch (error) {
          results.push({
            userId: user._id.toString(),
            tracksProcessed: 0,
            newTracks: 0,
            newSessions: 0,
            errors: [error instanceof Error ? error.message : 'Unknown error']
          });
        }
      }

    } catch (error) {
      console.error('Error in pollAllUsers:', error);
    }
  }

  public async pollUser(user: any): Promise<PollingResult> {
    const result: PollingResult = {
      userId: user._id.toString(),
      tracksProcessed: 0,
      newTracks: 0,
      newSessions: 0,
      errors: []
    };

    try {
      // Check if token is expired and refresh if needed
      const tokenExpiry = new Date(user.spotify.tokenExpiresAt);
      const now = new Date();
      const isExpired = tokenExpiry <= now;

      if (isExpired) {
        const refreshSuccess = await this.refreshUserToken(user);
        if (!refreshSuccess) {
          result.errors.push('Failed to refresh token');
          return result;
        }
      }

      // Create Spotify API instance for this user
      const accessToken = {
        access_token: user.spotify.accessToken,
        token_type: 'Bearer',
        expires_in: Math.floor((new Date(user.spotify.tokenExpiresAt).getTime() - Date.now()) / 1000),
        refresh_token: user.spotify.refreshToken || '',
        expires: new Date(user.spotify.tokenExpiresAt).getTime()
      };

      const spotifyApi = createSpotifyHelper(SpotifyApi.withAccessToken(
        process.env.SPOTIFY_CLIENT_ID!,
        accessToken
      ));

      // Get recently played tracks
      const recentlyPlayed = await spotifyApi.getUserRecentlyPlayed();
      
      if (!recentlyPlayed || recentlyPlayed.length === 0) {
        return result;
      }

      const trackIds = recentlyPlayed.map(item => item.track.id);
      result.tracksProcessed = trackIds.length;

      // Get audio features for tracks
      let audioFeatures: any[] = [];
      try {
        audioFeatures = await spotifyApi.getAudioFeaturesByIds(trackIds, trackIds.length);
      } catch (error) {
        console.warn(`Failed to get audio features for user ${user._id}:`, error);
        result.errors.push('Failed to get audio features');
      }

      // Process each track
      for (let i = 0; i < recentlyPlayed.length; i++) {
        const item = recentlyPlayed[i];
        const track = item.track;
        const playedAt = new Date(item.played_at);

        try {
          // Check if track exists in database
          let existingTrack = await getTrackBySpotifyId(track.id);
          
          if (!existingTrack) {
            // Create new track
            const audioFeature = audioFeatures.find(f => f.id === track.id);
            const trackData: any = {
              spotifyId: track.id,
              name: track.name,
              artist: track.artists[0]?.name || 'Unknown Artist',
              album: track.album?.name,
              duration: track.duration_ms,
              popularity: track.popularity,
              audioFeatures: audioFeature || {}
            };

            // Classify mood if audio features are available
            if (audioFeature && audioFeature.valence !== undefined) {
              const moodClassification = classifyTrackMood(audioFeature);
              trackData.mood = moodClassification;
            }

            existingTrack = await createTrack(trackData) as any;
            result.newTracks++;
          } else {
            // Update existing track with new audio features if available
            const audioFeature = audioFeatures.find(f => f.id === track.id);
            if (audioFeature && !existingTrack.audioFeatures?.valence) {
              const moodClassification = classifyTrackMood(audioFeature);
              await updateTrackBySpotifyId(track.id, {
                audioFeatures: audioFeature,
                mood: moodClassification
              });
            }
          }

          // Check if session already exists (deduplication)
          const existingSession = await this.checkExistingSession(user._id, track.id, playedAt);
          if (existingSession) {
            continue;
          }

          // Create listening session
          const sessionData = {
            userId: user._id,
            trackId: track.id, // Using Spotify track ID as per schema
            playedAt,
            duration: track.duration_ms,
            source: 'recently_played',
            hourOfDay: playedAt.getHours(),
            dayOfWeek: playedAt.getDay(),
            month: playedAt.getMonth() + 1,
            year: playedAt.getFullYear()
          };

          await createListeningSession(sessionData);
          result.newSessions++;

        } catch (error) {
          console.error(`Error processing track ${track.id}:`, error);
          result.errors.push(`Error processing track ${track.id}`);
        }
      }

    } catch (error) {
      console.error(`Error polling user ${user._id}:`, error);
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  private async checkExistingSession(userId: string, trackId: string, playedAt: Date): Promise<boolean> {
    try {
      // Check for existing session within a 5-minute window to handle slight timestamp differences
      const fiveMinutesAgo = new Date(playedAt.getTime() - 5 * 60 * 1000);
      const fiveMinutesLater = new Date(playedAt.getTime() + 5 * 60 * 1000);
      
      const existingSession = await ListeningSessionModel.findOne({
        userId,
        trackId,
        playedAt: { $gte: fiveMinutesAgo, $lte: fiveMinutesLater }
      });
      
      return !!existingSession;
    } catch (error) {
      console.error('Error checking existing session:', error);
      return false;
    }
  }
}

export const spotifyPollingService = new SpotifyPollingService(); 