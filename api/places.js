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
  "0-200": ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE"],
  "200-500": ["PRICE_LEVEL_MODERATE"],
  "500-1000": ["PRICE_LEVEL_EXPENSIVE"],
  "1000+": ["PRICE_LEVEL_VERY_EXPENSIVE"],
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
    : null;

  return {
    id: place.id,
    name: place.displayName?.text || "未命名餐廳",
    type: place.primaryTypeDisplayName?.text || "餐廳",
    priceLevel: place.priceLevel || "PRICE_LEVEL_UNSPECIFIED",
    address: place.formattedAddress || "",
    tags: [...new Set([...(place.types || []), place.primaryTypeDisplayName?.text || ""])].filter(
      Boolean
    ),
    googleMapsUrl:
      place.googleMapsLinks?.placeUri ||
      place.googleMapsLinks?.directionsUri ||
      null,
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
    res.status(400).json({ error: "Missing valid lat/lng." });
    return;
  }

  const requestBody = {
    textQuery: buildTextQuery(time, type),
    languageCode: "zh-TW",
    regionCode: "TW",
    pageSize: 20,
    priceLevels: PRICE_BUCKETS[price] || undefined,
    locationBias: {
      circle: {
        center: {
          latitude: lat,
          longitude: lng,
        },
        radius: NEARBY_RADIUS_METERS,
      },
    },
  };

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.priceLevel,places.primaryTypeDisplayName,places.types,places.googleMapsLinks",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: errorText || "Google Places request failed." });
      return;
    }

    const data = await response.json();
    const origin = { lat, lng };
    const places = (data.places || [])
      .map((place) => normalizePlace(place, origin))
      .filter((place) => place.location && place.distanceKm !== null)
      .filter((place) => place.distanceKm <= NEARBY_RADIUS_METERS / 1000)
      .filter((place) => matchesType(place, type))
      .filter((place) => matchesPrice(place, price))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    res.status(200).json({ places });
  } catch (error) {
    res.status(500).json({ error: "Failed to search nearby places." });
  }
};
