# -*- coding: utf-8 -*-
"""店铺销售与推广数据：清洗、EDA、建模与报告输出。"""

from __future__ import annotations

import os
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

warnings.filterwarnings("ignore")

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "output"

SALES_FILE = BASE_DIR / "店铺销售.xls"
PROMO_FILE = BASE_DIR / "店铺推广.xls"

SALES_COLS = {
    "日期": "日期",
    "店铺名称": "店铺名称",
    "品牌": "品牌",
    "类目": "类目",
    "支付金额（元）": "支付金额（元）",
    "支付买家数": "支付买家数",
    "支付订单数": "支付订单数",
    "支付客单价 (元)": "支付客单价 (元)",
    "支付笔单价 (元)": "支付笔单价 (元)",
}

PROMO_COLS = {
    "日期": "日期",
    "店铺名称": "店铺名称",
    "推广总花费 (元)": "推广总花费 (元)",
    "现金花费 (元)": "现金花费 (元)",
    "虚拟金花费 (元)": "虚拟金花费 (元)",
    "红包花费 (元)": "红包花费 (元)",
    "推广花费/支付金额": "推广花费/支付金额",
}


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    return df


def _parse_rate(series: pd.Series) -> pd.Series:
    s = series.astype(str).str.strip().str.replace("%", "", regex=False)
    return pd.to_numeric(s, errors="coerce") / 100.0


def _read_excel_auto(path: Path) -> pd.DataFrame:
    xl = pd.ExcelFile(path)
    frames = [pd.read_excel(path, sheet_name=s) for s in xl.sheet_names]
    return pd.concat(frames, ignore_index=True)


