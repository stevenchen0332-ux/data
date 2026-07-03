#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build the Tmall flagship sales tracking report from the monthly Excel file."""

from __future__ import annotations

import argparse
import html
import json
import math
import re
from datetime import datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = ROOT.parent
YEAR_COLS = {
    "FY24": list(range(2, 14)),
    "FY25": list(range(14, 26)),
    "FY26": list(range(26, 38)),
}
MONTHS = [f"{i}月" for i in range(1, 13)]


def latest_source() -> Path:
    files = sorted(DEFAULT_SOURCE_DIR.glob("太太乐-猫旗销售追踪-*.xlsx"))
    if not files:
        raise SystemExit(f"没有找到源文件: {DEFAULT_SOURCE_DIR}/太太乐-猫旗销售追踪-*.xlsx")
    return files[-1]


def clean_number(value):
    if pd.isna(value):
        return None
    if isinstance(value, str):
        value = value.replace(",", "").replace("%", "").strip()
        if not value:
            return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(num):
        return None
    return num


def row_values(df: pd.DataFrame, row: int, year: str) -> list[float | None]:
    return [clean_number(df.iat[row, col]) for col in YEAR_COLS[year]]


def metric_series(df: pd.DataFrame, row: int) -> dict[str, list[float | None]]:
    return {year: row_values(df, row, year) for year in YEAR_COLS}


def valid_month_count(values: list[float | None]) -> int:
    count = 0
    for value in values:
        if value is None:
            break
        count += 1
    return count


def safe_div(a, b):
    if a is None or b in (None, 0):
        return None
    return a / b


def fmt_money(value, unit="万"):
    if value is None:
        return "-"
    if unit == "万":
        return f"{value / 10000:.1f}万"
    return f"{value:,.0f}"


def fmt_num(value):
    if value is None:
        return "-"
    return f"{value:,.0f}"


def fmt_pct(value, digits=1):
    if value is None:
        return "-"
    return f"{value * 100:.{digits}f}%"


def fmt_ratio(value):
    if value is None:
        return "-"
    return f"{value:.2f}"


def pct_change(cur, base):
    if cur is None or base in (None, 0):
        return None
    return cur / base - 1


def label_change(value):
    if value is None:
        return "-"
    sign = "+" if value >= 0 else ""
    return f"{sign}{value * 100:.1f}%"


def sum_first(values: list[float | None], months: int) -> float | None:
    nums = [v for v in values[:months] if v is not None]
    return sum(nums) if nums else None


def avg_first(values: list[float | None], months: int) -> float | None:
    nums = [v for v in values[:months] if v is not None]
    return sum(nums) / len(nums) if nums else None


