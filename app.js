const STORAGE_KEYS = {
  dislikes: "what-to-eat-dislikes",
  history: "what-to-eat-history",
  historyCache: "what-to-eat-history-cache",
};

const NEARBY_RADIUS_KM = 1.5;
const NEARBY_RADIUS_METERS = NEARBY_RADIUS_KM * 1000;

const DEFAULT_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="#ffd6b8"/>
          <stop offset="1" stop-color="#fff2c9"/>
        </linearGradient>
      </defs>
      <rect width="800" height="600" fill="url(#g)"/>
      <circle cx="160" cy="140" r="90" fill="rgba(255,255,255,0.55)"/>
      <circle cx="640" cy="450" r="110" fill="rgba(243,111,69,0.12)"/>
      <text x="50%" y="48%" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" fill="#7e4a31">今天吃什麼</text>
      <text x="50%" y="58%" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#9a6144">為你挑一間</text>
    </svg>
  `);

const TIMES = ["breakfast", "lunch", "dinner", "late-night"];
const PRICES = ["0-200", "200-500", "500-1000", "1000+"];

const TYPE_OPTIONS = [
  "火鍋",
  "便當",
  "炸物",
  "麵食",
  "壽司",
  "素食",
  "早餐",
  "咖哩",
  "水餃",
  "燒肉",
  "拉麵",
  "塔可",
  "咖啡",
  "漢堡",
];

const DISLIKE_OPTIONS = [
  "火鍋",
  "便當",
  "炸雞",
  "拉麵",
  "壽司",
  "素食",
  "咖啡",
  "漢堡",
  "牛排",
  "燒肉",
  "咖哩",
  "麵",
];

const TIME_LABELS = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  "late-night": "宵夜",
};

const PRICE_LABELS = {
  "0-200": "0-200 元",
  "200-500": "200-500 元",
  "500-1000": "500-1000 元",
  "1000+": "1000 元以上",
};

const GOOGLE_SCRIPT_TIMEOUT_MS = 12000;
const PLACES_SEARCH_TIMEOUT_MS = 15000;

const TYPE_KEYWORDS = {
  "": [],
  火鍋: ["火鍋", "鍋物", "麻辣鍋"],
  便當: ["便當", "餐盒"],
  炸物: ["炸雞", "鹽酥雞", "炸物"],
  麵食: ["麵", "拉麵", "牛肉麵", "麵店"],
  壽司: ["壽司", "日式", "生魚片"],
  素食: ["素食", "蔬食"],
  早餐: ["早餐", "早午餐", "brunch"],
  咖哩: ["咖哩", "curry"],
  水餃: ["水餃", "鍋貼", "餃子"],
  燒肉: ["燒肉", "烤肉", "居酒屋"],
  拉麵: ["拉麵"],
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

const state = {
  filters: {
    time: "",
    price: "",
    type: "",
  },
  user: {
    dislikes: loadStoredArray(STORAGE_KEYS.dislikes),
    history: loadStoredArray(STORAGE_KEYS.history),
  },
  historyCache: loadStoredArray(STORAGE_KEYS.historyCache),
  location: null,
  currentResult: null,
  currentPlaces: [],
  googleMapsReady: false,
  placesService: null,
};

const elements = {
  homeView: document.getElementById("home-view"),
  resultView: document.getElementById("result-view"),
  recommendButton: document.getElementById("recommend-button"),
  rerollButton: document.getElementById("reroll-button"),
  backButton: document.getElementById("back-button"),
  timeFilter: document.getElementById("time-filter"),
  priceFilter: document.getElementById("price-filter"),
  typeFilter: document.getElementById("type-filter"),
  locateButton: document.getElementById("locate-button"),
  locationStatus: document.getElementById("location-status"),
  dislikeTags: document.getElementById("dislike-tags"),
  clearDislikes: document.getElementById("clear-dislikes"),
  historyList: document.getElementById("history-list"),
  clearHistory: document.getElementById("clear-history"),
  resultTitle: document.getElementById("result-title"),
  resultType: document.getElementById("result-type"),
  resultPrice: document.getElementById("result-price"),
  resultDistance: document.getElementById("result-distance"),
  resultAddress: document.getElementById("result-address"),
  resultTimes: document.getElementById("result-times"),
  resultTags: document.getElementById("result-tags"),
  resultMapLink: document.getElementById("result-map-link"),
  resultImage: document.getElementById("result-image"),
  mapRoot: document.getElementById("map-root"),
};

function loadStoredArray(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function saveStoredArray(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

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

function normalizePriceLevel(priceLevel) {
  const mapping = {
    0: "0-200",
    1: "0-200",
    2: "200-500",
    3: "500-1000",
    4: "1000+",
  };

  return mapping[priceLevel] || "";
}

function buildKeyword(filters) {
  return [...TIME_KEYWORDS[filters.time] || [], ...TYPE_KEYWORDS[filters.type] || []]
    .filter(Boolean)
    .join(" ");
}

function matchesPrice(place, selectedPrice) {
  if (!selectedPrice) {
    return true;
  }
  return place.price === selectedPrice;
}

function matchesType(place, selectedType) {
  if (!selectedType) {
    return true;
  }

  const haystack = `${place.name} ${place.type} ${(place.tags || []).join(" ")}`.toLowerCase();
  return (TYPE_KEYWORDS[selectedType] || []).some((keyword) =>
    haystack.includes(keyword.toLowerCase())
  );
}

function matchesDislike(place, dislikes) {
  if (dislikes.length === 0) {
    return false;
  }

  const haystack = `${place.name} ${place.type} ${(place.tags || []).join(" ")}`.toLowerCase();
  return dislikes.some((dislike) => haystack.includes(dislike.toLowerCase()));
}

function chooseRestaurant(list, user) {
  const withoutDislikes = list.filter((place) => !matchesDislike(place, user.dislikes));
  const withoutHistory = withoutDislikes.filter((place) => !user.history.includes(place.id));

  if (withoutHistory.length > 0) {
    return randomItem(withoutHistory);
  }

  if (withoutDislikes.length > 0) {
    return randomItem(withoutDislikes);
  }

  const noHistoryList = list.filter((place) => !user.history.includes(place.id));
  if (noHistoryList.length > 0) {
    return randomItem(noHistoryList);
  }

  return list.length > 0 ? randomItem(list) : null;
}

function updateHistory(place) {
  const nextHistory = [place.id, ...state.user.history.filter((id) => id !== place.id)].slice(0, 5);
  const nextHistoryCache = [
    {
      id: place.id,
      name: place.name,
      type: place.type,
      price: place.price,
    },
    ...state.historyCache.filter((entry) => entry.id !== place.id),
  ].slice(0, 5);

  state.user.history = nextHistory;
  state.historyCache = nextHistoryCache;
  saveStoredArray(STORAGE_KEYS.history, nextHistory);
  saveStoredArray(STORAGE_KEYS.historyCache, nextHistoryCache);
  renderHistory();
}

function toggleDislike(tag) {
  const hasTag = state.user.dislikes.includes(tag);
  const nextDislikes = hasTag
    ? state.user.dislikes.filter((item) => item !== tag)
    : [...state.user.dislikes, tag];

  state.user.dislikes = nextDislikes;
  saveStoredArray(STORAGE_KEYS.dislikes, nextDislikes);
  renderDislikes();
}

function populateSelect(select, values, labelFormatter = (value) => value) {
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelFormatter(value);
    select.appendChild(option);
  });
}

function renderDislikes() {
  elements.dislikeTags.innerHTML = "";

  DISLIKE_OPTIONS.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-button";
    button.textContent = tag;
    button.setAttribute("aria-pressed", state.user.dislikes.includes(tag) ? "true" : "false");

    if (state.user.dislikes.includes(tag)) {
      button.classList.add("is-active");
    }

    button.addEventListener("click", () => toggleDislike(tag));
    elements.dislikeTags.appendChild(button);
  });
}

function renderHistory() {
  elements.historyList.innerHTML = "";

  if (state.historyCache.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "目前還沒有最近紀錄。";
    elements.historyList.appendChild(item);
    return;
  }

  state.historyCache.forEach((restaurant) => {
    const item = document.createElement("li");
    item.textContent = `${restaurant.name} · ${restaurant.type} · ${
      PRICE_LABELS[restaurant.price] || restaurant.price || "價格未知"
    }`;
    elements.historyList.appendChild(item);
  });
}

function syncFilters() {
  state.filters.time = elements.timeFilter.value;
  state.filters.price = elements.priceFilter.value;
  state.filters.type = elements.typeFilter.value;
}

function showView(viewName) {
  const showingHome = viewName === "home";
  elements.homeView.classList.toggle("view-active", showingHome);
  elements.resultView.classList.toggle("view-active", !showingHome);
}

function renderResult(place) {
  state.currentResult = place;
  elements.resultTitle.textContent = place.name;
  elements.resultType.textContent = place.type || "餐廳";
  elements.resultPrice.textContent = PRICE_LABELS[place.price] || place.price || "價格未知";
  elements.resultDistance.textContent =
    typeof place.distanceKm === "number"
      ? `距離你約 ${place.distanceKm.toFixed(2)} 公里`
      : "尚未取得定位。";
  elements.resultAddress.textContent = place.address ? `地址：${place.address}` : "";
  elements.resultTimes.textContent = state.filters.time
    ? `搜尋時段：${TIME_LABELS[state.filters.time] || state.filters.time}`
    : "搜尋時段：不限";
  elements.resultTags.textContent = `標籤：${(place.tags || []).join("、") || "無"}`;
  elements.resultMapLink.href = buildGoogleMapsUrl(place);
  elements.resultImage.src = place.image || DEFAULT_IMAGE;
  elements.resultImage.alt = place.name;
  showView("result");
}

function buildGoogleMapsUrl(place) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || place.address || "")}`;
}

