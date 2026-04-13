# 吃什麼 App

一個手機優先的 PWA，透過 Vercel Serverless Function 代理 Google Places API，依照使用者定位搜尋附近餐廳，不再依賴本地餐廳資料庫。

## 部署前準備

1. 到 Google Cloud 啟用 Places API (New)。
2. 建立 API Key。
3. 在 Vercel 專案的 Environment Variables 新增：

```bash
GOOGLE_PLACES_API_KEY=你的_Google_Places_API_Key
```

## 本機開發

因為專案使用了 Vercel Serverless Function，建議用 Vercel CLI 啟動：

```bash
vercel dev
```

如果只用 `python3 -m http.server`，前端靜態頁可以開，但 `/api/places` 不會存在。

## 功能

- 依定位搜尋 1.5 公里內餐廳
- 使用 Google Places API 即時搜尋，不需自建餐廳資料庫
- 可依時段、價格、類型篩選
- 點擊後可直接打開 Google Maps
- 不想吃關鍵字與最近 5 筆紀錄會存在 local storage
- 支援 PWA 安裝與離線外殼

## 注意事項

- 目前的「不想吃」是以餐廳名稱、類型、Google place types 做關鍵字排除，不是菜單食材層級的精準過濾。
- Google Places 的價格層級會被對應成 `0-200`、`200-500`、`500-1000`、`1000+` 的近似顯示。