def load_sales(path: Path | None = None) -> pd.DataFrame:
    path = path or SALES_FILE
    df = _normalize_columns(_read_excel_auto(path))
    df["日期"] = pd.to_datetime(df["日期"], errors="coerce")
    for col in ["支付金额（元）", "支付买家数", "支付订单数", "支付客单价 (元)", "支付笔单价 (元)"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def load_promo(path: Path | None = None) -> pd.DataFrame:
    path = path or PROMO_FILE
    df = _normalize_columns(_read_excel_auto(path))
    df["日期"] = pd.to_datetime(df["日期"], errors="coerce")
    for col in ["推广总花费 (元)", "现金花费 (元)", "虚拟金花费 (元)", "红包花费 (元)"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    if "推广花费/支付金额" in df.columns:
        df["推广费率_原始"] = _parse_rate(df["推广花费/支付金额"])
    return df


def aggregate_sales(df: pd.DataFrame) -> pd.DataFrame:
    return (
        df.groupby(["日期", "店铺名称"], as_index=False)
        .agg(
            {
                "支付金额（元）": "sum",
                "支付买家数": "sum",
                "支付订单数": "sum",
                "品牌": "nunique",
                "类目": "nunique",
            }
        )
        .rename(columns={"品牌": "品牌数", "类目": "类目数"})
    )


def aggregate_promo(df: pd.DataFrame) -> pd.DataFrame:
    spec = {
        "推广总花费 (元)": "sum",
        "现金花费 (元)": "sum",
        "虚拟金花费 (元)": "sum",
        "红包花费 (元)": "sum",
    }
    if "推广费率_原始" in df.columns:
        spec["推广费率_原始"] = "mean"
    agg = df.groupby(["日期", "店铺名称"], as_index=False).agg(spec)
    agg = agg.rename(
        columns={
            "推广总花费 (元)": "推广总花费",
            "现金花费 (元)": "现金花费",
            "虚拟金花费 (元)": "虚拟金花费",
            "红包花费 (元)": "红包花费",
        }
    )
    if "推广费率_原始" not in agg.columns:
        agg["推广费率_原始"] = np.nan
    return agg


def add_derived_metrics(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["推广总花费"] = out["推广总花费"].fillna(0)
    out["现金花费"] = out["现金花费"].fillna(0)
    out["虚拟金花费"] = out["虚拟金花费"].fillna(0)
    out["红包花费"] = out["红包花费"].fillna(0)

    out["ROI"] = np.where(out["推广总花费"] > 0, out["支付金额（元）"] / out["推广总花费"], np.nan)
    out["推广费率"] = np.where(
        out["支付金额（元）"] > 0,
        out["推广总花费"] / out["支付金额（元）"],
        np.nan,
    )
    out["客单价"] = np.where(out["支付买家数"] > 0, out["支付金额（元）"] / out["支付买家数"], np.nan)
    out["笔单价"] = np.where(out["支付订单数"] > 0, out["支付金额（元）"] / out["支付订单数"], np.nan)
    out["买家转订单率"] = np.where(
        out["支付买家数"] > 0,
        out["支付订单数"] / out["支付买家数"],
        np.nan,
    )
    out["周几"] = out["日期"].dt.dayofweek.map(
        {0: "周一", 1: "周二", 2: "周三", 3: "周四", 4: "周五", 5: "周六", 6: "周日"}
    )
    out["日期序号"] = (out["日期"] - out["日期"].min()).dt.days + 1
    return out


def merge_shop_daily(sales: pd.DataFrame | None = None, promo: pd.DataFrame | None = None) -> pd.DataFrame:
    sales = aggregate_sales(sales or load_sales())
    promo = aggregate_promo(promo or load_promo())
    merged = sales.merge(promo, on=["日期", "店铺名称"], how="left")
    return add_derived_metrics(merged)


def build_shop_summary(daily: pd.DataFrame) -> pd.DataFrame:
    g = daily.groupby("店铺名称", as_index=False).agg(
        销售额=("支付金额（元）", "sum"),
        推广费=("推广总花费", "sum"),
        买家数=("支付买家数", "sum"),
        订单数=("支付订单数", "sum"),
        日均销售额=("支付金额（元）", "mean"),
        日均推广费=("推广总花费", "mean"),
    )
    g["ROI"] = np.where(g["推广费"] > 0, g["销售额"] / g["推广费"], np.nan)
    g["推广费率"] = np.where(g["销售额"] > 0, g["推广费"] / g["销售额"], np.nan)
    g["客单价"] = np.where(g["买家数"] > 0, g["销售额"] / g["买家数"], np.nan)
    g["笔单价"] = np.where(g["订单数"] > 0, g["销售额"] / g["订单数"], np.nan)
    g["效率标签"] = g.apply(_efficiency_label, axis=1)
    g["经营建议"] = g["效率标签"].map(_efficiency_advice)
    return g.sort_values("销售额", ascending=False)


def _efficiency_label(row: pd.Series) -> str:
    roi = row.get("ROI", np.nan)
    rate = row.get("推广费率", np.nan)
    if pd.isna(roi) or pd.isna(rate):
        return "中效"
    if roi >= 15 and rate <= 0.08:
        return "高效"
    if roi < 8 or rate > 0.12:
        return "低效"
    return "中效"


def _efficiency_advice(label: str) -> str:
    return {
        "高效": "保持投放节奏，可小幅加投测试增量；关注库存与转化稳定性。",
        "中效": "优化投放结构与素材，聚焦高转化时段与品类，控制无效曝光。",
        "低效": "降本控费，复盘关键词/人群包，优先提升转化与客单而非盲目加投。",
    }.get(label, "持续监测核心指标。")


def kmeans_efficiency(shop_summary: pd.DataFrame, n_clusters: int = 3) -> pd.DataFrame:
    feats = ["销售额", "推广费", "ROI", "推广费率", "客单价", "买家数"]
    X = shop_summary[feats].replace([np.inf, -np.inf], np.nan).fillna(0)
    if len(X) < n_clusters:
        shop_summary["聚类标签"] = 0
        return shop_summary
    km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    shop_summary = shop_summary.copy()
    shop_summary["聚类标签"] = km.fit_predict(X)
    return shop_summary


def compute_correlations(daily: pd.DataFrame) -> pd.DataFrame:
    pairs = [
        ("推广总花费", "支付金额（元）"),
        ("推广总花费", "支付买家数"),
        ("推广总花费", "支付订单数"),
        ("推广总花费", "ROI"),
        ("推广费率", "ROI"),
        ("客单价", "ROI"),
    ]
    rows = []
    for a, b in pairs:
        sub = daily[[a, b]].replace([np.inf, -np.inf], np.nan).dropna()
        if len(sub) < 3:
            pearson = spearman = np.nan
        else:
            pearson, _ = stats.pearsonr(sub[a], sub[b])
            spearman, _ = stats.spearmanr(sub[a], sub[b])
        rows.append({"变量A": a, "变量B": b, "Pearson": pearson, "Spearman": spearman, "样本数": len(sub)})
    return pd.DataFrame(rows)


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    mask = y_true != 0
    if mask.sum() == 0:
        return np.nan
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)


def run_sales_model(daily: pd.DataFrame) -> dict:
    df = daily.copy()
    df["周几_num"] = df["日期"].dt.dayofweek
    feature_cols = ["店铺名称", "日期序号", "周几_num", "推广总花费", "现金花费", "红包花费"]
    target = "支付金额（元）"
    model_df = df[feature_cols + [target]].dropna()
    if len(model_df) < 20:
        return {"error": "样本不足，无法训练销售额模型"}

    X = model_df[feature_cols]
    y = model_df[target]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    pre = ColumnTransformer(
        [
            ("cat", OneHotEncoder(handle_unknown="ignore"), ["店铺名称"]),
            ("num", StandardScaler(), ["日期序号", "周几_num", "推广总花费", "现金花费", "红包花费"]),
        ]
    )

    models = {
        "Ridge": Ridge(alpha=1.0),
        "RandomForest": RandomForestRegressor(n_estimators=200, random_state=42, max_depth=8),
        "GradientBoosting": GradientBoostingRegressor(random_state=42, max_depth=4),
    }

    results = {}
    best_name, best_r2, best_pipe = None, -np.inf, None

    for name, est in models.items():
        pipe = Pipeline([("pre", pre), ("model", est)])
        pipe.fit(X_train, y_train)
        pred = pipe.predict(X_test)
        r2 = r2_score(y_test, pred)
        results[name] = {
            "R2": r2,
            "MAE": mean_absolute_error(y_test, pred),
            "MAPE": mape(y_test.values, pred),
        }
        if r2 > best_r2:
            best_r2, best_name, best_pipe = r2, name, pipe

    imp_rows = []
    if best_pipe is not None:
        perm = permutation_importance(best_pipe, X_test, y_test, n_repeats=5, random_state=42, n_jobs=1)
        for col, val in zip(feature_cols, perm.importances_mean):
            imp_rows.append({"特征": col, "重要性": val})

    return {
        "best_model": best_name,
        "metrics": results,
        "importance": pd.DataFrame(imp_rows).sort_values("重要性", ascending=False) if imp_rows else pd.DataFrame(),
    }


def spend_quartile_analysis(daily: pd.DataFrame) -> pd.DataFrame:
    df = daily.copy()
    df["推广费分层"] = pd.qcut(df["推广总花费"], q=4, duplicates="drop")
    return (
        df.groupby("推广费分层", observed=True)
        .agg(
            记录数=("支付金额（元）", "count"),
            平均销售额=("支付金额（元）", "mean"),
            平均推广费=("推广总花费", "mean"),
            平均ROI=("ROI", "mean"),
            平均推广费率=("推广费率", "mean"),
        )
        .reset_index()
    )


def anomaly_insights(daily: pd.DataFrame, shop_summary: pd.DataFrame) -> list[str]:
    insights = []
    s = shop_summary.copy()
    roi_med = s["ROI"].median()
    rate_med = s["推广费率"].median()
    sales_med = s["销售额"].median()
    spend_med = s["推广费"].median()

    high_spend_low_roi = s[(s["推广费"] > spend_med) & (s["ROI"] < roi_med)]["店铺名称"].tolist()
    low_spend_high_roi = s[(s["推广费"] < spend_med) & (s["ROI"] > roi_med)]["店铺名称"].tolist()
    high_sales_low_spend = s[(s["销售额"] > sales_med) & (s["推广费"] < spend_med)]["店铺名称"].tolist()
    high_spend_low_sales = s[(s["推广费"] > spend_med) & (s["销售额"] < sales_med)]["店铺名称"].tolist()

    if high_spend_low_roi:
        insights.append(f"高花费低 ROI 店铺：{', '.join(high_spend_low_roi[:5])}，建议控费并优化转化。")
    if low_spend_high_roi:
        insights.append(f"低花费高 ROI 店铺：{', '.join(low_spend_high_roi[:5])}，具备加投潜力。")
    if high_sales_low_spend:
        insights.append(f"高销售低投放店铺：{', '.join(high_sales_low_spend[:5])}，可测试适度加投。")
    if high_spend_low_sales:
        insights.append(f"高投放低销售店铺：{', '.join(high_spend_low_sales[:5])}，需复盘投放结构。")
    return insights


def generate_business_insights(daily: pd.DataFrame, shop_summary: pd.DataFrame, corr: pd.DataFrame) -> list[str]:
    insights = []
    top_sales = shop_summary.nlargest(3, "销售额")
    top_roi = shop_summary.dropna(subset=["ROI"]).nlargest(3, "ROI")
    high_rate = shop_summary[shop_summary["推广费率"] > shop_summary["推广费率"].quantile(0.75)]

    insights.append(
        "销售贡献最大店铺："
        + "；".join(f"{r['店铺名称']}（{r['销售额']:,.0f}元）" for _, r in top_sales.iterrows())
    )
    if len(top_roi):
        insights.append(
            "投放效率最高店铺："
            + "；".join(f"{r['店铺名称']}（ROI {int(round(r['ROI'])):,}）" for _, r in top_roi.iterrows())
        )
    if len(high_rate):
        insights.append(
            "推广费率偏高需优化："
            + "、".join(high_rate.nlargest(5, "推广费率")["店铺名称"].tolist())
        )

    spend_sales = corr.loc[corr["变量B"] == "支付金额（元）", "Pearson"]
    if len(spend_sales) and not pd.isna(spend_sales.iloc[0]):
        r = spend_sales.iloc[0]
        if r > 0.5:
            insights.append(f"推广花费与销售额 Pearson={r:.2f}，呈正相关（相关≠因果），加投可能带来销售 uplift。")
        elif r < 0.2:
            insights.append("推广花费与销售额相关性较弱，可能存在边际效率递减或投放结构问题。")

    q = spend_quartile_analysis(daily)
    if len(q) >= 2:
        roi_trend = q["平均ROI"].diff().dropna()
        if len(roi_trend) and roi_trend.iloc[-1] < 0:
            insights.append("推广费分层越高，平均 ROI 呈下降趋势，需警惕边际效率递减。")

    buyer_corr = daily[["支付金额（元）", "支付买家数", "客单价"]].corr()
    b_impact = abs(buyer_corr.loc["支付金额（元）", "支付买家数"])
    p_impact = abs(buyer_corr.loc["支付金额（元）", "客单价"])
    driver = "买家数" if b_impact > p_impact else "客单价"
    insights.append(f"店铺间销售差异更主要由{driver}驱动（基于日粒度相关结构，供参考）。")

    insights.extend(anomaly_insights(daily, shop_summary))
    return insights


def build_eda_summary(daily: pd.DataFrame, shop_summary: pd.DataFrame, corr: pd.DataFrame) -> pd.DataFrame:
    total_sales = daily["支付金额（元）"].sum()
    total_spend = daily["推广总花费"].sum()
    rows = [
        {"指标": "日期范围", "值": f"{daily['日期'].min().date()} ~ {daily['日期'].max().date()}"},
        {"指标": "店铺数", "值": daily["店铺名称"].nunique()},
        {"指标": "日粒度记录数", "值": len(daily)},
        {"指标": "缺失-推广费", "值": int(daily["推广总花费"].isna().sum())},
        {"指标": "总销售额", "值": round(total_sales, 2)},
        {"指标": "总推广费", "值": round(total_spend, 2)},
        {"指标": "整体ROI", "值": round(total_sales / total_spend, 2) if total_spend else np.nan},
        {"指标": "整体推广费率", "值": round(total_spend / total_sales, 4) if total_sales else np.nan},
        {"指标": "总买家数", "值": int(daily["支付买家数"].sum())},
        {"指标": "总订单数", "值": int(daily["支付订单数"].sum())},
        {"指标": "整体客单价", "值": round(total_sales / daily["支付买家数"].sum(), 2)},
        {"指标": "整体笔单价", "值": round(total_sales / daily["支付订单数"].sum(), 2)},
    ]
    for _, r in corr.iterrows():
        rows.append(
            {
                "指标": f"相关-{r['变量A']} vs {r['变量B']}",
                "值": f"Pearson={r['Pearson']:.3f}, Spearman={r['Spearman']:.3f}",
            }
        )
    return pd.DataFrame(rows)


def format_model_report(daily: pd.DataFrame, model_result: dict, shop_summary: pd.DataFrame, insights: list[str]) -> str:
    lines = ["=" * 60, "店铺推广与销售 — 建模分析报告", "=" * 60, ""]
    lines.append("【模型A：销售额预测】")
    if "error" in model_result:
        lines.append(model_result["error"])
    else:
        lines.append(f"最优模型：{model_result['best_model']}")
        for name, m in model_result["metrics"].items():
            lines.append(f"  {name}: R²={m['R2']:.4f}, MAE={m['MAE']:.2f}, MAPE={m['MAPE']:.2f}%")
        if not model_result["importance"].empty:
            lines.append("特征重要性（Permutation）：")
            for _, r in model_result["importance"].iterrows():
                lines.append(f"  - {r['特征']}: {r['重要性']:.4f}")
        lines.append("解读：推广花费、店铺差异与时间因素共同影响销售额；相关≠因果。")

    lines.extend(["", "【模型B：投放效率分层】"])
    for label in ["高效", "中效", "低效"]:
        shops = shop_summary[shop_summary["效率标签"] == label]["店铺名称"].tolist()
        lines.append(f"  {label}（{len(shops)}家）：{', '.join(shops) if shops else '无'}")

    lines.extend(["", "【业务洞察】"])
    for i, t in enumerate(insights, 1):
        lines.append(f"{i}. {t}")

    lines.extend(
        [
            "",
            "【运营建议摘要】",
            "1. 值得加投：高效且 ROI 领先、推广费率可控的店铺。",
            "2. 降本控费：低效、推广费率显著高于中位数的店铺。",
            "3. 补投机会：销售额高但推广费低于中位数的店铺。",
            "4. 边际效率：关注高推广分层 ROI 是否下滑。",
            "5. 增长驱动：结合买家数与客单价判断是流量还是客单驱动。",
        ]
    )
    return "\n".join(lines)


def run_full_analysis() -> dict:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    daily = merge_shop_daily()
    shop_summary = build_shop_summary(daily)
    shop_summary = kmeans_efficiency(shop_summary)
    corr = compute_correlations(daily)
    model_result = run_sales_model(daily)
    insights = generate_business_insights(daily, shop_summary, corr)
    eda_summary = build_eda_summary(daily, shop_summary, corr)

    daily.to_csv(DATA_DIR / "merged_shop_daily.csv", index=False, encoding="utf-8-sig")
    eda_summary.to_csv(OUTPUT_DIR / "eda_summary.csv", index=False, encoding="utf-8-sig")
    shop_summary.to_csv(OUTPUT_DIR / "shop_summary.csv", index=False, encoding="utf-8-sig")

    report = format_model_report(daily, model_result, shop_summary, insights)
    (OUTPUT_DIR / "model_report.txt").write_text(report, encoding="utf-8")

    return {
        "daily": daily,
        "shop_summary": shop_summary,
        "corr": corr,
        "model_result": model_result,
        "insights": insights,
        "eda_summary": eda_summary,
    }


if __name__ == "__main__":
    result = run_full_analysis()
    print("分析完成。")
    print(f"日粒度记录：{len(result['daily'])}")
    print(f"店铺数：{result['shop_summary']['店铺名称'].nunique()}")
    print("输出：data/merged_shop_daily.csv, output/*.csv, output/model_report.txt")
