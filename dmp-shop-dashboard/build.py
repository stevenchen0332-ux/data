#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键生成：读取 Excel → 分析导出 → 生成 HTML 看板

用法:
  python build.py
  python build.py --open   # 生成后自动用浏览器打开看板
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import webbrowser
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _check_inputs() -> None:
    sales = BASE_DIR / "店铺销售.xls"
    promo = BASE_DIR / "店铺推广.xls"
    missing = [p.name for p in (sales, promo) if not p.exists()]
    if missing:
        print(f"错误：缺少数据文件 {', '.join(missing)}")
        print("请将最新 Excel 放到项目目录后重试。")
        sys.exit(1)


def main(open_browser: bool = False) -> None:
    _check_inputs()
    print("=" * 50)
    print("店铺推广与销售看板 — 一键生成")
    print("=" * 50)

    print("\n[1/2] 数据分析与导出 (analysis.py)…")
    from analysis import run_full_analysis

    run_full_analysis()
    print("  ✓ data/merged_shop_daily.csv")
    print("  ✓ output/eda_summary.csv, shop_summary.csv, model_report.txt")

    print("\n[2/2] 生成 HTML 看板 (generate_html.py)…")
    from generate_html import main as gen_html

    gen_html()

    html_path = BASE_DIR / "dashboard.html"
    print("\n" + "=" * 50)
    print(f"完成！看板文件: {html_path}")
    print("双击 dashboard.html 或在浏览器中打开即可查看。")
    print("=" * 50)

    if open_browser:
        webbrowser.open(html_path.as_uri())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="一键生成数据看板")
    parser.add_argument("--open", action="store_true", help="生成后用浏览器打开看板")
    args = parser.parse_args()
    main(open_browser=args.open)
