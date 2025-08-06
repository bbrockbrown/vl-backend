import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import {
  Track,
  Artist,
  Album,
  SimplifiedTrack,
  FollowedArtists,
  SimplifiedAlbum,
  Page,
  Market,
  CountryCodeA2,
  PlayHistory,
} from '../types/spotify/types';
import { TrackAudioFeatures } from '../types/reccobeats/types';
import spotify from '../router/spotify';

export class SpotifyHelper {
  constructor(private spotifyApi: SpotifyApi) {}

  // Track functions
  async getTrackById(trackId: string): Promise<Track> {
    try {
      return await this.spotifyApi.tracks.get(trackId);
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  async getTracksByIds(trackIds: string[]): Promise<Track[]> {
    try {
      const response = await this.spotifyApi.tracks.get(trackIds);
      return response;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  // Artist functions
  async getArtistById(artistId: string): Promise<Artist> {
    try {
      return await this.spotifyApi.artists.get(artistId);
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  async getArtistTopTracksById(artistId: string, market: Market = 'US'): Promise<Track[]> {
    try {
      const response = await this.spotifyApi.artists.topTracks(artistId, market);
      return response.tracks;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  // Album functions
  async getAlbumById(albumId: string): Promise<Album> {
    try {
      return await this.spotifyApi.albums.get(albumId);
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  async getAlbumTracksById(
    albumId: string,
    market: Market = 'US',
    limit: number = 50,
    offset: number = 0
  ): Promise<SimplifiedTrack[]> {
    try {
      const response = await this.spotifyApi.albums.tracks(albumId, market, limit as any, offset);
      return response.items;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  async getAlbumsByIds(albumIds: string[], market: Market = 'US'): Promise<Album[]> {
    try {
      const response = await this.spotifyApi.albums.get(albumIds, market);
      return response;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  // User-related functions
  async getUserTopTracks(
    time_range: 'short_term' | 'medium_term' | 'long_term', // short=4wks, med=6mos, long=1yr
    limit: number = 150, // lots of data asf
    offset: number = 0
  ): Promise<Page<Track>> {
    try {
      const response = await this.spotifyApi.currentUser.topItems(
        'tracks',
        time_range,
        limit as any,
        offset
      );
      return response;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  async getUserTopArtists(
    type: 'artists',
    time_range: 'short_term' | 'medium_term' | 'long_term', // short=4wks, med=6mos, long=1yr
    limit: number = 150, // lots of data asf
    offset: number = 0
  ): Promise<Page<Artist>> {
    try {
      const response = await this.spotifyApi.currentUser.topItems(
        type,
        time_range,
        limit as any,
        offset
      );
      return response;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  async getUserRecentlyPlayed(
    limit: number = 50,
    before?: string,
    after?: string
  ): Promise<PlayHistory[]> {
    try {
      const queryRange =
        before !== undefined
          ? { timestamp: parseInt(before), type: 'before' as const }
          : after !== undefined
          ? { timestamp: parseInt(after), type: 'after' as const }
          : undefined;
      const response = await this.spotifyApi.player.getRecentlyPlayedTracks(
        limit as any,
        queryRange
      );
      return response.items;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  async getUserSavedTracks(
    limit: number = 20,
    offset: number = 0,
    market: Market = 'US',
  ): Promise<Track[]> {
    try {
      const response = await this.spotifyApi.currentUser.tracks.savedTracks(
        limit as any,
        offset,
        market
      );
      return response.items.map((item) => item.track);
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  async getUserSavedAlbums(
    limit: number = 20,
    offset: number = 0,
    market: Market = 'US'
  ): Promise<Album[]> {
    try {
      const response = await this.spotifyApi.currentUser.albums.savedAlbums(
        limit as any,
        offset,
        market
      );
      return response.items.map((item) => item.album);
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  async getUserFollowedArtists(after: string, limit: number = 20): Promise<FollowedArtists> {
    try {
      const response = await this.spotifyApi.currentUser.followedArtists(after, limit as any);
      return response;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  // Recommendations
  // async getRecommendations(params: {
  //   seed_artists?: string[];
  //   seed_tracks?: string[];
  //   seed_genres?: string[];
  //   limit?: number;
  //   market?: string;
  //   min_energy?: number;
  //   max_energy?: number;
  //   target_valence?: number;
  //   target_danceability?: number;
  // }): Promise<Track[]> {
  //   try {
  //     const response = await this.spotifyApi.getRecommendations(params);
  //     return response.tracks;
  //   } catch (error) {
  //     throw this.handleSpotifyError(error);
  //   }
  // }

  // Browse functions
  async getNewReleases(
    country: string = 'US',
    limit: number = 20,
    offset: number = 0
  ): Promise<SimplifiedAlbum[]> {
    try {
      const response = await this.spotifyApi.browse.getNewReleases(country, limit as any, offset);
      return response.albums.items;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  // async getFeaturedPlaylists(country: string = 'US', limit: number = 20, offset: number = 0): Promise<any[]> {
  //   try {
  //     const response = await this.spotifyApi.browse.getFeaturedPlaylists(country as any, timestamp?, limit?, offset?)

  //     return response.playlists.items;
  //   } catch (error) {
  //     throw this.handleSpotifyError(error);
  //   }
  // }

  // Audio analysis
  async getAudioFeaturesById(spotifyTrackId: string): Promise<TrackAudioFeatures> {
    try {
      const response = await fetch(
        `https://api.reccobeats.com/v1/track/${spotifyTrackId}/audio-features`,
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ReccoBeats API Error:', errorText);
        throw new Error(`ReccoBeats API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching from ReccoBeats API:', error);
      throw error; // Re-throw the error to maintain the Promise rejection
    }
  }

  async getAudioFeaturesByIds(
    spotifyTrackIds: string[],
    limit = 40
  ): Promise<TrackAudioFeatures[]> {
    try {
      const idsParam =
        limit <= 40
          ? spotifyTrackIds.slice(0, limit).join(',')
          : spotifyTrackIds.slice(0, 40).join(',');
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
      return data.content;
    } catch (error) {
      console.error('Error fetching from ReccoBeats API:', error);
      throw error; // Re-throw the error to maintain the Promise rejection
    }
  }

  // Market and genre functions
  async getAvailableMarkets(): Promise<string[]> {
    try {
      const response = await this.spotifyApi.markets.getAvailableMarkets();
      return response.markets;
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  async getAvailableGenres(
    locale: CountryCodeA2 = 'US',
    limit: number = 20,
    offset: number = 0
  ): Promise<string[]> {
    try {
      const response = await this.spotifyApi.browse.getCategories(
        locale,
        limit as any,
        offset as any
      );
      return response.categories.items.map((category) => category.name);
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  async search(
    query: string, // must be in form "query=remaster%2520track%3ADoxy%2520artist%3AMiles%2520Davis"
    type: 'track' | 'album' | 'artist' = 'track',
    market: Market = 'US',
    limit: number = 20,
    offset: number = 0
  ): Promise<Track[] | SimplifiedAlbum[] | Artist[]> {
    try {
      const response = await this.spotifyApi.search(query, [type], market, limit as any, offset);

      return type === 'track'
        ? response.tracks?.items || []
        : type === 'album'
        ? response.albums?.items || []
        : response.artists?.items || [];
    } catch (error) {
      throw this.handleSpotifyError(error);
    }
  }

  // Error handling
  private handleSpotifyError(error: any): Error {
    if (error.status === 401) {
      return new Error('Spotify authentication failed');
    } else if (error.status === 404) {
      return new Error('Resource not found');
    } else if (error.status === 429) {
      return new Error('Rate limit exceeded');
    } else {
      return new Error(`Spotify API error: ${error.message || 'Unknown error'}`);
    }
  }
}

// Utility functions
export const createSpotifyHelper = (spotifyApi: SpotifyApi): SpotifyHelper => {
  return new SpotifyHelper(spotifyApi);
};
