# 店铺推广与销售数据分析看板

基于 `店铺销售.xls` 与 `店铺推广.xls` 的自动化清洗、分析、建模与 HTML 交互看板。

## 一键生成（更新数据后）

将最新的 **`店铺销售.xls`**、**`店铺推广.xls`** 放到本项目目录，然后任选一种方式：

### 方式 A：双击运行（macOS 推荐）

双击 **`一键生成.command`** → 自动分析并打开 `dashboard.html`

### 方式 B：终端命令

```bash
cd "/Users/chenjiwei/Desktop/太太乐/dmp数据"

# 首次安装依赖
/opt/anaconda3/bin/pip install -r requirements.txt xlrd

# 一键生成
/opt/anaconda3/bin/python build.py

# 生成并自动打开浏览器
/opt/anaconda3/bin/python build.py --open
```

或使用脚本：

```bash
chmod +x build.sh
./build.sh
```

### 生成结果

| 文件 | 说明 |
|------|------|
| `dashboard.html` | 主看板（浏览器打开） |
| `data/merged_shop_daily.csv` | 日粒度合并明细 |
| `output/eda_summary.csv` | 数据概览 |
| `output/shop_summary.csv` | 店铺汇总 |
| `output/model_report.txt` | 建模与业务报告 |

---

## 发布到 GitHub（一键推送）

已对接你的 GitHub 账号 **`stevenchen0332-ux`**，看板发布在仓库 **`data`** 的子目录：

**在线地址：** https://stevenchen0332-ux.github.io/data/dmp-shop-dashboard/

### 一键发布（推荐）

更新 Excel 后，在终端执行：

```bash
cd "/Users/chenjiwei/Desktop/太太乐/dmp数据"
./push_to_github.sh
```

脚本会自动：`build.py` 生成看板 → 推送到 `stevenchen0332-ux/data` → 同步 `gh-pages`。

若网络不稳定可多执行一次。

### 仅推送（临时目录已有提交时）

若上次克隆成功但推送失败，可执行：

```bash
cd /tmp/dmp-data-push && git push origin main
git fetch origin gh-pages:gh-pages && git checkout gh-pages && git merge origin/main && git push origin gh-pages
```

---

## Streamlit 看板（可选）

```bash
streamlit run app.py
```

---

## 项目结构

```
dmp数据/
├── 店铺销售.xls          # 原始数据（更新后覆盖此文件）
├── 店铺推广.xls
├── build.py              # 一键生成入口
├── build.sh
├── 一键生成.command       # macOS 双击运行
├── analysis.py           # 清洗、EDA、建模
├── generate_html.py      # 生成 dashboard.html
├── format_utils.py       # 数字格式化
├── app.py                # Streamlit 看板
├── dashboard.html        # 生成的主看板
├── data/
├── output/
└── .github/workflows/    # 自动部署 GitHub Pages
```

## 数据更新流程

1. 用新 Excel **覆盖** 目录中的 `店铺销售.xls`、`店铺推广.xls`
2. 运行 **`一键生成.command`** 或 `python build.py`
3. 查看 `dashboard.html`；若已配置 GitHub，执行 `git add . && git commit -m "更新数据" && git push`

## 业务口径

- **ROI** = 支付金额 / 推广总花费
- **推广费率** = 推广总花费 / 支付金额（保留小数百分比）
- **买家转订单率** = 支付订单数 / 支付买家数（保留小数）
- 其余金额/数量为千分位整数显示
