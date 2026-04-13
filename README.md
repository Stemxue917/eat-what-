# 吃什麼 App

一個簡單的手機優先 PWA，使用本地資料推薦今天要吃的餐廳。

## 本機執行

因為這個專案有註冊 service worker，請用本地靜態伺服器啟動：

```bash
python3 -m http.server 8000
```

接著打開 `http://localhost:8000`。

## 功能

- 一鍵推薦餐廳
- 可依時段、價格、類型篩選
- 不想吃標籤會儲存在 local storage
- 記錄最近 5 家餐廳
- 支援「換一家」
- 支援離線 PWA 外殼
