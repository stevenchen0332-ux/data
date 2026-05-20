# -*- coding: utf-8 -*-
"""店铺推广与销售数据看板（Streamlit）。"""

from __future__ import annotations

import io

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from plotly.subplots import make_subplots

from analysis import (
    build_shop_summary,
    compute_correlations,
    generate_business_insights,
    merge_shop_daily,
    run_full_analysis,
)
from format_utils import fmt_int, fmt_rate, format_dataframe_display

st.set_page_config(page_title="店铺推广与销售看板", layout="wide", page_icon="📊")

METRIC_OPTIONS = {
    "销售额": "支付金额（元）",
    "推广费": "推广总花费",
    "ROI": "ROI",
    "推广费率": "推广费率",
    "买家数": "支付买家数",
    "订单数": "支付订单数",
    "客单价": "客单价",
}


@st.cache_data(show_spinner="加载并清洗数据…")
def load_data():
    daily = merge_shop_daily()
    shop = build_shop_summary(daily)
    corr = compute_correlations(daily)
    insights = generate_business_insights(daily, shop, corr)
    return daily, shop, corr, insights


def filter_data(daily: pd.DataFrame, date_range, shops: list[str]) -> pd.DataFrame:
    mask = (daily["日期"] >= pd.Timestamp(date_range[0])) & (daily["日期"] <= pd.Timestamp(date_range[1]))
    if shops:
        mask &= daily["店铺名称"].isin(shops)
    return daily.loc[mask].copy()


def kpi_cards(df: pd.DataFrame):
    sales = df["支付金额（元）"].sum()
    spend = df["推广总花费"].sum()
    buyers = df["支付买家数"].sum()
    orders = df["支付订单数"].sum()
    roi = sales / spend if spend else np.nan
    rate = spend / sales if sales else np.nan
    aov = sales / buyers if buyers else np.nan

    c1, c2, c3, c4, c5, c6, c7 = st.columns(7)
    c1.metric("总销售额", f"¥{fmt_int(sales)}")
    c2.metric("总推广费", f"¥{fmt_int(spend)}")
    c3.metric("ROI", fmt_int(roi) if not np.isnan(roi) else "-")
    c4.metric("推广费率", fmt_rate(rate) if not np.isnan(rate) else "-")
    c5.metric("支付买家数", fmt_int(buyers))
    c6.metric("支付订单数", fmt_int(orders))
    c7.metric("客单价", f"¥{fmt_int(aov)}" if not np.isnan(aov) else "-")


def trend_dual_axis(daily: pd.DataFrame):
    trend = (
        daily.groupby("日期", as_index=False)
        .agg(销售额=("支付金额（元）", "sum"), 推广费=("推广总花费", "sum"))
        .sort_values("日期")
    )
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    fig.add_trace(
        go.Scatter(
            x=trend["日期"], y=trend["销售额"], name="销售额", line=dict(color="#2563eb"),
            hovertemplate="%{x|%Y-%m-%d}<br>销售额: %{y:,.0f}<extra></extra>",
        ),
        secondary_y=False,
    )
    fig.add_trace(
        go.Scatter(
            x=trend["日期"], y=trend["推广费"], name="推广费", line=dict(color="#f97316"),
            hovertemplate="%{x|%Y-%m-%d}<br>推广费: %{y:,.0f}<extra></extra>",
        ),
        secondary_y=True,
    )
    fig.update_layout(title="销售额与推广费趋势", height=380, legend=dict(orientation="h"))
    fig.update_yaxes(title_text="销售额（元）", tickformat=",.0f", secondary_y=False)
    fig.update_yaxes(title_text="推广费（元）", tickformat=",.0f", secondary_y=True)
    return fig


def roi_trend(daily: pd.DataFrame):
    trend = daily.groupby("日期", as_index=False).agg(
        销售额=("支付金额（元）", "sum"),
        推广费=("推广总花费", "sum"),
    )
    trend["ROI"] = np.where(trend["推广费"] > 0, trend["销售额"] / trend["推广费"], np.nan)
    fig = px.line(trend, x="日期", y="ROI", title="每日 ROI 趋势", markers=True)
    fig.update_traces(hovertemplate="%{x|%Y-%m-%d}<br>ROI: %{y:,.0f}<extra></extra>")
    fig.update_layout(height=320, yaxis_tickformat=",.0f")
    return fig


def shop_bar(shop: pd.DataFrame, metric: str, title: str, ascending: bool = False):
    col = {"销售额": "销售额", "ROI": "ROI"}[metric]
    data = shop.dropna(subset=[col]).sort_values(col, ascending=ascending).head(15).copy()
    data["_label"] = data[col].map(fmt_int)
    fig = px.bar(data, x=col, y="店铺名称", orientation="h", title=title, text="_label")
    fig.update_traces(texttemplate="%{text}", textposition="outside")
    fig.update_layout(height=480, yaxis=dict(categoryorder="total ascending"), xaxis_tickformat=",.0f")
    return fig