async function fetchMapsConfig() {
  const response = await fetch("/api/maps-config");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "無法取得 Google Maps 設定。");
  }
  return data;
}

function loadGoogleMapsScript(apiKey) {
  return withTimeout(
    new Promise((resolve, reject) => {
      if (window.google?.maps?.places) {
        resolve();
        return;
      }

      const existingScript = document.querySelector('script[data-google-maps="true"]');
      if (existingScript) {
        if (existingScript.dataset.loaded === "true" && window.google?.maps?.places) {
          resolve();
          return;
        }

        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("Google Maps 載入失敗。")),
          { once: true }
        );
        return;
      }

      const script = document.createElement("script");
      script.src =
        `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.dataset.googleMaps = "true";
      script.addEventListener(
        "load",
        () => {
          script.dataset.loaded = "true";
          resolve();
        },
        { once: true }
      );
      script.addEventListener(
        "error",
        () => reject(new Error("Google Maps 載入失敗。")),
        { once: true }
      );
      document.head.appendChild(script);
    }),
    GOOGLE_SCRIPT_TIMEOUT_MS,
    "Google Maps 載入逾時，請稍後再試。"
  );
}

async function ensureGoogleMapsReady() {
  if (state.googleMapsReady && state.placesService) {
    return;
  }

  const { apiKey } = await fetchMapsConfig();
  await loadGoogleMapsScript(apiKey);

  if (!window.google?.maps?.places) {
    throw new Error("Google Places Library 尚未載入。");
  }

  const map = new window.google.maps.Map(elements.mapRoot, {
    center: { lat: 25.033, lng: 121.5654 },
    zoom: 14,
  });

  state.placesService = new window.google.maps.places.PlacesService(map);
  state.googleMapsReady = true;
}

function searchNearbyPlaces(location, filters) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const request = {
        location: new window.google.maps.LatLng(location.lat, location.lng),
        radius: NEARBY_RADIUS_METERS,
        type: "restaurant",
        keyword: buildKeyword(filters) || undefined,
        openNow: filters.time === "late-night" || undefined,
      };

      state.placesService.nearbySearch(request, (results, status) => {
        if (
          status !== window.google.maps.places.PlacesServiceStatus.OK &&
          status !== window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS
        ) {
          reject(new Error(`Google Places Nearby Search 失敗：${status}`));
          return;
        }

        resolve(results || []);
      });
    }),
    PLACES_SEARCH_TIMEOUT_MS,
    "附近餐廳搜尋逾時，請再試一次。"
  );
}

function normalizePlaceResult(place, origin) {
  const location =
    place.geometry?.location
      ? {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        }
      : null;

  return {
    id: place.place_id,
    name: place.name || "未命名餐廳",
    type: place.types?.[0] || "餐廳",
    price: normalizePriceLevel(place.price_level),
    address: place.vicinity || place.formatted_address || "",
    tags: place.types || [],
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      place.name || ""
    )}`,
    image: place.photos?.[0]
      ? place.photos[0].getUrl({ maxWidth: 900, maxHeight: 675 })
      : DEFAULT_IMAGE,
    location,
    distanceKm: origin && location ? getDistanceKm(origin, location) : null,
  };
}