def parse_workbook(source: Path) -> dict:
    df = pd.read_excel(source, sheet_name="总【T】", header=None)
    overview_rows = {"GMV": 2, "UV": 3, "CVR": 4, "支付人数": 5, "客单价": 6}
    gmv_rows = {
        "自然销售": 10,
        "品专": 11,
        "推广": 12,
        "淘客": 13,
        "达人": 14,
        "店播": 15,
        "品专花费": 17,
        "推广花费": 18,
        "品专ROI": 19,
        "无界ROI": 20,
        "推广成交": 21,
    }
    traffic_rows = {"免费流量": 25, "付费流量": 26, "TTL": 27}
    customer_rows = {
        "新客GMV": 31,
        "新客购买人数": 32,
        "新客客单价": 33,
        "老客GMV": 34,
        "老客购买人数": 35,
        "老客客单价": 36,
        "会员GMV": 37,
        "会员购买人数": 38,
        "会员客单价": 39,
    }

    overview = {name: metric_series(df, row) for name, row in overview_rows.items()}
    gmv_mix = {name: metric_series(df, row) for name, row in gmv_rows.items()}
    traffic = {name: metric_series(df, row) for name, row in traffic_rows.items()}
    customers = {name: metric_series(df, row) for name, row in customer_rows.items()}

    months_available = valid_month_count(overview["GMV"]["FY26"])
    latest_idx = max(months_available - 1, 0)
    latest_month = MONTHS[latest_idx]

    fy26_ytd_gmv = sum_first(overview["GMV"]["FY26"], months_available)
    fy25_ytd_gmv = sum_first(overview["GMV"]["FY25"], months_available)
    fy24_ytd_gmv = sum_first(overview["GMV"]["FY24"], months_available)
    fy26_ytd_uv = sum_first(overview["UV"]["FY26"], months_available)
    fy25_ytd_uv = sum_first(overview["UV"]["FY25"], months_available)
    fy26_buyers = sum_first(overview["支付人数"]["FY26"], months_available)
    fy25_buyers = sum_first(overview["支付人数"]["FY25"], months_available)
    fy26_cvr = safe_div(fy26_buyers, fy26_ytd_uv)
    fy25_cvr = safe_div(fy25_buyers, fy25_ytd_uv)
    fy26_aov = safe_div(fy26_ytd_gmv, fy26_buyers)
    fy25_aov = safe_div(fy25_ytd_gmv, fy25_buyers)

    latest_metrics = []
    for name in ("GMV", "UV", "CVR", "支付人数", "客单价"):
        cur = overview[name]["FY26"][latest_idx]
        base = overview[name]["FY25"][latest_idx]
        latest_metrics.append(
            {
                "name": name,
                "current": cur,
                "base": base,
                "yoy": pct_change(cur, base),
            }
        )

    ytd_cards = [
        {"label": "FY26 YTD GMV", "value": fmt_money(fy26_ytd_gmv), "sub": f"同比 FY25 {label_change(pct_change(fy26_ytd_gmv, fy25_ytd_gmv))}"},
        {"label": "FY26 YTD UV", "value": fmt_num(fy26_ytd_uv), "sub": f"同比 FY25 {label_change(pct_change(fy26_ytd_uv, fy25_ytd_uv))}"},
        {"label": "FY26 YTD CVR", "value": fmt_pct(fy26_cvr, 2), "sub": f"FY25 同期 {fmt_pct(fy25_cvr, 2)}"},
        {"label": "FY26 YTD 客单价", "value": f"{fy26_aov:.1f}" if fy26_aov else "-", "sub": f"同比 FY25 {label_change(pct_change(fy26_aov, fy25_aov))}"},
    ]

    gmv_mix_table = []
    for name in ("自然销售", "品专", "推广", "淘客", "达人", "店播", "推广成交"):
        cur = sum_first(gmv_mix[name]["FY26"], months_available)
        base = sum_first(gmv_mix[name]["FY25"], months_available)
        share = safe_div(cur, fy26_ytd_gmv)
        gmv_mix_table.append({"name": name, "value": cur, "share": share, "yoy": pct_change(cur, base)})

    traffic_table = []
    for name in ("免费流量", "付费流量", "TTL"):
        cur = sum_first(traffic[name]["FY26"], months_available)
        base = sum_first(traffic[name]["FY25"], months_available)
        share = safe_div(cur, sum_first(traffic["TTL"]["FY26"], months_available)) if name != "TTL" else 1
        traffic_table.append({"name": name, "value": cur, "share": share, "yoy": pct_change(cur, base)})

    customer_table = []
    for segment in ("新客", "老客", "会员"):
        cur_gmv = sum_first(customers[f"{segment}GMV"]["FY26"], months_available)
        base_gmv = sum_first(customers[f"{segment}GMV"]["FY25"], months_available)
        cur_people = sum_first(customers[f"{segment}购买人数"]["FY26"], months_available)
        customer_table.append(
            {
                "name": segment,
                "gmv": cur_gmv,
                "share": safe_div(cur_gmv, fy26_ytd_gmv),
                "people": cur_people,
                "aov": safe_div(cur_gmv, cur_people),
                "yoy": pct_change(cur_gmv, base_gmv),
            }
        )

    monthly = []
    for i, month in enumerate(MONTHS[:months_available]):
        monthly.append(
            {
                "month": month,
                "fy24": overview["GMV"]["FY24"][i],
                "fy25": overview["GMV"]["FY25"][i],
                "fy26": overview["GMV"]["FY26"][i],
                "uv26": overview["UV"]["FY26"][i],
                "cvr26": overview["CVR"]["FY26"][i],
                "aov26": overview["客单价"]["FY26"][i],
            }
        )

    latest_gmv_yoy = pct_change(overview["GMV"]["FY26"][latest_idx], overview["GMV"]["FY25"][latest_idx])
    latest_uv_yoy = pct_change(overview["UV"]["FY26"][latest_idx], overview["UV"]["FY25"][latest_idx])
    latest_cvr_delta = None
    if overview["CVR"]["FY26"][latest_idx] is not None and overview["CVR"]["FY25"][latest_idx] is not None:
        latest_cvr_delta = overview["CVR"]["FY26"][latest_idx] - overview["CVR"]["FY25"][latest_idx]
    top_mix = max([r for r in gmv_mix_table if r["name"] != "推广成交"], key=lambda r: r["value"] or 0)
    top_customer = max(customer_table, key=lambda r: r["gmv"] or 0)
    insights = [
        f"{latest_month} GMV 同比 {label_change(latest_gmv_yoy)}，UV 同比 {label_change(latest_uv_yoy)}，CVR 同比变化 {label_change(latest_cvr_delta)}。",
        f"FY26 前 {months_available} 个月 GMV {fmt_money(fy26_ytd_gmv)}，较 FY25 同期 {label_change(pct_change(fy26_ytd_gmv, fy25_ytd_gmv))}。",
        f"GMV 结构里占比最高的是 {top_mix['name']}，FY26 YTD 占比 {fmt_pct(top_mix['share'])}。",
        f"客户结构中 {top_customer['name']} GMV 贡献最高，占 FY26 YTD GMV {fmt_pct(top_customer['share'])}。",
    ]

    return {
        "source": source.name,
        "generatedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "monthsAvailable": months_available,
        "latestMonth": latest_month,
        "ytdCards": ytd_cards,
        "latestMetrics": latest_metrics,
        "monthly": monthly,
        "gmvMix": gmv_mix_table,
        "traffic": traffic_table,
        "customers": customer_table,
        "insights": insights,
        "fy24YtdGmv": fy24_ytd_gmv,
        "fy25YtdGmv": fy25_ytd_gmv,
        "fy26YtdGmv": fy26_ytd_gmv,
    }


