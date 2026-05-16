# 数据目录说明

## 本机自动更新（推荐）

把最新文件放在桌面固定目录即可，**不必**复制进仓库：

| 类型 | 默认路径 |
|------|----------|
| 出货 CSV | `~/Desktop/日数据/*.csv` |
| 流量 Excel | `~/Desktop/日数据/流量/*.xlsx` |

在项目根目录执行：

```bash
chmod +x scripts/refresh_and_publish.sh
./scripts/refresh_and_publish.sh
```

或：

```bash
python3 scripts/refresh_dashboard.py
```

脚本会：

1. 生成 `data-bundle.js`（出货）
2. 生成 `data/traffic_daily.json`（流量）
3. 更新 `index.html` 缓存版本（防浏览器旧缓存）
4. 提交并推送到 `main` 与 `gh-pages`（线上自动更新）

仅本地重建、不推送：

```bash
python3 scripts/refresh_dashboard.py --no-publish
```

## 通过 GitHub 自动更新（可选）

若希望「推送到 GitHub 就自动构建」，可把文件放进：

- `data/shipment/` — 出货 CSV
- `data/traffic/` — 流量 Excel

然后 push 到 `main`，或到 Actions 里手动运行 **Refresh dashboard data**。

## 更新 5 月 / 新增 6 月数据

1. 用新表**覆盖或新增**桌面 `日数据` 下对应 CSV（如 `5月.csv`、`6月.csv`）。
2. 用新 Excel **覆盖或新增** `日数据/流量/` 下各渠道日表（文件名可含 `1-6月` 等）。
3. 运行 `./scripts/refresh_and_publish.sh`。

驾驶舱日期范围与 KPI 会随新数据自动扩展，无需改前端代码。