def scatter_spend_sales(daily: pd.DataFrame, shop: pd.DataFrame):
    agg = (
        daily.groupby("店铺名称", as_index=False)
        .agg(销售额=("支付金额（元）", "sum"), 推广费=("推广总花费", "sum"), 买家数=("支付买家数", "sum"))
    )
    agg = agg.merge(shop[["店铺名称", "效率标签"]], on="店铺名称", how="left")
    fig = px.scatter(
        agg,
        x="推广费",
        y="销售额",
        size="买家数",
        color="效率标签",
        hover_name="店铺名称",
        title="推广费 vs 销售额（点大小=买家数，颜色=效率分层）",
        labels={"推广费": "推广费（元）", "销售额": "销售额（元）"},
    )
    fig.update_traces(
        hovertemplate="<b>%{hovertext}</b><br>推广费: %{x:,.0f}<br>销售额: %{y:,.0f}<extra></extra>"
    )
    fig.update_layout(height=420, xaxis_tickformat=",.0f", yaxis_tickformat=",.0f")
    return fig


def main():
    st.title("店铺推广与销售数据分析看板")
    st.caption("数据来源：店铺销售.xls + 店铺推广.xls | 相关≠因果，洞察供运营参考")

    with st.sidebar:
        st.header("筛选器")
        if st.button("重新运行完整分析并导出", type="primary"):
            with st.spinner("执行 analysis.py 全流程…"):
                run_full_analysis()
            st.cache_data.clear()
            st.success("已导出 data/ 与 output/ 文件")
        daily, shop_all, corr_all, insights_all = load_data()
        min_d, max_d = daily["日期"].min().date(), daily["日期"].max().date()
        date_range = st.date_input("日期范围", value=(min_d, max_d), min_value=min_d, max_value=max_d)
        if isinstance(date_range, tuple) and len(date_range) == 2:
            dr = date_range
        else:
            dr = (min_d, max_d)
        shops = st.multiselect(
            "店铺名称",
            options=sorted(daily["店铺名称"].unique()),
            default=sorted(daily["店铺名称"].unique()),
        )
        metric_label = st.selectbox("趋势主指标", list(METRIC_OPTIONS.keys()), index=0)

    daily_f = filter_data(daily, dr, shops)
    shop_f = build_shop_summary(daily_f)

    if daily_f.empty:
        st.warning("当前筛选无数据，请调整日期或店铺。")
        return

    st.subheader("核心 KPI")
    kpi_cards(daily_f)

    st.subheader("趋势与排名")
    t1, t2 = st.columns(2)
    with t1:
        st.plotly_chart(trend_dual_axis(daily_f), use_container_width=True)
    with t2:
        st.plotly_chart(roi_trend(daily_f), use_container_width=True)

    st.plotly_chart(shop_bar(shop_f, "销售额", "店铺销售额 TOP15"), use_container_width=True)

    st.subheader("关联分析")
    corr_f = compute_correlations(daily_f)
    st.plotly_chart(scatter_spend_sales(daily_f, shop_f), use_container_width=True)

    st.subheader("明细数据")
    tab1, tab2 = st.columns(2)
    with tab1:
        st.markdown("**店铺日粒度明细**")
        st.dataframe(format_dataframe_display(daily_f), use_container_width=True, height=280)
        buf = io.StringIO()
        daily_f.to_csv(buf, index=False, encoding="utf-8-sig")
        st.download_button("导出日明细 CSV", buf.getvalue(), "shop_daily_detail.csv", "text/csv")
    with tab2:
        st.markdown("**店铺汇总**")
        st.dataframe(format_dataframe_display(shop_f), use_container_width=True, height=280)
        buf2 = io.StringIO()
        shop_f.to_csv(buf2, index=False, encoding="utf-8-sig")
        st.download_button("导出店铺汇总 CSV", buf2.getvalue(), "shop_summary.csv", "text/csv")

    st.subheader("自动洞察")
    insights = generate_business_insights(daily_f, shop_f, corr_f)
    for line in insights:
        st.info(line)

    with st.expander("相关性说明（相关≠因果）"):
        st.dataframe(corr_f, use_container_width=True)
        st.markdown(
            """
- **Pearson**：线性相关；**Spearman**：秩相关，对异常值更稳健。
- 推广花费与销售额正相关，不代表加投必然带来同等销售增长。
- 推广费率与 ROI 负相关时，通常意味着投放占销售比越高、效率压力越大。
            """
        )


if __name__ == "__main__":
    main()
