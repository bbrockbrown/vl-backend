export async function getItemById(entity: string, type: string, spotifyId: string) {
  try {
    const response = await fetch(
      `https://api.chartmetric.com/api/${entity}/${type}/${spotifyId}/get-ids`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.CHARTMETRIC_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Chartmetric API Error:', errorText);
      throw new Error(`Chartmetric API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.obj) {
      throw new Error('No data object found in Chartmetric response');
    }

    return data.obj[0].chartmetric_ids[0];
  } catch (error: any) {
    console.error('Chartmetric Helper Error:', error);
    throw new Error(`Error in getting IDs from Chartmetric: ${error.message}`);
  }
}

// Helper function to specifically get the chartmetric_id
export async function getChartmetricId(
  entity: string,
  type: string,
  spotifyId: string
): Promise<number | null> {
  try {
    const data = await getItemById(entity, type, spotifyId);

    // Access the chartmetric_id from the response
    const chartmetricId = data.chartmetric_id || data.id || data.cmid;

    if (!chartmetricId) {
      console.warn('No chartmetric_id found in response:', data);
      return null;
    }

    return chartmetricId;
  } catch (error: any) {
    console.error('Error getting chartmetric ID:', error);
    return null;
  }
}

// Convert multiple Spotify track IDs to Chartmetric IDs
export async function convertSpotifyIdsToChartmetricIds(
  spotifyIds: string[]
): Promise<{ spotify_id: string; chartmetric_id: number | null }[]> {
  console.log(`Converting ${spotifyIds.length} Spotify IDs to Chartmetric IDs...`);

  const results = [];
  const batchSize = 5; // Process in batches to avoid rate limiting

  for (let i = 0; i < spotifyIds.length; i += batchSize) {
    const batch = spotifyIds.slice(i, i + batchSize);
    console.log(
      `Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(
        spotifyIds.length / batchSize
      )}`
    );

    // Process batch in parallel
    const batchPromises = batch.map(async (spotifyId) => {
      try {
        const chartmetricId = await getItemById('track', 'spotify', spotifyId);
        return {
          spotify_id: spotifyId,
          chartmetric_id: chartmetricId,
        };
      } catch (error: any) {
        console.warn(`Failed to convert Spotify ID ${spotifyId}:`, error.message);
        return {
          spotify_id: spotifyId,
          chartmetric_id: null,
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Small delay between batches to respect rate limits
    if (i + batchSize < spotifyIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const successCount = results.filter((r) => r.chartmetric_id !== null).length;
  console.log(
    `Conversion complete: ${successCount}/${spotifyIds.length} tracks found in Chartmetric`
  );

  return results;
}

// Get only the Chartmetric IDs that were successfully converted
export async function getValidChartmetricIds(spotifyIds: string[]): Promise<number[]> {
  const conversions = await convertSpotifyIdsToChartmetricIds(spotifyIds);
  return conversions
    .filter((item) => item.chartmetric_id !== null)
    .map((item) => item.chartmetric_id as number);
}

export async function getTrackAudioFeatures(chartmetricId: string) {
  try {
    console.log(`Fetching audio features for Chartmetric ID: ${chartmetricId}`);

    const response = await fetch(
      `https://api.chartmetric.com/api/track/${chartmetricId}/audio-features`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.CHARTMETRIC_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Audio Features Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Chartmetric Audio Features Error:', errorText);
      throw new Error(`Chartmetric API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Audio Features Data:', data);
    return data;
  } catch (error: any) {
    console.error('Audio Features Helper Error:', error);
    throw new Error(`Error in getting audio features from Chartmetric: ${error.message}`);
  }
}

// Get audio features for multiple tracks at once
export async function getBulkAudioFeatures(chartmetricIds: number[]): Promise<any[]> {
  console.log(`Fetching audio features for ${chartmetricIds.length} tracks...`);

  const audioFeatures = [];
  const batchSize = 3; // Smaller batch size for audio features to avoid rate limits

  for (let i = 0; i < chartmetricIds.length; i += batchSize) {
    const batch = chartmetricIds.slice(i, i + batchSize);
    console.log(
      `Processing audio features batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(
        chartmetricIds.length / batchSize
      )}`
    );

    const batchPromises = batch.map(async (chartmetricId) => {
      try {
        const features = await getTrackAudioFeatures(chartmetricId.toString());
        return {
          chartmetric_id: chartmetricId,
          audio_features: features,
          success: true,
        };
      } catch (error: any) {
        console.warn(`Failed to get audio features for ${chartmetricId}:`, error.message);
        return {
          chartmetric_id: chartmetricId,
          audio_features: null,
          success: false,
          error: error.message,
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    audioFeatures.push(...batchResults);

    // Delay between batches for rate limiting
    if (i + batchSize < chartmetricIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  const successCount = audioFeatures.filter((f) => f.success).length;
  console.log(`Audio features complete: ${successCount}/${chartmetricIds.length} tracks processed`);

  return audioFeatures;
}

export async function refreshChartmetricToken() {
  try {
    console.log('Refreshing Chartmetric access token...');

    const response = await fetch('https://api.chartmetric.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshtoken: process.env.CHARTMETRIC_REFRESH_TOKEN,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token refresh error:', errorText);
      throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('New access token received');

    // Note: You should update your environment variable or store this in your database
    // process.env.CHARTMETRIC_ACCESS_TOKEN = data.token;

    return data.token;
  } catch (error: any) {
    console.error('Token refresh error:', error);
    throw new Error(`Failed to refresh Chartmetric token: ${error.message}`);
  }
}