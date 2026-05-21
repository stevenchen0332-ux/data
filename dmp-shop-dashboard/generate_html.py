# -*- coding: utf-8 -*-
"""生成独立 HTML 看板 dashboard.html"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from analysis import (
    build_shop_summary,
    compute_correlations,
    generate_business_insights,
    merge_shop_daily,
    run_full_analysis,
)
from format_utils import fmt_int, fmt_rate, format_dataframe_display

BASE_DIR = Path(__file__).resolve().parent
OUT_HTML = BASE_DIR / "dashboard.html"


def _fig_html(fig, div_id: str) -> str:
    return fig.to_html(
        full_html=False,
        include_plotlyjs=False,
        div_id=div_id,
        config={"displayModeBar": True, "responsive": True},
    )


def _trend_dual(daily: pd.DataFrame) -> go.Figure:
    t = daily.groupby("日期", as_index=False).agg(销售额=("支付金额（元）", "sum"), 推广费=("推广总花费", "sum"))
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    fig.add_trace(
        go.Scatter(
            x=t["日期"], y=t["销售额"], name="销售额", line=dict(color="#2563eb"),
            hovertemplate="%{x|%Y-%m-%d}<br>销售额: %{y:,.0f}<extra></extra>",
        ),
        secondary_y=False,
    )
    fig.add_trace(
        go.Scatter(
            x=t["日期"], y=t["推广费"], name="推广费", line=dict(color="#f97316"),
            hovertemplate="%{x|%Y-%m-%d}<br>推广费: %{y:,.0f}<extra></extra>",
        ),
        secondary_y=True,
    )
    fig.update_layout(title="销售额与推广费趋势", height=360, margin=dict(t=50, b=40), legend=dict(orientation="h"))
    fig.update_yaxes(tickformat=",.0f", secondary_y=False)
    fig.update_yaxes(tickformat=",.0f", secondary_y=True)
    return fig


def _roi_trend(daily: pd.DataFrame) -> go.Figure:
    t = daily.groupby("日期", as_index=False).agg(销售额=("支付金额（元）", "sum"), 推广费=("推广总花费", "sum"))
    t["ROI"] = np.where(t["推广费"] > 0, t["销售额"] / t["推广费"], np.nan)
    fig = px.line(t, x="日期", y="ROI", title="每日 ROI 趋势", markers=True, height=320)
    fig.update_traces(hovertemplate="%{x|%Y-%m-%d}<br>ROI: %{y:,.0f}<extra></extra>")
    fig.update_layout(yaxis_tickformat=",.0f")
    return fig


def _shop_bar(shop: pd.DataFrame, col: str, title: str) -> go.Figure:
    d = shop.dropna(subset=[col]).nlargest(15, col).copy()
    d["_label"] = d[col].map(fmt_int)
    fig = px.bar(d, x=col, y="店铺名称", orientation="h", title=title, text="_label")
    fig.update_traces(texttemplate="%{text}", textposition="outside")
    fig.update_layout(height=460, yaxis=dict(categoryorder="total ascending"), margin=dict(l=180), xaxis_tickformat=",.0f")
    return fig


def _scatter(daily: pd.DataFrame, shop: pd.DataFrame) -> go.Figure:
    agg = daily.groupby("店铺名称", as_index=False).agg(
        销售额=("支付金额（元）", "sum"), 推广费=("推广总花费", "sum"), 买家数=("支付买家数", "sum")
    )
    agg = agg.merge(shop[["店铺名称", "效率标签"]], on="店铺名称", how="left")
    fig = px.scatter(
        agg, x="推广费", y="销售额", size="买家数", color="效率标签",
        hover_name="店铺名称", title="推广费 vs 销售额",
    )
    fig.update_traces(
        hovertemplate="<b>%{hovertext}</b><br>推广费: %{x:,.0f}<br>销售额: %{y:,.0f}<extra></extra>"
    )
    fig.update_layout(height=400, xaxis_tickformat=",.0f", yaxis_tickformat=",.0f")
    return fig


def build_html(daily: pd.DataFrame, shop: pd.DataFrame, insights: list[str]) -> str:
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    daily_json = daily.copy()
    daily_json["日期"] = daily_json["日期"].dt.strftime("%Y-%m-%d")
    payload = {
        "daily": json.loads(daily_json.to_json(orient="records", force_ascii=False)),
        "shops": sorted(daily["店铺名称"].unique().tolist()),
        "insights": insights,
        "dateMin": daily["日期"].min().strftime("%Y-%m-%d"),
        "dateMax": daily["日期"].max().strftime("%Y-%m-%d"),
    }

    charts = {
        "chart_trend": _fig_html(_trend_dual(daily), "chart_trend"),
        "chart_roi": _fig_html(_roi_trend(daily), "chart_roi"),
        "chart_sales": _fig_html(_shop_bar(shop, "销售额", "店铺销售额 TOP15"), "chart_sales"),
        "chart_scatter": _fig_html(_scatter(daily, shop), "chart_scatter"),
    }

    shop_table = format_dataframe_display(shop).to_html(index=False, classes="data-table", border=0)
    daily_preview = daily.head(50).copy()
    daily_preview["日期"] = daily_preview["日期"].dt.strftime("%Y-%m-%d")
    daily_table = format_dataframe_display(daily_preview).to_html(index=False, classes="data-table", border=0)

    insight_html = "".join(f'<div class="insight-item">{t}</div>' for t in insights)

    total_sales = daily["支付金额（元）"].sum()
    total_spend = daily["推广总花费"].sum()
    roi = total_sales / total_spend if total_spend else 0
    rate = total_spend / total_sales if total_sales else 0

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>店铺推广与销售看板</title>
  <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
  <style>
    :root {{
      --bg: #f8fafc; --card: #fff; --text: #0f172a; --muted: #64748b;
      --primary: #2563eb; --border: #e2e8f0;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
      background: var(--bg); color: var(--text); }}
    .wrap {{ max-width: 1400px; margin: 0 auto; padding: 20px; }}
    h1 {{ margin: 0 0 6px; font-size: 1.6rem; }}
    .sub {{ color: var(--muted); margin-bottom: 20px; font-size: 0.9rem; }}
    .filters {{ background: var(--card); border: 1px solid var(--border); border-radius: 12px;
      padding: 16px; display: flex; flex-wrap: wrap; gap: 16px; align-items: end; margin-bottom: 20px; }}
    .filters label {{ display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 4px; }}
    .filters input {{ padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; min-width: 140px; }}
    .ms-dropdown {{ position: relative; min-width: 260px; }}
    .ms-trigger {{
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px;
      background: #fff; cursor: pointer; min-width: 260px; user-select: none;
    }}
    .ms-trigger:hover {{ border-color: var(--primary); }}
    .ms-trigger.open {{ border-color: var(--primary); box-shadow: 0 0 0 2px rgba(37,99,235,.15); }}
    .ms-trigger-text {{ flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9rem; }}
    .ms-arrow {{ color: var(--muted); font-size: 0.7rem; transition: transform .2s; }}
    .ms-trigger.open .ms-arrow {{ transform: rotate(180deg); }}
    .ms-panel {{
      display: none; position: absolute; top: calc(100% + 4px); left: 0; z-index: 100;
      width: 320px; background: #fff; border: 1px solid var(--border); border-radius: 10px;
      box-shadow: 0 8px 24px rgba(15,23,42,.12);
    }}
    .ms-panel.open {{ display: block; }}
    .ms-toolbar {{ padding: 8px; border-bottom: 1px solid var(--border); display: flex; gap: 6px; flex-wrap: wrap; }}
    .ms-toolbar input {{ flex: 1; min-width: 120px; padding: 6px 8px; font-size: 0.85rem; }}
    .ms-toolbar button {{
      padding: 5px 10px; font-size: 0.78rem; border: 1px solid var(--border);
      border-radius: 6px; background: #f8fafc; cursor: pointer;
    }}
    .ms-toolbar button:hover {{ background: #e2e8f0; }}
    .ms-list {{ max-height: 220px; overflow-y: auto; padding: 6px 0; }}
    .ms-item {{
      display: flex; align-items: center; gap: 8px; padding: 7px 12px; cursor: pointer; font-size: 0.88rem;
    }}
    .ms-item:hover {{ background: #f1f5f9; }}
    .ms-item input {{ cursor: pointer; accent-color: var(--primary); }}
    .btn {{ background: var(--primary); color: #fff; border: none; padding: 9px 16px; border-radius: 8px; cursor: pointer; }}
    .kpi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px; }}
    .kpi {{ background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px; }}
    .kpi .label {{ font-size: 0.78rem; color: var(--muted); }}
    .kpi .val {{ font-size: 1.25rem; font-weight: 700; margin-top: 4px; }}
    .section {{ margin-bottom: 24px; }}
    .section h2 {{ font-size: 1.1rem; margin: 0 0 12px; }}
    .grid2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
    @media (max-width: 900px) {{ .grid2 {{ grid-template-columns: 1fr; }} }}
    .chart-box {{ background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 8px; overflow: hidden; }}
    .insights {{ background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 14px; }}
    .insight-item {{ padding: 8px 0; border-bottom: 1px dashed #bfdbfe; font-size: 0.92rem; line-height: 1.5; }}
    .insight-item:last-child {{ border-bottom: none; }}
    .data-table {{ width: 100%; border-collapse: collapse; font-size: 0.82rem; }}
    .data-table th, .data-table td {{ border: 1px solid var(--border); padding: 6px 8px; text-align: left; }}
    .data-table th {{ background: #f1f5f9; }}
    .table-wrap {{ background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px; overflow: auto; max-height: 360px; }}
    .export-btn {{ margin-top: 8px; background: #0f172a; }}
    .note {{ font-size: 0.8rem; color: var(--muted); margin-top: 8px; }}
  </style>
</head>
<body>
<div class="wrap">
  <h1>店铺推广与销售数据分析看板</h1>
  <p class="sub">数据周期 {payload["dateMin"]} ~ {payload["dateMax"]} · 共 {len(payload["shops"])} 家店铺 · 相关≠因果</p>

  <div class="filters">
    <div>
      <label>开始日期</label>
      <input type="date" id="dateStart" value="{payload["dateMin"]}" min="{payload["dateMin"]}" max="{payload["dateMax"]}" />
    </div>
    <div>
      <label>结束日期</label>
      <input type="date" id="dateEnd" value="{payload["dateMax"]}" min="{payload["dateMin"]}" max="{payload["dateMax"]}" />
    </div>
    <div class="ms-dropdown" id="shopDropdown">
      <label>店铺</label>
      <div class="ms-trigger" id="shopTrigger" onclick="toggleShopDropdown(event)">
        <span class="ms-trigger-text" id="shopTriggerText">请选择店铺</span>
        <span class="ms-arrow">▼</span>
      </div>
      <div class="ms-panel" id="shopPanel">
        <div class="ms-toolbar">
          <input type="text" id="shopSearch" placeholder="搜索店铺…" oninput="filterShopList()" />
          <button type="button" onclick="selectAllShops()">全选</button>
          <button type="button" onclick="clearAllShops()">清空</button>
        </div>
        <div class="ms-list" id="shopList"></div>
      </div>
    </div>
    <button class="btn" onclick="applyFilter()">应用筛选</button>
    <button class="btn" style="background:#64748b" onclick="resetFilter()">重置</button>
    <button class="btn" style="background:#0f766e" onclick="refreshOnline()">刷新线上数据</button>
  </div>

  <p class="note">最后生成：{generated_at}。数据文件更新后，运行「一键刷新线上看板.command」发布；发布完成后点击“刷新线上数据”或重新打开页面。</p>

  <div class="kpi-grid" id="kpiGrid">
    <div class="kpi"><div class="label">总销售额</div><div class="val" id="kpiSales">¥{fmt_int(total_sales)}</div></div>
    <div class="kpi"><div class="label">总推广费</div><div class="val" id="kpiSpend">¥{fmt_int(total_spend)}</div></div>
    <div class="kpi"><div class="label">ROI</div><div class="val" id="kpiRoi">{fmt_int(roi)}</div></div>
    <div class="kpi"><div class="label">推广费率</div><div class="val" id="kpiRate">{fmt_rate(rate)}</div></div>
    <div class="kpi"><div class="label">支付买家数</div><div class="val" id="kpiBuyers">{fmt_int(daily["支付买家数"].sum())}</div></div>
    <div class="kpi"><div class="label">支付订单数</div><div class="val" id="kpiOrders">{fmt_int(daily["支付订单数"].sum())}</div></div>
    <div class="kpi"><div class="label">客单价</div><div class="val" id="kpiAov">¥{fmt_int(total_sales/daily["支付买家数"].sum())}</div></div>
  </div>

  <div class="section">
    <h2>趋势与排名</h2>
    <div class="grid2">
      <div class="chart-box">{charts["chart_trend"]}</div>
      <div class="chart-box">{charts["chart_roi"]}</div>
    </div>
    <div class="chart-box" style="margin-top:16px">{charts["chart_sales"]}</div>
  </div>

  <div class="section">
    <h2>关联分析</h2>
    <div class="chart-box">{charts["chart_scatter"]}</div>
  </div>

  <div class="section">
    <h2>业务洞察</h2>
    <div class="insights" id="insightBox">{insight_html}</div>
    <p class="note">说明：相关性不代表因果关系，投放决策需结合库存、活动与竞品情况综合判断。</p>
  </div>

  <div class="section grid2">
    <div>
      <h2>店铺汇总</h2>
      <div class="table-wrap">{shop_table}</div>
      <button class="btn export-btn" onclick="exportCsv('shop')">导出店铺汇总 CSV</button>
    </div>
    <div>
      <h2>日粒度明细（预览前50行）</h2>
      <div class="table-wrap">{daily_table}</div>
      <button class="btn export-btn" onclick="exportCsv('daily')">导出日明细 CSV</button>
    </div>
  </div>
</div>

<script>
const RAW = {json.dumps(payload, ensure_ascii=False)};

const selectedShops = new Set();

function initShops() {{
  const list = document.getElementById('shopList');
  RAW.shops.forEach(s => {{
    selectedShops.add(s);
    const row = document.createElement('label');
    row.className = 'ms-item';
    row.dataset.name = s;
    row.innerHTML = `<input type="checkbox" value="${{s}}" checked onchange="onShopCheck(this)" /><span>${{s}}</span>`;
    list.appendChild(row);
  }});
  updateShopTriggerText();
}}

function getSelectedShops() {{
  return Array.from(selectedShops);
}}

function updateShopTriggerText() {{
  const n = selectedShops.size;
  const total = RAW.shops.length;
  const el = document.getElementById('shopTriggerText');
  if (n === 0) el.textContent = '请选择店铺';
  else if (n === total) el.textContent = `已选全部 ${{total}} 家店铺`;
  else if (n <= 2) el.textContent = Array.from(selectedShops).join('、');
  else el.textContent = `已选 ${{n}} / ${{total}} 家店铺`;
}}

function onShopCheck(cb) {{
  if (cb.checked) selectedShops.add(cb.value);
  else selectedShops.delete(cb.value);
  updateShopTriggerText();
}}

function toggleShopDropdown(e) {{
  e.stopPropagation();
  const panel = document.getElementById('shopPanel');
  const trigger = document.getElementById('shopTrigger');
  const open = panel.classList.toggle('open');
  trigger.classList.toggle('open', open);
}}

function closeShopDropdown() {{
  document.getElementById('shopPanel').classList.remove('open');
  document.getElementById('shopTrigger').classList.remove('open');
}}

function filterShopList() {{
  const q = document.getElementById('shopSearch').value.trim().toLowerCase();
  document.querySelectorAll('#shopList .ms-item').forEach(row => {{
    row.style.display = row.dataset.name.toLowerCase().includes(q) ? '' : 'none';
  }});
}}

function selectAllShops() {{
  document.querySelectorAll('#shopList input[type=checkbox]').forEach(cb => {{
    if (cb.closest('.ms-item').style.display !== 'none') {{
      cb.checked = true;
      selectedShops.add(cb.value);
    }}
  }});
  updateShopTriggerText();
}}

function clearAllShops() {{
  document.querySelectorAll('#shopList input[type=checkbox]').forEach(cb => {{
    cb.checked = false;
    selectedShops.delete(cb.value);
  }});
  updateShopTriggerText();
}}

document.addEventListener('click', e => {{
  if (!document.getElementById('shopDropdown').contains(e.target)) closeShopDropdown();
}});

function getFiltered() {{
  const start = document.getElementById('dateStart').value;
  const end = document.getElementById('dateEnd').value;
  const shops = getSelectedShops();
  if (!shops.length) return [];
  return RAW.daily.filter(r => r['日期'] >= start && r['日期'] <= end && shops.includes(r['店铺名称']));
}}

function sum(arr, key) {{ return arr.reduce((a, b) => a + (Number(b[key]) || 0), 0); }}

function fmtNum(n) {{
  return Math.round(n).toLocaleString('zh-CN', {{maximumFractionDigits: 0}});
}}

function fmtRate(ratio) {{
  if (ratio <= 1) return (ratio * 100).toFixed(2) + '%';
  return ratio.toFixed(2);
}}

function updateKpi(rows) {{
  const sales = sum(rows, '支付金额（元）');
  const spend = sum(rows, '推广总花费');
  const buyers = sum(rows, '支付买家数');
  const orders = sum(rows, '支付订单数');
  document.getElementById('kpiSales').textContent = '¥' + fmtNum(sales);
  document.getElementById('kpiSpend').textContent = '¥' + fmtNum(spend);
  document.getElementById('kpiRoi').textContent = spend ? fmtNum(sales/spend) : '-';
  document.getElementById('kpiRate').textContent = sales ? fmtRate(spend/sales) : '-';
  document.getElementById('kpiBuyers').textContent = fmtNum(buyers);
  document.getElementById('kpiOrders').textContent = fmtNum(orders);
  document.getElementById('kpiAov').textContent = buyers ? '¥' + fmtNum(sales/buyers) : '-';
}}

function groupByDate(rows) {{
  const m = {{}};
  rows.forEach(r => {{
    const d = r['日期'];
    if (!m[d]) m[d] = {{日期: d, 销售额:0, 推广费:0}};
    m[d].销售额 += r['支付金额（元）'];
    m[d].推广费 += r['推广总花费'];
  }});
  return Object.values(m).sort((a,b) => a.日期.localeCompare(b.日期));
}}

function applyFilter() {{
  const rows = getFiltered();
  updateKpi(rows);
  const trend = groupByDate(rows);
  const dates = trend.map(t => t.日期);
  Plotly.react('chart_trend', [
    {{x: dates, y: trend.map(t=>t.销售额), type:'scatter', name:'销售额', line:{{color:'#2563eb'}},
      hovertemplate:'%{{x}}<br>销售额: %{{y:,.0f}}<extra></extra>'}},
    {{x: dates, y: trend.map(t=>t.推广费), type:'scatter', name:'推广费', yaxis:'y2', line:{{color:'#f97316'}},
      hovertemplate:'%{{x}}<br>推广费: %{{y:,.0f}}<extra></extra>'}}
  ], {{
    title:'销售额与推广费趋势（筛选后）',
    yaxis:{{title:'销售额', tickformat:',.0f'}},
    yaxis2:{{title:'推广费', overlaying:'y', side:'right', tickformat:',.0f'}},
    height:360, margin:{{t:50}}
  }});
  const roiY = trend.map(t => t.推广费 > 0 ? t.销售额/t.推广费 : null);
  Plotly.react('chart_roi', [{{
    x: dates, y: roiY, type:'scatter', mode:'lines+markers', name:'ROI',
    hovertemplate:'%{{x}}<br>ROI: %{{y:,.0f}}<extra></extra>'
  }}], {{title:'每日 ROI（筛选后）', height:320, margin:{{t:50}}, yaxis:{{tickformat:',.0f'}}}});
}}

function resetFilter() {{
  document.getElementById('dateStart').value = RAW.dateMin;
  document.getElementById('dateEnd').value = RAW.dateMax;
  selectedShops.clear();
  RAW.shops.forEach(s => selectedShops.add(s));
  document.querySelectorAll('#shopList input[type=checkbox]').forEach(cb => {{ cb.checked = true; }});
  document.getElementById('shopSearch').value = '';
  filterShopList();
  updateShopTriggerText();
  applyFilter();
}}

function refreshOnline() {{
  const url = new URL(window.location.href);
  url.searchParams.set('v', Date.now().toString());
  window.location.href = url.toString();
}}

function exportCsv(type) {{
  const rows = getFiltered();
  let data, name;
  if (type === 'daily') {{
    data = rows; name = 'shop_daily.csv';
  }} else {{
    const m = {{}};
    rows.forEach(r => {{
      const s = r['店铺名称'];
      if (!m[s]) m[s] = {{店铺名称:s, 销售额:0, 推广费:0, 买家数:0, 订单数:0}};
      m[s].销售额 += r['支付金额（元）'];
      m[s].推广费 += r['推广总花费'];
      m[s].买家数 += r['支付买家数'];
      m[s].订单数 += r['支付订单数'];
    }});
    data = Object.values(m).map(x => ({{
      ...x, ROI: x.推广费 ? x.销售额/x.推广费 : '', 推广费率: x.销售额 ? x.推广费/x.销售额 : ''
    }}));
    name = 'shop_summary.csv';
  }}
  if (!data.length) return alert('无数据可导出');
  const keys = Object.keys(data[0]);
  const csv = [keys.join(',')].concat(data.map(r => keys.map(k => r[k]).join(','))).join('\\n');
  const blob = new Blob(['\\ufeff'+csv], {{type:'text/csv;charset=utf-8'}});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
}}

initShops();
</script>
</body>
</html>"""


def main():
    if not (BASE_DIR / "data" / "merged_shop_daily.csv").exists():
        run_full_analysis()
    daily = merge_shop_daily()
    shop = build_shop_summary(daily)
    corr = compute_correlations(daily)
    insights = generate_business_insights(daily, shop, corr)
    html = build_html(daily, shop, insights)
    OUT_HTML.write_text(html, encoding="utf-8")
    print(f"已生成: {OUT_HTML}")


if __name__ == "__main__":
    main()
