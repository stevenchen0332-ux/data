#!/usr/bin/env python3
"""Build a browser-friendly data bundle for the TaiTaiLe dashboard.

The browser cannot safely enumerate arbitrary local folders by itself. This
script scans the local data folder, normalizes CSV/Excel files, aggregates the
facts to a dashboard-friendly grain, and writes data-bundle.js for direct use
by index.html.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
from datetime import datetime
from pathlib import Path

import pandas as pd


SCRIPT_DIR = Path(__file__).resolve().parent
OUT_FILE = SCRIPT_DIR / "data-bundle.js"
CHUNK_SIZE = 160_000

ALIASES = {
    "date": ["日期", "订单日期", "发货时间", "下单时间", "订单创建日期", "出货日期"],
    "year": ["年份", "年"],
    "month": ["月份", "月"],
    "day": ["日", "天"],
    "amount": ["GMV", "销售金额", "应收金额", "合计", "摊分支付金额", "货品原总金额"],
    "quantity": ["数量", "销售数量", "货品数量", "出货量"],
    # store 必须在 channel 之前：detect_fields 按插入顺序匹配，子串命中时优先店铺维度
    "store": ["店铺", "店铺名称", "网店", "门店"],
    "channel": ["经销商", "渠道", "客户"],
    "product": ["产品名称", "商品名称", "品名", "SKU名称", "货品名称"],
    "sku": ["商品编码", "货品编号", "SKU编号", "编码"],
    "category": ["产品大类", "类目", "品类", "商品类目"],
    "province": ["省", "省份", "州省"],
    "city": ["市", "城市"],
    "visitors": ["访客数", "访客", "UV", "店铺访客数", "商品访客数"],
    "conversionRate": ["转化率", "支付转化率", "成交转化率", "CVR"],
    "promotionSpend": ["推广花费", "推广费用", "广告消耗", "广告花费", "花费", "消耗"],
    "impressions": ["曝光", "曝光量", "展现", "展现量"],
    "clicks": ["点击", "点击量"],
}

OPTIONAL_SUM_METRICS = ["visitors", "promotionSpend", "impressions", "clicks"]
OPTIONAL_RATE_METRICS = ["conversionRate"]
OPTIONAL_METRICS = OPTIONAL_SUM_METRICS + OPTIONAL_RATE_METRICS


def normalize_header(value: str) -> str:
    return re.sub(r"[\s_\-/:：|（）()[\]{}]", "", str(value).strip().lower())


def detect_fields(columns: list[str]) -> dict[str, str | None]:
    normalized = {normalize_header(col): col for col in columns}
    detected: dict[str, str | None] = {}
    for key, aliases in ALIASES.items():
        match = None
        for alias in aliases:
            norm = normalize_header(alias)
            if norm in normalized:
                match = normalized[norm]
                break
        if not match:
            for col in columns:
                norm_col = normalize_header(col)
                if key == "channel":
                    has_store_word = any(
                        normalize_header(sa) in norm_col for sa in ALIASES["store"]
                    )
                    has_channel_word = any(
                        normalize_header(alias) in norm_col for alias in aliases
                    )
                    if has_store_word and not has_channel_word:
                        continue
                if any(normalize_header(alias) in norm_col for alias in aliases):
                    match = col
                    break
        detected[key] = match
    return detected


def infer_year_month(path: Path) -> tuple[int | None, int | None]:
    name = path.stem
    match = re.search(r"(20\d{2})\D{0,3}(1[0-2]|0?[1-9])", name)
    if match:
        return int(match.group(1)), int(match.group(2))
    match = re.search(r"(?:^|[^\d])(1[0-2]|0?[1-9])\s*月", name)
    if match:
        return 2026, int(match.group(1))
    return 2026, None


def parse_date_frame(df: pd.DataFrame, fields: dict[str, str | None], path: Path) -> pd.Series:
    if fields.get("year") and fields.get("month") and fields.get("day"):
        return pd.to_datetime(
            {
                "year": pd.to_numeric(df[fields["year"]], errors="coerce"),
                "month": pd.to_numeric(df[fields["month"]], errors="coerce"),
                "day": pd.to_numeric(df[fields["day"]], errors="coerce"),
            },
            errors="coerce",
        )

    inferred_year, inferred_month = infer_year_month(path)
    raw = df[fields["date"]].astype(str).str.strip() if fields.get("date") else pd.Series([""] * len(df))
    six_digit = raw.str.match(r"^\d{6}$", na=False)
    day_only = raw.str.match(r"^\d{1,2}$", na=False)
    parsed = pd.to_datetime(raw.str.replace("/", "-", regex=False), errors="coerce")

    if six_digit.any():
      parsed.loc[six_digit] = pd.to_datetime("20" + raw.loc[six_digit], format="%Y%m%d", errors="coerce")

    if inferred_year and inferred_month and day_only.any():
        days = pd.to_numeric(raw.loc[day_only], errors="coerce")
        parsed.loc[day_only] = pd.to_datetime(
            {"year": inferred_year, "month": inferred_month, "day": days},
            errors="coerce",
        )
    return parsed


def clean_text(series: pd.Series, fallback: str = "未识别") -> pd.Series:
    return series.fillna("").astype(str).str.strip().replace("", fallback)


def numeric_series(series: pd.Series, as_rate: bool = False) -> pd.Series:
    text = (
        series.fillna("")
        .astype(str)
        .str.replace(",", "", regex=False)
        .str.replace("￥", "", regex=False)
        .str.replace("¥", "", regex=False)
        .str.strip()
    )
    percent_mask = text.str.contains("%", regex=False)
    values = pd.to_numeric(text.str.replace("%", "", regex=False), errors="coerce").fillna(0)
    if as_rate:
        values.loc[percent_mask | (values > 1)] = values.loc[percent_mask | (values > 1)] / 100
    return values


def read_file_chunks(path: Path):
    if path.suffix.lower() == ".csv":
        yield from pd.read_csv(path, chunksize=CHUNK_SIZE, dtype=str, low_memory=False)
    else:
        yield pd.read_excel(path, dtype=str)


def round_metric(value: float) -> float:
    if not math.isfinite(float(value)):
        return 0.0
    return round(float(value), 4)


def aggregate_fact(df: pd.DataFrame) -> pd.DataFrame:
    agg_map = {
        "amount": ("amount", "sum"),
        "quantity": ("quantity", "sum"),
        "orders": ("orders", "sum"),
    }
    for metric in OPTIONAL_SUM_METRICS:
        if metric in df.columns:
            agg_map[metric] = (metric, "sum")
    for metric in OPTIONAL_RATE_METRICS:
        if metric in df.columns:
            agg_map[metric] = (metric, "mean")

    group_cols = [c for c in ("date", "month", "channel", "store", "product", "sku", "category", "region") if c in df.columns]
    return df.groupby(group_cols, dropna=False).agg(**agg_map).reset_index()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scan a folder of CSV/Excel files and write data-bundle.js for the dashboard.",
    )
    default_dir = SCRIPT_DIR / "data"
    env_dir = os.environ.get("TTL_DASHBOARD_SOURCE_DIR", "").strip()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(env_dir).expanduser() if env_dir else default_dir,
        help=f"Folder with .csv/.xlsx/.xls (default: {default_dir} or TTL_DASHBOARD_SOURCE_DIR)",
    )
    args = parser.parse_args()
    source_dir = args.source.expanduser().resolve()
    if not source_dir.is_dir():
        raise SystemExit(f"Source directory does not exist or is not a folder: {source_dir}")

    files = sorted(
        p for p in source_dir.iterdir()
        if p.is_file() and p.suffix.lower() in {".csv", ".xlsx", ".xls"}
    )
    if not files:
        raise SystemExit(f"No CSV/Excel files found in {source_dir}")

    facts = []
    quality = []
    totals = {"rawRows": 0, "amount": 0.0, "quantity": 0.0}

    for path in files:
        file_rows = 0
        valid_rows = 0
        invalid_dates = 0
        missing_fields: list[str] = []
        detected_for_file: dict[str, str | None] | None = None
        file_parts = []

        for chunk in read_file_chunks(path):
            if detected_for_file is None:
                detected_for_file = detect_fields(list(chunk.columns))
                required = ["amount", "quantity", "channel", "product"]
                if not (detected_for_file.get("date") or (
                    detected_for_file.get("year") and detected_for_file.get("month") and detected_for_file.get("day")
                )):
                    missing_fields.append("日期")
                missing_fields.extend(key for key in required if not detected_for_file.get(key))

            fields = detected_for_file
            row_count = len(chunk)
            file_rows += row_count
            totals["rawRows"] += row_count

            date = parse_date_frame(chunk, fields, path)
            valid_mask = date.notna()
            invalid_dates += int((~valid_mask).sum())
            if not valid_mask.any():
                continue

            out = pd.DataFrame({
                "date": date.loc[valid_mask].dt.strftime("%Y-%m-%d"),
                "month": date.loc[valid_mask].dt.strftime("%Y-%m"),
                "channel": clean_text(chunk.loc[valid_mask, fields["channel"]]) if fields.get("channel") else "未识别渠道",
                "store": clean_text(chunk.loc[valid_mask, fields["store"]], "") if fields.get("store") else "",
                "product": clean_text(chunk.loc[valid_mask, fields["product"]]) if fields.get("product") else "未识别商品",
                "sku": clean_text(chunk.loc[valid_mask, fields["sku"]], "") if fields.get("sku") else "",
                "category": clean_text(chunk.loc[valid_mask, fields["category"]], "未识别类目") if fields.get("category") else "未识别类目",
                "region": clean_text(chunk.loc[valid_mask, fields["province"]], "未识别地区") if fields.get("province") else "未识别地区",
                "amount": pd.to_numeric(chunk.loc[valid_mask, fields["amount"]], errors="coerce").fillna(0) if fields.get("amount") else 0,
                "quantity": pd.to_numeric(chunk.loc[valid_mask, fields["quantity"]], errors="coerce").fillna(0) if fields.get("quantity") else 0,
            })
            for metric in OPTIONAL_SUM_METRICS:
                if fields.get(metric):
                    out[metric] = numeric_series(chunk.loc[valid_mask, fields[metric]])
            for metric in OPTIONAL_RATE_METRICS:
                if fields.get(metric):
                    out[metric] = numeric_series(chunk.loc[valid_mask, fields[metric]], as_rate=True)

            out["orders"] = 1
            valid_rows += len(out)
            totals["amount"] += float(out["amount"].sum())
            totals["quantity"] += float(out["quantity"].sum())
            grouped = aggregate_fact(out)
            file_parts.append(grouped)

        if file_parts:
            file_fact = aggregate_fact(pd.concat(file_parts, ignore_index=True))
            facts.append(file_fact)

        quality.append({
            "fileName": path.name,
            "rows": file_rows,
            "validRows": valid_rows,
            "invalidDateRows": invalid_dates,
            "missingFields": missing_fields,
            "fields": detected_for_file or {},
        })

    fact = aggregate_fact(pd.concat(facts, ignore_index=True))
    sort_cols = [c for c in ("date", "channel", "store", "product", "region") if c in fact.columns]
    fact = fact.sort_values(sort_cols).reset_index(drop=True)
    available_metrics = [
        metric for metric in OPTIONAL_METRICS
        if metric in fact.columns and fact[metric].notna().any() and float(fact[metric].fillna(0).abs().sum()) > 0
    ]

    dates = sorted(fact["date"].unique().tolist())
    months = sorted(fact["month"].unique().tolist())
    channels = sorted(fact["channel"].unique().tolist())
    categories = sorted(fact["category"].unique().tolist())
    regions = sorted(fact["region"].unique().tolist())

    product_keys = fact[["sku", "product"]].drop_duplicates().sort_values(["product", "sku"])
    products = product_keys.to_dict("records")

    date_idx = {v: i for i, v in enumerate(dates)}
    channel_idx = {v: i for i, v in enumerate(channels)}
    category_idx = {v: i for i, v in enumerate(categories)}
    region_idx = {v: i for i, v in enumerate(regions)}
    product_idx = {(row["sku"], row["product"]): i for i, row in enumerate(products)}

    store_series = fact["store"].astype(str).str.strip() if "store" in fact.columns else pd.Series([""] * len(fact))
    has_store_dim = bool(store_series.ne("").any())
    stores: list[str] = []
    store_idx: dict[str, int] = {}
    if has_store_dim:
        stores = sorted({s for s in store_series.tolist() if s})
        store_idx = {v: i for i, v in enumerate(stores)}

    rows = []
    for rec in fact.itertuples(index=False):
        packed_row = [
            date_idx[rec.date],
            channel_idx[rec.channel],
        ]
        if has_store_dim:
            s = str(getattr(rec, "store", "") or "").strip()
            packed_row.append(int(store_idx[s]) if s in store_idx else -1)
        packed_row.extend(
            [
                product_idx[(rec.sku, rec.product)],
                category_idx[rec.category],
                region_idx[rec.region],
                round_metric(rec.amount),
                round_metric(rec.quantity),
                int(rec.orders),
            ],
        )
        for metric in available_metrics:
            packed_row.append(round_metric(getattr(rec, metric, 0) or 0))
        rows.append(packed_row)

    bundle = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "sourceDir": str(source_dir),
        "meta": {
            "rawRows": int(totals["rawRows"]),
            "factRows": len(rows),
            "amount": round_metric(totals["amount"]),
            "quantity": round_metric(totals["quantity"]),
            "dateRange": [dates[0], dates[-1]] if dates else [],
            "months": months,
            "files": len(files),
            "operationFields": available_metrics,
        },
        "dims": {
            "dates": dates,
            "months": months,
            "channels": channels,
            "products": products,
            "categories": categories,
            "regions": regions,
            **({"stores": stores} if has_store_dim else {}),
        },
        "rows": rows,
        "metrics": available_metrics,
        "quality": quality,
    }

    payload = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    OUT_FILE.write_text(f"window.TTL_DASHBOARD_DATA={payload};\n", encoding="utf-8")
    print(json.dumps(bundle["meta"], ensure_ascii=False, indent=2))
    print(f"Wrote {OUT_FILE} ({OUT_FILE.stat().st_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    main()
