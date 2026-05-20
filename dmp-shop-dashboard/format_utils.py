# -*- coding: utf-8 -*-
"""看板数字格式化：千分位、无小数；转化率类指标保留小数。"""

from __future__ import annotations

import pandas as pd

# 转化率 / 比率类字段保留小数
RATE_COLS = {"买家转订单率", "推广费率", "推广费率_原始"}


def is_rate_col(col: str) -> bool:
    return col in RATE_COLS or "转化率" in str(col)


def fmt_int(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return f"{int(round(float(value))):,}"


def fmt_rate(value) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    v = float(value)
    if abs(v) <= 1:
        return f"{v:.2%}"
    return f"{v:.2f}"


def format_dataframe_display(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for col in out.columns:
        if not pd.api.types.is_numeric_dtype(out[col]):
            continue
        if is_rate_col(col):
            out[col] = out[col].map(fmt_rate)
        else:
            out[col] = out[col].map(fmt_int)
    return out


def apply_plotly_axis_format(fig, *, skip_x: bool = False) -> None:
    """金额/数量轴：千分位、无小数。"""
    layout = {}
    if not skip_x:
        layout["xaxis_tickformat"] = ",.0f"
    layout["yaxis_tickformat"] = ",.0f"
    if hasattr(fig, "layout") and fig.layout.yaxis2:
        layout["yaxis2_tickformat"] = ",.0f"
    fig.update_layout(**layout)


def apply_plotly_hover_int(fig) -> None:
    fig.update_traces(hovertemplate="%{y:,.0f}<extra></extra>", selector=dict(type="scatter", yaxis="y"))
    try:
        fig.update_traces(hovertemplate="%{y:,.0f}<extra></extra>", selector=dict(type="scatter", yaxis="y2"))
    except Exception:
        pass
