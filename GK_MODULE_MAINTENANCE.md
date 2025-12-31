# 中国古代名句辞典模块维护文档

## 1. 系统架构
本模块基于 "自我系统" 现有的 PWA 架构开发，采用前后端分离（但弱耦合）的设计。

### 1.1 前端
*   **文件位置**：
    *   HTML: `index.html` (模块结构)
    *   JS: `scripts/app.js` (`SelfSystem` 类中的 GK 相关方法)
    *   CSS: `styles/gk.css` (模块样式)
*   **关键类/方法**：
    *   `initGeneralKnowledgeModule()`: 初始化入口。
    *   `loadGkQuotes()`, `saveGkQuotes()`: 数据读写（Local + API）。
    *   `startRecitation()`, `renderReciteCard()`, `rateRecitation()`: 背诵核心逻辑。
    *   `parsePdfText()`: 基于 PDF.js 的解析逻辑。
*   **依赖库**：
    *   `pdf.js` (CDN引入): 用于前端解析 PDF 文件。

### 1.2 后端
*   **文件位置**：`server.js` (Node.js 原生 http 模块)
*   **数据文件**：`gk_quotes.json` (存储在根目录)
*   **API 接口**：
    *   `GET /api/gk/quotes`: 获取所有名句数据。
    *   `POST /api/gk/quotes`: 全量保存名句数据。

## 2. 数据结构

### 2.1 名句对象 (Quote Object)
```json
{
  "id": "gk_123456789",          // 唯一ID
  "content": "名句原文",
  "author": "作者",
  "source": "出处",
  "meaning": "释义",
  "nextReview": 1704000000000,   // 下次复习时间戳
  "interval": 1,                 // 当前复习间隔（天）
  "level": 0,                    // 熟练度等级 (0-5+)
  "ease": 2.5                    // 难度系数 (预留，暂未深度使用)
}
```

### 2.2 设置对象 (Settings Object)
```json
{
  "newLimit": 10,        // 每日新词上限
  "reviewLimit": 50,     // 每日复习上限
  "lastStudyDate": "Thu Dec 31 2024", // 最后学习日期
  "todayNewCount": 5,    // 今日已学新词数
  "todayReviewCount": 20 // 今日已复习数
}
```

## 3. 维护指南

### 3.1 修改背诵算法
算法逻辑位于 `app.js` 的 `rateRecitation` 方法中。目前采用简化版 SM-2 算法。如需调整间隔系数，修改 `intervals` 数组即可。

### 3.2 PDF解析优化
解析逻辑位于 `app.js` 的 `parsePdfText` 和 `processImportText`。
*   `parsePdfText`: 负责从二进制流提取纯文本。
*   `processImportText`: 负责将文本清洗并结构化。目前采用正则 `split(/[——-]/)` 尝试分离作者。如需支持更多格式，请优化此处的正则表达式。

### 3.3 样式调整
所有模块相关样式均隔离在 `styles/gk.css` 中，修改该文件不会影响系统其他部分。

## 4. 部署说明
*   确保服务器安装 Node.js 环境。
*   运行 `node server.js` 启动服务。
*   前端静态资源由 server.js 直接托管。