async function fetchPlaces(location, filters) {
  await ensureGoogleMapsReady();
  const results = await searchNearbyPlaces(location, filters);
  return results
    .map((place) => normalizePlaceResult(place, location))
    .filter((place) => place.location && place.distanceKm !== null)
    .filter((place) => place.distanceKm <= NEARBY_RADIUS_KM)
    .filter((place) => matchesPrice(place, filters.price))
    .filter((place) => matchesType(place, filters.type))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

async function requestLocation() {
  if (!("geolocation" in navigator)) {
    elements.locationStatus.textContent = "此裝置不支援定位。";
    return null;
  }

  elements.locationStatus.textContent = "正在取得你的位置...";

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        state.location = nextLocation;
        elements.locationStatus.textContent = `已取得定位，將優先推薦 ${NEARBY_RADIUS_KM} 公里內餐廳。`;
        resolve(nextLocation);
      },
      () => {
        elements.locationStatus.textContent = "定位失敗或被拒絕。";
        resolve(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 300000,
      }
    );
  });
}

async function runRecommendation() {
  syncFilters();
  const location = state.location || (await requestLocation());
  if (!location) {
    return;
  }

  elements.locationStatus.textContent = "正在搜尋附近餐廳...";

  try {
    state.currentPlaces = await fetchPlaces(location, state.filters);
  } catch (error) {
    elements.locationStatus.textContent =
      `目前無法取得 Google 餐廳資料：${error instanceof Error ? error.message : "未知錯誤"}`;
    return;
  }

  const choice = chooseRestaurant(state.currentPlaces, state.user);
  if (!choice) {
    elements.locationStatus.textContent = `目前 ${NEARBY_RADIUS_KM} 公里內沒有符合條件的餐廳結果。`;
    return;
  }

  elements.locationStatus.textContent = `已取得附近資料，優先推薦 ${NEARBY_RADIUS_KM} 公里內餐廳。`;
  renderResult(choice);
  updateHistory(choice);
}

