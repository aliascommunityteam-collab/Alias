export type GiphyMedia = {
  id: string;
  imageUrl: string;
  pageUrl: string;
  title: string;
  creator: string | null;
};

type GiphyApiItem = {
  id: string;
  url?: string;
  title?: string;
  alt_text?: string;
  user?: {
    display_name?: string;
    username?: string;
  } | null;
  images?: {
    fixed_height?: {
      url?: string;
      webp?: string;
    };
  };
};

type GiphyResponse = {
  data?: GiphyApiItem[];
};

const API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY?.trim();

function mapGif(item: GiphyApiItem): GiphyMedia | null {
  const imageUrl =
    item.images?.fixed_height?.webp ||
    item.images?.fixed_height?.url;

  if (!item.id || !imageUrl) return null;

  return {
    id: item.id,
    imageUrl,
    pageUrl: item.url || "https://giphy.com",
    title: item.alt_text || item.title || "GIF",
    creator:
      item.user?.display_name ||
      item.user?.username ||
      null,
  };
}

function requireApiKey() {
  if (!API_KEY) {
    throw new Error(
      "GIF search is not configured. Add NEXT_PUBLIC_GIPHY_API_KEY to .env.local."
    );
  }
  return API_KEY;
}

export async function searchGiphy(query: string): Promise<GiphyMedia[]> {
  const cleanQuery = query.trim().slice(0, 50);
  if (!cleanQuery) return [];

  const params = new URLSearchParams({
    api_key: requireApiKey(),
    q: cleanQuery,
    limit: "12",
    rating: "g",
    lang: "en",
  });

  const response = await fetch(
    `https://api.giphy.com/v1/gifs/search?${params.toString()}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("GIF search is temporarily rate-limited. Try again later.");
    }
    throw new Error("GIF search is temporarily unavailable.");
  }

  const payload = (await response.json()) as GiphyResponse;
  return (payload.data ?? [])
    .map(mapGif)
    .filter((gif): gif is GiphyMedia => gif !== null);
}

export async function fetchGiphyByIds(
  ids: string[]
): Promise<Record<string, GiphyMedia>> {
  const safeIds = [...new Set(ids)].filter((id) =>
    /^[A-Za-z0-9]{1,100}$/.test(id)
  );

  if (safeIds.length === 0) return {};

  const apiKey = requireApiKey();
  const result: Record<string, GiphyMedia> = {};

  for (let start = 0; start < safeIds.length; start += 100) {
    const batch = safeIds.slice(start, start + 100);
    const params = new URLSearchParams({
      api_key: apiKey,
      ids: batch.join(","),
      rating: "g",
    });

    const response = await fetch(
      `https://api.giphy.com/v1/gifs?${params.toString()}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error("GIFs could not be loaded.");
    }

    const payload = (await response.json()) as GiphyResponse;

    for (const item of payload.data ?? []) {
      const gif = mapGif(item);
      if (gif) result[gif.id] = gif;
    }
  }

  return result;
}
