const STORAGE_KEYS = {
  dislikes: "what-to-eat-dislikes",
  history: "what-to-eat-history",
  historyCache: "what-to-eat-history-cache",
};

const NEARBY_RADIUS_KM = 1.5;

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

function uniqueValues(list) {
  return [...new Set(list)];
}

function intersects(listA, listB) {
  const setB = new Set(listB);
  return listA.some((item) => setB.has(item));
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
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

function withDistance(restaurants, location) {
  return restaurants.map((restaurant) => {
    if (!location || !restaurant.location) {
      return restaurant;
    }

    return {
      ...restaurant,
      distanceKm: getDistanceKm(location, restaurant.location),
    };
  });
}

function matchesDislike(restaurant, dislikes) {
  if (dislikes.length === 0) {
    return false;
  }

  const haystack = `${restaurant.name} ${restaurant.type} ${(restaurant.tags || []).join(" ")}`.toLowerCase();
  return dislikes.some((dislike) => haystack.includes(dislike.toLowerCase()));
}

function chooseRestaurant(list, user) {
  const withoutDislikes = list.filter(
    (restaurant) => !matchesDislike(restaurant, user.dislikes)
  );

  const withoutHistory = withoutDislikes.filter(
    (restaurant) => !user.history.includes(restaurant.id)
  );

  if (withoutHistory.length > 0) {
    return randomItem(withoutHistory);
  }

  if (withoutDislikes.length > 0) {
    return randomItem(withoutDislikes);
  }

  const noHistoryList = list.filter((restaurant) => !user.history.includes(restaurant.id));
  if (noHistoryList.length > 0) {
    return randomItem(noHistoryList);
  }

  return list.length > 0 ? randomItem(list) : null;
}

function recommend(restaurants, user, location) {
  const enriched = withDistance(restaurants, location);
  const nearbyFiltered = enriched.filter(
    (restaurant) =>
      typeof restaurant.distanceKm === "number" && restaurant.distanceKm <= NEARBY_RADIUS_KM
  );

  if (location) {
    return chooseRestaurant(nearbyFiltered, user);
  }

  return chooseRestaurant(enriched, user);
}

function updateHistory(restaurant) {
  const nextHistory = [restaurant.id, ...state.user.history.filter((id) => id !== restaurant.id)].slice(
    0,
    5
  );
  const nextHistoryCache = [
    {
      id: restaurant.id,
      name: restaurant.name,
      type: restaurant.type,
      price: restaurant.price,
    },
    ...state.historyCache.filter((entry) => entry.id !== restaurant.id),
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

    button.addEventListener("click", () => {
      toggleDislike(tag);
    });

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

function renderResult(restaurant) {
  state.currentResult = restaurant;
  elements.resultTitle.textContent = restaurant.name;
  elements.resultType.textContent = restaurant.type;
  elements.resultPrice.textContent = PRICE_LABELS[restaurant.price] || restaurant.price || "價格未知";
  elements.resultDistance.textContent =
    typeof restaurant.distanceKm === "number"
      ? `距離你約 ${restaurant.distanceKm.toFixed(2)} 公里`
      : "尚未取得定位，先依你的篩選條件推薦。";
  elements.resultAddress.textContent = restaurant.address
    ? `地址：${restaurant.address}`
    : "";
  elements.resultTimes.textContent = state.filters.time
    ? `搜尋時段：${TIME_LABELS[state.filters.time] || state.filters.time}`
    : "搜尋時段：不限";
  elements.resultTags.textContent = `標籤：${(restaurant.tags || []).join("、") || "無"}`;
  elements.resultMapLink.href =
    restaurant.googleMapsUrl ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      restaurant.address || restaurant.name
    )}`;
  elements.resultImage.src = restaurant.image || DEFAULT_IMAGE;
  elements.resultImage.alt = restaurant.name;
  showView("result");
}

function bucketPriceLevel(priceLevel) {
  const priceMap = {
    PRICE_LEVEL_FREE: "0-200",
    PRICE_LEVEL_INEXPENSIVE: "0-200",
    PRICE_LEVEL_MODERATE: "200-500",
    PRICE_LEVEL_EXPENSIVE: "500-1000",
    PRICE_LEVEL_VERY_EXPENSIVE: "1000+",
  };

  return priceMap[priceLevel] || "";
}

async function fetchPlaces(location, filters) {
  const params = new URLSearchParams({
    lat: String(location.lat),
    lng: String(location.lng),
    time: filters.time,
    price: filters.price,
    type: filters.type,
  });

  const response = await fetch(`/api/places?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to fetch places.");
  }

  const data = await response.json();
  return (data.places || []).map((place) => ({
    ...place,
    price: bucketPriceLevel(place.priceLevel),
  }));
}

async function requestLocation() {
  if (!("geolocation" in navigator)) {
    elements.locationStatus.textContent = "此裝置不支援定位，會改用一般推薦。";
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
        elements.locationStatus.textContent = "定位失敗或被拒絕，會改用一般推薦。";
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
      "目前無法取得 Google 餐廳資料，請確認 Vercel 環境變數與 Google Places API 是否已啟用。";
    return;
  }

  const choice = recommend(state.currentPlaces, state.user, location);
  if (!choice) {
    elements.locationStatus.textContent = `目前 ${NEARBY_RADIUS_KM} 公里內沒有符合條件的 Google 餐廳結果。`;
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
    saveStoredArray(STORAGE_KEYS.history, []);
    renderHistory();
  });
}

async function init() {
  initFilters();
  renderDislikes();
  renderHistory();
  attachEvents();
  registerServiceWorker();
}

init().catch(() => {
  elements.historyList.innerHTML = "";
  const item = document.createElement("li");
  item.className = "empty";
  item.textContent = "初始化失敗。";
  elements.historyList.appendChild(item);
});