function initFilters() {
  populateSelect(elements.timeFilter, TIMES, (value) => TIME_LABELS[value] || value);
  populateSelect(elements.priceFilter, PRICES, (value) => PRICE_LABELS[value] || value);
  populateSelect(elements.typeFilter, TYPE_OPTIONS, (value) => value);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

function attachEvents() {
  elements.recommendButton.addEventListener("click", runRecommendation);
  elements.rerollButton.addEventListener("click", runRecommendation);
  elements.backButton.addEventListener("click", () => showView("home"));
  elements.locateButton.addEventListener("click", requestLocation);
  elements.timeFilter.addEventListener("change", syncFilters);
  elements.priceFilter.addEventListener("change", syncFilters);
  elements.typeFilter.addEventListener("change", syncFilters);
  elements.clearDislikes.addEventListener("click", () => {
    state.user.dislikes = [];
    saveStoredArray(STORAGE_KEYS.dislikes, []);
    renderDislikes();
  });
  elements.clearHistory.addEventListener("click", () => {
    state.user.history = [];
    state.historyCache = [];
    saveStoredArray(STORAGE_KEYS.history, []);
    saveStoredArray(STORAGE_KEYS.historyCache, []);
    renderHistory();
  });
}

async function init() {
  initFilters();
  renderDislikes();
  renderHistory();
  attachEvents();
  registerServiceWorker();
  fetchMapsConfig().catch(() => {});
}

init().catch(() => {
  elements.historyList.innerHTML = "";
  const item = document.createElement("li");
  item.className = "empty";
  item.textContent = "初始化失敗。";
  elements.historyList.appendChild(item);
});