def js_json(data) -> str:
    return json.dumps(data, ensure_ascii=False, allow_nan=False)


def render_table(rows, columns) -> str:
    head = "".join(f"<th>{html.escape(title)}</th>" for title, _key, _fmt in columns)
    body = []
    for row in rows:
        cells = []
        for _title, key, formatter in columns:
            cells.append(f"<td>{html.escape(formatter(row.get(key)))}</td>")
        body.append("<tr>" + "".join(cells) + "</tr>")
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body)}</tbody></table>"


def build_html(data: dict) -> str:
    latest_table = render_table(
        data["latestMetrics"],
        [
            ("指标", "name", str),
            ("FY26", "current", lambda v: fmt_pct(v, 2) if v is not None and abs(v) < 1 and v != 0 else fmt_num(v)),
            ("FY25", "base", lambda v: fmt_pct(v, 2) if v is not None and abs(v) < 1 and v != 0 else fmt_num(v)),
            ("同比", "yoy", label_change),
        ],
    )
    mix_table = render_table(
        data["gmvMix"],
        [
            ("来源", "name", str),
            ("FY26 YTD GMV", "value", fmt_money),
            ("占比", "share", fmt_pct),
            ("同比", "yoy", label_change),
        ],
    )
    traffic_table = render_table(
        data["traffic"],
        [
            ("流量", "name", str),
            ("FY26 YTD", "value", fmt_num),
            ("占比", "share", fmt_pct),
            ("同比", "yoy", label_change),
        ],
    )
    customer_table = render_table(
        data["customers"],
        [
            ("客群", "name", str),
            ("GMV", "gmv", fmt_money),
            ("GMV占比", "share", fmt_pct),
            ("购买人数", "people", fmt_num),
            ("客单价", "aov", lambda v: f"{v:.1f}" if v is not None else "-"),
            ("GMV同比", "yoy", label_change),
        ],
    )
    cards = "".join(
        f"<div class='kpi'><div class='kpi-label'>{html.escape(c['label'])}</div><div class='kpi-value'>{html.escape(c['value'])}</div><div class='kpi-sub'>{html.escape(c['sub'])}</div></div>"
        for c in data["ytdCards"]
    )
    insights = "".join(f"<li>{html.escape(x)}</li>" for x in data["insights"])
    payload = js_json(data)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>太太乐猫旗销售追踪</title>
  <script src="./echarts.min.js"></script>
  <style>
    :root {{ --bg:#f5f7fb; --panel:#fff; --ink:#172033; --muted:#667085; --line:#e6eaf2; --blue:#2463eb; --green:#079455; --orange:#e57200; --red:#d92d20; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif; }}
    .page {{ max-width:1440px; margin:0 auto; padding:28px; }}
    .hero {{ background:#152238; color:#fff; border-radius:8px; padding:28px 32px; }}
    h1 {{ margin:0; font-size:30px; letter-spacing:0; }}
    .meta {{ color:#cbd5e1; margin-top:10px; line-height:1.6; }}
    .grid-4 {{ display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-top:18px; }}
    .grid-2 {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:16px; }}
    .kpi,.card {{ background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; box-shadow:0 1px 2px rgba(16,24,40,.04); }}
    .kpi-label,.note {{ color:var(--muted); font-size:13px; }}
    .kpi-value {{ margin-top:8px; font-size:28px; font-weight:760; }}
    .kpi-sub {{ margin-top:8px; color:var(--muted); font-size:13px; }}
    .section-title {{ display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin:22px 0 12px; }}
    h2 {{ font-size:20px; margin:0; }}
    .chart {{ height:360px; }}
    table {{ width:100%; border-collapse:collapse; font-size:13px; }}
    th,td {{ padding:10px 9px; border-bottom:1px solid var(--line); text-align:right; font-variant-numeric:tabular-nums; }}
    th:first-child,td:first-child {{ text-align:left; }}
    th {{ background:#f8fafc; color:#475467; font-weight:650; }}
    .insights {{ margin:0; padding-left:18px; line-height:1.75; color:#344054; }}
    .tag {{ display:inline-block; border-radius:999px; padding:3px 9px; background:#eef4ff; color:#1d4ed8; font-size:12px; }}
    @media (max-width: 900px) {{ .page {{ padding:16px; }} .grid-4,.grid-2 {{ grid-template-columns:1fr; }} .chart {{ height:300px; }} }}
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <h1>太太乐猫旗销售追踪</h1>
      <div class="meta">数据源：{html.escape(data['source'])} · 更新：{html.escape(data['generatedAt'])} · FY26 已读到 {data['latestMonth']}（前 {data['monthsAvailable']} 个月）</div>
    </section>
    <section class="grid-4">{cards}</section>
    <section>
      <div class="section-title"><h2>核心判断</h2><span class="tag">自动生成</span></div>
      <div class="card"><ul class="insights">{insights}</ul></div>
    </section>
    <section class="grid-2">
      <div class="card"><div class="section-title"><h2>月度 GMV 趋势</h2><span class="note">FY24/FY25/FY26</span></div><div id="gmvChart" class="chart"></div></div>
      <div class="card"><div class="section-title"><h2>{data['latestMonth']} 核心指标同比</h2><span class="note">FY26 vs FY25</span></div>{latest_table}</div>
    </section>
    <section class="grid-2">
      <div class="card"><div class="section-title"><h2>GMV 来源结构</h2><span class="note">FY26 YTD</span></div><div id="mixChart" class="chart"></div>{mix_table}</div>
      <div class="card"><div class="section-title"><h2>流量结构</h2><span class="note">FY26 YTD</span></div><div id="trafficChart" class="chart"></div>{traffic_table}</div>
    </section>
    <section class="grid-2">
      <div class="card"><div class="section-title"><h2>客户结构</h2><span class="note">新客 / 老客 / 会员</span></div><div id="customerChart" class="chart"></div>{customer_table}</div>
      <div class="card"><div class="section-title"><h2>UV / CVR / 客单价</h2><span class="note">FY26 月度</span></div><div id="factorChart" class="chart"></div></div>
    </section>
  </main>
  <script>
    const DATA = {payload};
    const moneyWan = v => v == null ? '-' : (v / 10000).toFixed(1) + '万';
    const pct = v => v == null ? '-' : (v * 100).toFixed(1) + '%';
    function chart(id, option) {{ echarts.init(document.getElementById(id)).setOption(option); }}
    const months = DATA.monthly.map(d => d.month);
    chart('gmvChart', {{
      tooltip: {{ trigger:'axis', valueFormatter: moneyWan }},
      legend: {{ top:0 }},
      grid: {{ left:56, right:24, top:46, bottom:36 }},
      xAxis: {{ type:'category', data:months }},
      yAxis: {{ type:'value', axisLabel:{{ formatter:v => (v/10000).toFixed(0)+'万' }} }},
      series: [
        {{ name:'FY24', type:'line', smooth:true, data:DATA.monthly.map(d=>d.fy24), lineStyle:{{width:2}} }},
        {{ name:'FY25', type:'line', smooth:true, data:DATA.monthly.map(d=>d.fy25), lineStyle:{{width:2}} }},
        {{ name:'FY26', type:'line', smooth:true, data:DATA.monthly.map(d=>d.fy26), lineStyle:{{width:4}}, areaStyle:{{opacity:.12}} }}
      ]
    }});
    chart('mixChart', {{
      tooltip: {{ trigger:'item', formatter:p => `${{p.name}}<br/>${{moneyWan(p.value)}} · ${{p.percent}}%` }},
      series: [{{ type:'pie', radius:['42%','72%'], data:DATA.gmvMix.filter(d=>d.name!=='推广成交').map(d=>({{name:d.name,value:d.value}})) }}]
    }});
    chart('trafficChart', {{
      tooltip: {{ trigger:'axis' }},
      grid: {{ left:60, right:24, top:24, bottom:36 }},
      xAxis: {{ type:'category', data:DATA.traffic.map(d=>d.name) }},
      yAxis: {{ type:'value' }},
      series: [{{ type:'bar', data:DATA.traffic.map(d=>d.value), itemStyle:{{color:'#2463eb'}}, label:{{show:true, position:'top', formatter:p=>Number(p.value).toLocaleString()}} }}]
    }});
    chart('customerChart', {{
      tooltip: {{ trigger:'axis', valueFormatter: moneyWan }},
      grid: {{ left:64, right:24, top:24, bottom:36 }},
      xAxis: {{ type:'category', data:DATA.customers.map(d=>d.name) }},
      yAxis: {{ type:'value', axisLabel:{{ formatter:v => (v/10000).toFixed(0)+'万' }} }},
      series: [{{ type:'bar', data:DATA.customers.map(d=>d.gmv), itemStyle:{{color:'#079455'}}, label:{{show:true, position:'top', formatter:p=>moneyWan(p.value)}} }}]
    }});
    chart('factorChart', {{
      tooltip: {{ trigger:'axis' }},
      legend: {{ top:0 }},
      grid: {{ left:58, right:58, top:48, bottom:36 }},
      xAxis: {{ type:'category', data:months }},
      yAxis: [{{ type:'value', name:'UV' }}, {{ type:'value', name:'CVR/AOV' }}],
      series: [
        {{ name:'UV', type:'bar', yAxisIndex:0, data:DATA.monthly.map(d=>d.uv26), itemStyle:{{color:'#94a3b8'}} }},
        {{ name:'CVR', type:'line', yAxisIndex:1, data:DATA.monthly.map(d=>d.cvr26), valueFormatter:pct, lineStyle:{{width:3,color:'#079455'}} }},
        {{ name:'客单价', type:'line', yAxisIndex:1, data:DATA.monthly.map(d=>d.aov26), lineStyle:{{width:3,color:'#e57200'}} }}
      ]
    }});
    window.addEventListener('resize', () => document.querySelectorAll('.chart').forEach(el => echarts.getInstanceByDom(el)?.resize()));
  </script>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="生成太太乐猫旗销售追踪网页")
    parser.add_argument("--source", type=Path, default=None, help="源 Excel 文件")
    parser.add_argument("--output", type=Path, default=ROOT / "index.html", help="输出 HTML")
    args = parser.parse_args()
    source = args.source or latest_source()
    data = parse_workbook(source)
    args.output.write_text(build_html(data), encoding="utf-8")
    print(f"已生成: {args.output}")
    print(f"数据源: {source}")


if __name__ == "__main__":
    main()
