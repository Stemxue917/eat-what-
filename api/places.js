const NEARBY_RADIUS_METERS = 1500;

const TYPE_KEYWORDS = {
  "": [],
  火鍋: ["火鍋", "麻辣鍋", "鍋物"],
  便當: ["便當"],
  炸物: ["炸雞", "鹽酥雞", "炸物"],
  麵食: ["拉麵", "麵", "牛肉麵", "麵店"],
  壽司: ["壽司", "日式料理", "生魚片"],
  素食: ["素食", "蔬食"],
  早餐: ["早餐", "早午餐", "brunch"],
  咖哩: ["咖哩", "curry"],
  水餃: ["水餃", "餃子", "鍋貼"],
  燒肉: ["燒肉", "烤肉", "居酒屋"],
  拉麵: ["拉麵", "日式拉麵"],
  塔可: ["塔可", "墨西哥"],
  咖啡: ["咖啡", "咖啡廳", "cafe"],
  漢堡: ["漢堡", "burger"],
};

const TIME_KEYWORDS = {
  "": [],
  breakfast: ["早餐", "早午餐", "brunch"],
  lunch: ["午餐", "餐廳"],
  dinner: ["晚餐", "餐廳"],
  "late-night": ["宵夜", "深夜", "late night"],
};

const PRICE_BUCKETS = {
  "0-200": [0, 1],
  "200-500": [2],
  "500-1000": [3],
  "1000+": [4],
};

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function getDistanceKm(from, to) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const startLat = toRadians(from.lat);
  const endLat = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(startLat) *
      Math.cos(endLat) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizePlace(place, origin) {
  const location = place.location
    ? {
        lat: place.location.latitude,
        lng: place.location.longitude,
      }
    : place.geometry?.location
      ? {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
        }
    : null;

  return {
    id: place.id || place.place_id,
    name: place.displayName?.text || place.name || "未命名餐廳",
    type: place.primaryTypeDisplayName?.text || place.types?.[0] || "餐廳",
    priceLevel: place.priceLevel ?? place.price_level ?? null,
    address: place.formattedAddress || place.vicinity || "",
    tags: [...new Set([...(place.types || []), place.primaryTypeDisplayName?.text || ""])].filter(Boolean),
    googleMapsUrl:
      place.googleMapsLinks?.placeUri ||
      place.googleMapsLinks?.directionsUri ||
      (place.place_id
        ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.place_id)}`
        : null),
    location,
    distanceKm:
      origin && location ? getDistanceKm(origin, location) : null,
  };
}

function buildTextQuery(time, type) {
  const parts = [
    ...(TIME_KEYWORDS[time || ""] || []),
    ...(TYPE_KEYWORDS[type || ""] || []),
  ];

  if (parts.length === 0) {
    return "附近美食 餐廳";
  }

  return `${parts.join(" ")} 餐廳`;
}

function matchesType(place, type) {
  if (!type) {
    return true;
  }

  const haystack = `${place.name} ${place.type} ${place.tags.join(" ")}`.toLowerCase();
  return (TYPE_KEYWORDS[type] || []).some((keyword) =>
    haystack.includes(keyword.toLowerCase())
  );
}

function matchesPrice(place, price) {
  if (!price) {
    return true;
  }

  return (PRICE_BUCKETS[price] || []).includes(place.priceLevel);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing GOOGLE_PLACES_API_KEY." });
    return;
  }

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const time = String(req.query.time || "");
  const price = String(req.query.price || "");
  const type = String(req.query.type || "");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: "Missing valid lat/lng.", details: "請提供有效的緯度與經度。" });
    return;
  }

  const requestBody = {
    textQuery: buildTextQuery(time, type),
  };

  try {
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: String(NEARBY_RADIUS_METERS),
      type: "restaurant",
      keyword: requestBody.textQuery,
      language: "zh-TW",
      key: apiKey,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${params.toString()}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({
        error: "Google Places request failed.",
        details: errorText || "Google Places API 沒有回傳可讀取的錯誤訊息。",
      });
      return;
    }

    const data = await response.json();
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      res.status(403).json({
        error: "Google Places request failed.",
        details: data.error_message || data.status,
      });
      return;
    }

    const origin = { lat, lng };
    const places = (data.results || [])
      .map((place) => normalizePlace(place, origin))
      .filter((place) => place.location && place.distanceKm !== null)
      .filter((place) => place.distanceKm <= NEARBY_RADIUS_METERS / 1000)
      .filter((place) => matchesType(place, type))
      .filter((place) => matchesPrice(place, price))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    res.status(200).json({ places });
  } catch (error) {
    res.status(500).json({
      error: "Failed to search nearby places.",
      details: error instanceof Error ? error.message : "未知錯誤",
    });
  }
};
