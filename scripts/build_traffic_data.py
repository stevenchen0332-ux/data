#!/usr/bin/env python3
"""扫描流量 Excel，生成 data/traffic_daily.json 供驾驶舱读取。"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent


def infer_platform(filename: str) -> str:
    if "天猫" in filename:
        return "天猫"
    if "拼多多" in filename:
        return "拼多多"
    if "餐饮" in filename:
        return "餐饮"
    return "其他"


def pick_sheet(xl: pd.ExcelFile) -> str:
    for name in ("日汇总", "日数据", "日报", "每日"):
        if name in xl.sheet_names:
            return name
    return xl.sheet_names[0]


def norm_col(c: Any) -> str:
    return str(c).strip()


def find_date_col(columns: list[str]) -> str | None:
    for c in columns:
        if norm_col(c) in ("日期", "时间", "date", "Date", "业务日期"):
            return c
    return None


def sum_spend_columns(df: pd.DataFrame) -> pd.Series:
    cols = [c for c in df.columns if "花费" in norm_col(c)]
    if not cols:
        return pd.Series(0.0, index=df.index)
    total = pd.Series(0.0, index=df.index)
    for c in cols:
        total += pd.to_numeric(df[c], errors="coerce").fillna(0.0)
    return total


def first_numeric(df: pd.DataFrame, names: tuple[str, ...]) -> pd.Series | None:
    for n in names:
        for c in df.columns:
            if norm_col(c) == n:
                return pd.to_numeric(df[c], errors="coerce")
    return None


def safe_float(x: Any, default: float = 0.0) -> float:
    try:
        v = float(x)
        if pd.isna(v):
            return default
        return v
    except (TypeError, ValueError):
        return default


def shop_from_filename(name: str) -> str:
    stem = Path(name).stem
    for suffix in (
        "_2026年1-5月日数据整理",
        "2026年1-5月日数据整理",
        "_2026年1-6月日数据整理",
        "2026年1-6月日数据整理",
    ):
        stem = stem.replace(suffix, "")
    return stem.strip("_ ").strip()


def process_file(path: Path) -> list[dict[str, Any]]:
    xl = pd.ExcelFile(path)
    sheet = pick_sheet(xl)
    df = pd.read_excel(path, sheet_name=sheet)
    df.columns = [norm_col(c) for c in df.columns]
    platform = infer_platform(path.name)
    shop = shop_from_filename(path.name)

    dcol = find_date_col(list(df.columns))
    if dcol is None:
        return []

    df["_d"] = pd.to_datetime(df[dcol], errors="coerce")
    df = df[df["_d"].notna()].copy()

    spend_from_huafei = sum_spend_columns(df)
    spend_heji = first_numeric(df, ("推广费用合计",))
    spend_toufang = first_numeric(df, ("投放金额",))
    spend = spend_from_huafei.copy()
    mask_zero = spend.eq(0) | spend.isna()
    if spend_heji is not None:
        spend = spend.where(~mask_zero, spend_heji.fillna(0))
    mask_zero = spend.eq(0) | spend.isna()
    if spend_toufang is not None:
        spend = spend.where(~mask_zero, spend_toufang.fillna(0))

    gmv = first_numeric(df, ("GMV",))
    if gmv is None:
        gmv = pd.Series(0.0, index=df.index)
    net = first_numeric(df, ("Net GMV", "NetGMV", "net gmv"))
    refund = first_numeric(df, ("成功退款金额", "退款金额", "退款"))
    buyers = first_numeric(df, ("支付买家数",))
    uv = first_numeric(df, ("UV",))
    orders = first_numeric(df, ("订单数",))
    cvr_col = first_numeric(df, ("CVR",))
    aov_col = first_numeric(df, ("客单价", "ASP"))
    ad_gmv = first_numeric(df, ("推广引入GMV", "成交金额"))
    roi_col = first_numeric(df, ("ROI", "ROI_GMV口径"))
    refund_rate_col = first_numeric(df, ("退款率",))

    if net is None and refund is not None:
        net = gmv - refund.fillna(0)
    if net is None:
        net = gmv.copy()
    if buyers is None:
        buyers = pd.Series(0.0, index=df.index)
    if uv is None:
        uv = pd.Series(0.0, index=df.index)

    cvr = cvr_col.copy() if cvr_col is not None else pd.to_numeric(buyers / uv.replace(0, np.nan), errors="coerce")
    aov = aov_col.copy() if aov_col is not None else pd.to_numeric(gmv / buyers.replace(0, np.nan), errors="coerce")
    if ad_gmv is None:
        ad_gmv = pd.Series(0.0, index=df.index)

    roi = roi_col.copy() if roi_col is not None else pd.to_numeric(ad_gmv / spend.replace(0, np.nan), errors="coerce")
    fee_ratio = pd.to_numeric(spend / gmv.replace(0, np.nan), errors="coerce")
    fee_ratio_net = pd.to_numeric(spend / net.replace(0, np.nan), errors="coerce")
    rr = refund_rate_col.copy() if refund_rate_col is not None else None
    if rr is None and refund is not None:
        rr = (refund / gmv.replace(0, pd.NA)).astype(float)

    rows: list[dict[str, Any]] = []
    for i in df.index:
        row = {
            "date": df.at[i, "_d"].strftime("%Y-%m-%d"),
            "shop": shop,
            "platform": platform,
            "sourceFile": path.name,
            "gmv": safe_float(gmv.at[i]),
            "netGmv": safe_float(net.at[i]) if net is not None else safe_float(gmv.at[i]),
            "uv": safe_float(uv.at[i]),
            "buyers": safe_float(buyers.at[i]),
            "orders": safe_float(orders.at[i]) if orders is not None else 0.0,
            "spend": safe_float(spend.at[i]),
            "adGmv": safe_float(ad_gmv.at[i]),
            "refund": safe_float(refund.at[i]) if refund is not None else 0.0,
            "refundRate": safe_float(rr.at[i]) if rr is not None and pd.notna(rr.at[i]) else None,
            "cvr": safe_float(cvr.at[i]),
            "aov": safe_float(aov.at[i]),
            "roi": safe_float(roi.at[i]) if roi is not None and pd.notna(roi.at[i]) else None,
            "feeRatio": safe_float(fee_ratio.at[i]) if fee_ratio is not None and pd.notna(fee_ratio.at[i]) else None,
            "feeRatioNet": safe_float(fee_ratio_net.at[i]) if fee_ratio_net is not None and pd.notna(fee_ratio_net.at[i]) else None,
        }
        if row["refundRate"] is None and row["gmv"] > 0 and row.get("refund"):
            row["refundRate"] = row["refund"] / row["gmv"]
        rows.append(row)
    return rows


def build_traffic_json(source_dir: Path, out_path: Path) -> dict[str, Any]:
    if not source_dir.is_dir():
        raise SystemExit(f"流量目录不存在: {source_dir}")

    all_rows: list[dict[str, Any]] = []
    skipped: list[str] = []
    for path in sorted(source_dir.glob("*.xlsx")):
        if path.name.startswith("~$") or path.name.startswith(".~"):
            continue
        try:
            all_rows.extend(process_file(path))
        except Exception as exc:
            skipped.append(f"{path.name}: {exc}")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(all_rows, ensure_ascii=False, indent=0), encoding="utf-8")

    dates = sorted({r["date"] for r in all_rows if r.get("date")})
    meta = {
        "rows": len(all_rows),
        "files": len(list(source_dir.glob("*.xlsx"))),
        "dateRange": [dates[0], dates[-1]] if dates else [],
        "skipped": skipped,
        "output": str(out_path),
    }
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    return meta


def main() -> None:
    default_traffic = Path(os.environ.get("TRAFFIC_DATA_DIR", str(Path.home() / "Desktop" / "日数据" / "流量")))
    parser = argparse.ArgumentParser(description="从流量 Excel 生成 traffic_daily.json")
    parser.add_argument("--source", type=Path, default=default_traffic, help="流量 Excel 目录")
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data" / "traffic_daily.json",
        help="输出 JSON 路径",
    )
    args = parser.parse_args()
    build_traffic_json(args.source.expanduser().resolve(), args.output.expanduser().resolve())


if __name__ == "__main__":
    main()
