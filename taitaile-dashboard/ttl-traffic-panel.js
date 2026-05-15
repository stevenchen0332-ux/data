/**
 * 流量转化经营分析 — 独立模块（不修改出货主看板逻辑）
 * 数据优先级：
 * 1) window.TTL_TRAFFIC_CONVERSION_SUMMARY（「流量转化数据汇总表」接入点，见 TrafficAnalysisPanel.tsx 类型）
 * 2) 由当前筛选下的经营事实行（与主看板同源 filteredRecords）派生；缺流量列时用 GMV/出货为主、流量类指标可能为 0
 */
(() => {
  "use strict";

  const COLORS = {
    primary: "#2454a6",
    positive: "#14845f",
    negative: "#c2413a",
    muted: "#667085",
    grid: "#e5ebf3",
    text: "#172033",
    warn: "#b7791f",
    teal: "#7fc0b8",
    rose: "#f7a6b5",
  };

  /** @type {Record<string, any>} */
  const chartBag = {};

  let pendingCtx = null;
  let rafScheduled = false;

  function readNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function sum(arr) {
    return arr.reduce((a, b) => a + b, 0);
  }

  function formatMoney(n) {
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e8) return `¥${(n / 1e8).toFixed(2)}亿`;
    if (abs >= 1e4) return `¥${(n / 1e4).toFixed(2)}万`;
    return `¥${Math.round(n).toLocaleString("zh-CN")}`;
  }

  function formatInt(n) {
    if (!Number.isFinite(n)) return "—";
    return Math.round(n).toLocaleString("zh-CN");
  }

  function formatPct(rate) {
    if (!Number.isFinite(rate)) return "—";
    return `${(rate * 100).toFixed(2)}%`;
  }

  function formatGrowth(rate) {
    if (!Number.isFinite(rate)) return "—";
    const pct = rate * 100;
    const rounded = Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1);
    return `${pct >= 0 ? "+" : ""}${rounded}%`;
  }

  function sumTrafficFromRecords(records) {
    let visitors = 0;
    let impressions = 0;
    let clicks = 0;
    let convWeight = 0;
    let convNumerator = 0;
    records.forEach((record) => {
      visitors += readNum(record.visitors);
      impressions += readNum(record.impressions);
      clicks += readNum(record.clicks);
      const v = readNum(record.visitors);
      let cvr = readNum(record.conversionRate);
      if (cvr > 1.000001) cvr /= 100;
      if (v > 0 && cvr > 0) {
        convWeight += v;
        convNumerator += v * cvr;
      }
    });
    return { visitors, impressions, clicks, convWeight, convNumerator };
  }

  function estimateOrderCount(records) {
    const orderIds = new Set(records.map((record) => record.orderId).filter(Boolean));
    const missingOrderRows = sum(
      records.filter((record) => !record.orderId).map((record) => readNum(record.orderCount) || 1),
    );
    return orderIds.size + missingOrderRows;
  }

  function aggregateCommerce(records) {
    const gmv = sum(records.map((r) => readNum(r.amount)));
    const traffic = sumTrafficFromRecords(records);
    const uv = traffic.visitors;
    const promo = sum(records.map((r) => readNum(r.promotionSpend)));
    const orders = estimateOrderCount(records);
    let cvr = 0;
    if (traffic.convWeight > 0) cvr = traffic.convNumerator / traffic.convWeight;
    else if (uv > 0 && orders > 0) cvr = orders / uv;
    const aov = orders > 0 ? gmv / orders : uv > 0 && cvr > 0 ? gmv / (uv * cvr) : 0;
    const stub = window.TTL_TRAFFIC_CONVERSION_STUB || {};
    const refundRate = readNum(stub.refundRate);
    const netGmv = gmv * (1 - Math.min(Math.max(refundRate, 0), 0.95));
    const roi = promo > 0 ? gmv / promo : 0;
    const feeRatio = gmv > 0 ? promo / gmv : 0;
    const promoGmvShare = readNum(stub.promotedGmvShare);
    return {
      gmv,
      netGmv,
      uv,
      cvr,
      aov,
      promo,
      roi,
      refundRate,
      feeRatio,
      promoGmvShare,
      orders,
      qty: sum(records.map((r) => readNum(r.quantity))),
    };
  }

  function growthRate(cur, prev) {
    if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
    return (cur - prev) / Math.abs(prev);
  }

  function arrowClass(rate, higherIsBetter) {
    if (rate == null || !Number.isFinite(rate)) return ["ttl-traffic__arrow--muted", "→", "环比 n/a"];
    const good = higherIsBetter ? rate >= 0 : rate <= 0;
    const sym = rate >= 0 ? "▲" : "▼";
    return [good ? "ttl-traffic__arrow--good" : "ttl-traffic__arrow--bad", sym, `环比 ${formatGrowth(rate)}`];
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setKpiRow({ valueId, subId, cur, prev, higherIsBetter, fmt }) {
    setText(valueId, fmt(cur));
    const rate = growthRate(cur, prev);
    const [cls, sym, line] = arrowClass(rate, higherIsBetter);
    const sub = document.getElementById(subId);
    if (sub) {
      sub.innerHTML = `<span>${line}</span> <span class="ttl-traffic__arrow ${cls}" aria-hidden="true">${sym}</span>`;
    }
  }

  function mergeExternalSummary(_records, _ctx) {
    const ext = window.TTL_TRAFFIC_CONVERSION_SUMMARY;
    if (!ext || typeof ext !== "object") return null;
    return ext;
  }

  function dailyFromRecords(records) {
    const map = new Map();
    records.forEach((r) => {
      const dk = r.dateKey;
      if (!dk) return;
      if (!map.has(dk)) {
        map.set(dk, { date: dk, shipmentQty: 0, gmv: 0, uv: 0, cvrW: 0, cvrN: 0, promo: 0 });
      }
      const o = map.get(dk);
      o.shipmentQty += readNum(r.quantity);
      o.gmv += readNum(r.amount);
      o.uv += readNum(r.visitors);
      o.promo += readNum(r.promotionSpend);
      const v = readNum(r.visitors);
      let cvr = readNum(r.conversionRate);
      if (cvr > 1.000001) cvr /= 100;
      if (v > 0 && cvr > 0) {
        o.cvrW += v;
        o.cvrN += v * cvr;
      }
    });
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  function baseChartOption() {
    return {
      animationDuration: 380,
      textStyle: { fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", Arial, sans-serif', color: COLORS.text },
    };
  }

  function chartGrid(top = 32) {
    return { left: 48, right: 52, top, bottom: 28 };
  }

  function getChart(domId) {
    if (!window.echarts) return null;
    const el = document.getElementById(domId);
    if (!el) return null;
    if (!chartBag[domId]) chartBag[domId] = window.echarts.init(el, null, { renderer: "canvas" });
    return chartBag[domId];
  }

  function disposeCharts() {
    Object.keys(chartBag).forEach((k) => {
      try {
        chartBag[k].dispose();
      } catch {
        /* ignore */
      }
      delete chartBag[k];
    });
  }

  function renderBridge(daily) {
    const chart = getChart("ttlTrafficBridgeChart");
    if (!chart) return;
    const tail = daily.slice(-45);
    if (!tail.length) {
      chart.setOption({
        ...baseChartOption(),
        title: { text: "暂无日粒度数据", left: "center", top: "middle", textStyle: { color: COLORS.muted, fontSize: 13 } },
      });
      return;
    }
    const uv = tail.map((d) => Math.round(d.uv));
    const cvr = tail.map((d) => (d.cvrW > 0 ? (d.cvrN / d.cvrW) * 100 : 0));
    const aov = tail.map((d) => {
      const ordersGuess = d.cvrW > 0 && d.cvrN > 0 ? (d.cvrN / d.cvrW) * d.uv : 0;
      return ordersGuess > 0 ? d.gmv / ordersGuess : d.uv > 0 ? d.gmv / d.uv : 0;
    });
    const gmv = tail.map((d) => Math.round(d.gmv));
    chart.setOption({
      ...baseChartOption(),
      tooltip: { trigger: "axis" },
      legend: { top: 0, textStyle: { color: COLORS.muted, fontSize: 11 } },
      grid: chartGrid(44),
      xAxis: { type: "category", data: tail.map((d) => d.date), axisLabel: { color: COLORS.muted, fontSize: 10 } },
      yAxis: [
        { type: "value", name: "UV", axisLabel: { color: COLORS.muted }, splitLine: { lineStyle: { color: COLORS.grid } } },
        { type: "value", name: "GMV", position: "right", axisLabel: { color: COLORS.muted }, splitLine: { show: false } },
      ],
      series: [
        { name: "UV", type: "line", smooth: true, showSymbol: false, data: uv, lineStyle: { width: 2, color: COLORS.primary } },
        { name: "CVR(%)", type: "line", smooth: true, showSymbol: false, yAxisIndex: 0, data: cvr, lineStyle: { width: 1.6, color: COLORS.warn } },
        { name: "AOV", type: "line", smooth: true, showSymbol: false, yAxisIndex: 0, data: aov, lineStyle: { width: 1.6, color: COLORS.teal } },
        { name: "GMV", type: "line", smooth: true, showSymbol: false, yAxisIndex: 1, data: gmv, lineStyle: { width: 2, color: COLORS.rose } },
      ],
    });
  }

  function renderDual(daily) {
    const chart = getChart("ttlTrafficDualAxisChart");
    if (!chart) return;
    const tail = daily.slice(-60);
    if (!tail.length) {
      chart.setOption({
        ...baseChartOption(),
        title: { text: "暂无数据", left: "center", top: "middle", textStyle: { color: COLORS.muted, fontSize: 13 } },
      });
      return;
    }
    chart.setOption({
      ...baseChartOption(),
      tooltip: { trigger: "axis" },
      legend: { top: 0, textStyle: { color: COLORS.muted, fontSize: 11 } },
      grid: chartGrid(40),
      xAxis: { type: "category", data: tail.map((d) => d.date), axisLabel: { color: COLORS.muted, fontSize: 10 } },
      yAxis: [
        {
          type: "value",
          name: "出货数量",
          axisLabel: { color: COLORS.muted },
          splitLine: { lineStyle: { color: COLORS.grid } },
        },
        {
          type: "value",
          name: "GMV",
          position: "right",
          axisLabel: { color: COLORS.muted },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "出货数量",
          type: "bar",
          barMaxWidth: 14,
          data: tail.map((d) => Math.round(d.shipmentQty)),
          itemStyle: { color: COLORS.primary },
        },
        {
          name: "GMV",
          type: "line",
          smooth: true,
          yAxisIndex: 1,
          showSymbol: false,
          data: tail.map((d) => Math.round(d.gmv)),
          lineStyle: { width: 2, color: COLORS.rose },
        },
      ],
    });
  }

  function renderEfficiencyCards(cur) {
    setText("ttlEffPromo", formatMoney(cur.promo));
    setText("ttlEffRoi", cur.promo > 0 && Number.isFinite(cur.roi) ? cur.roi.toFixed(2) : "—");
    setText("ttlEffFeeRatio", cur.gmv > 0 ? formatPct(cur.feeRatio) : "—");
    if (cur.promoGmvShare > 0) {
      setText("ttlEffPromoGmv", formatPct(cur.promoGmvShare));
      setText("ttlEffPromoGmvNote", "来自 TTL_TRAFFIC_CONVERSION_STUB.promotedGmvShare");
    } else {
      setText("ttlEffPromoGmv", "—");
      setText("ttlEffPromoGmvNote", "待接入推广归因 GMV 后计算占比");
    }
  }

  function buildDiagnostics(cur, prev, momRates) {
    const bullets = [];
    const cvrR = momRates.cvr;
    const uvR = momRates.uv;
    if (cvrR != null && uvR != null && cvrR <= -0.03 && uvR >= 0.03) {
      bullets.push("访客规模扩大但转化率走弱：优先排查落地页、价格带、库存与客服承接，避免「有流量无成交」。");
    }
    if (cur.promo > 0 && cur.roi < 1.1 && cur.roi > 0) {
      bullets.push("推广 ROI 低于 1.1：建议收缩低效计划、核对归因窗口，并对比自然成交占比是否被挤压。");
    }
    if (cur.refundRate >= 0.05) {
      bullets.push(`退款率约 ${formatPct(cur.refundRate)}：关注品控、物流破损与描述一致性，避免差评拖累转化。`);
    }
    if (bullets.length < 3) {
      bullets.push("GMV 分解关注 UV×CVR×AOV：先定位哪一支变化最大，再下沉到渠道与店铺执行清单。");
    }
    if (bullets.length < 3) {
      bullets.push("投放侧同步看费比与 ROI：费用上升需有 GMV 或新客增量支撑，否则应做周度复盘纠偏。");
    }
    if (bullets.length < 3) {
      bullets.push("对比周期建议固定为完整自然周/月，减少大促错位造成的伪波动。");
    }
    return bullets.slice(0, 3);
  }

  function renderDiagnostics(bullets) {
    const ul = document.getElementById("ttlTrafficDiagList");
    if (!ul) return;
    ul.innerHTML = bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateBadge(extSummary) {
    const el = document.getElementById("ttlTrafficDataBadge");
    if (!el) return;
    if (extSummary && extSummary.meta && extSummary.meta.source) {
      el.textContent = `数据源：${extSummary.meta.source}`;
      el.classList.remove("ttl-traffic__badge--stub");
    } else {
      el.textContent = "数据源：经营事实派生（可接入 TTL_TRAFFIC_CONVERSION_SUMMARY）";
      el.classList.add("ttl-traffic__badge--stub");
    }
  }

  function runUpdate(context) {
    const records = context.filteredRecords || [];
    const prevRecords = context.previousMonthRecords || [];
    if (!records.length) {
      [
        "ttlTrafficKpiGmv",
        "ttlTrafficKpiNetGmv",
        "ttlTrafficKpiUv",
        "ttlTrafficKpiCvr",
        "ttlTrafficKpiAov",
        "ttlTrafficKpiPromo",
        "ttlTrafficKpiRoi",
        "ttlTrafficKpiRefund",
      ].forEach((id) => setText(id, "—"));
      [
        "ttlTrafficKpiGmvSub",
        "ttlTrafficKpiNetGmvSub",
        "ttlTrafficKpiUvSub",
        "ttlTrafficKpiCvrSub",
        "ttlTrafficKpiAovSub",
        "ttlTrafficKpiPromoSub",
        "ttlTrafficKpiRoiSub",
        "ttlTrafficKpiRefundSub",
      ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = "";
      });
      setText("ttlEffPromo", "—");
      setText("ttlEffRoi", "—");
      setText("ttlEffFeeRatio", "—");
      setText("ttlEffPromoGmv", "—");
      setText("ttlEffPromoGmvNote", "");
      const ul = document.getElementById("ttlTrafficDiagList");
      if (ul) ul.innerHTML = "";
      updateBadge(null);
      disposeCharts();
      return;
    }

    const ext = mergeExternalSummary(records, context);
    updateBadge(ext);

    const cur = aggregateCommerce(records);
    const p = aggregateCommerce(prevRecords);
    const momRates = {
      gmv: growthRate(cur.gmv, p.gmv),
      net: growthRate(cur.netGmv, p.netGmv),
      uv: growthRate(cur.uv, p.uv),
      cvr: growthRate(cur.cvr, p.cvr),
      aov: growthRate(cur.aov, p.aov),
      promo: growthRate(cur.promo, p.promo),
      roi: growthRate(cur.roi, p.roi),
      refund: growthRate(cur.refundRate, p.refundRate),
    };

    setKpiRow({
      valueId: "ttlTrafficKpiGmv",
      subId: "ttlTrafficKpiGmvSub",
      cur: cur.gmv,
      prev: p.gmv,
      higherIsBetter: true,
      fmt: formatMoney,
    });
    setKpiRow({
      valueId: "ttlTrafficKpiNetGmv",
      subId: "ttlTrafficKpiNetGmvSub",
      cur: cur.netGmv,
      prev: p.netGmv,
      higherIsBetter: true,
      fmt: formatMoney,
    });
    setKpiRow({
      valueId: "ttlTrafficKpiUv",
      subId: "ttlTrafficKpiUvSub",
      cur: cur.uv,
      prev: p.uv,
      higherIsBetter: true,
      fmt: formatInt,
    });
    setKpiRow({
      valueId: "ttlTrafficKpiCvr",
      subId: "ttlTrafficKpiCvrSub",
      cur: cur.cvr,
      prev: p.cvr,
      higherIsBetter: true,
      fmt: formatPct,
    });
    setKpiRow({
      valueId: "ttlTrafficKpiAov",
      subId: "ttlTrafficKpiAovSub",
      cur: cur.aov,
      prev: p.aov,
      higherIsBetter: true,
      fmt: formatMoney,
    });
    setKpiRow({
      valueId: "ttlTrafficKpiPromo",
      subId: "ttlTrafficKpiPromoSub",
      cur: cur.promo,
      prev: p.promo,
      higherIsBetter: false,
      fmt: formatMoney,
    });
    setKpiRow({
      valueId: "ttlTrafficKpiRoi",
      subId: "ttlTrafficKpiRoiSub",
      cur: cur.promo > 0 ? cur.roi : NaN,
      prev: p.promo > 0 ? p.roi : NaN,
      higherIsBetter: true,
      fmt: (x) => (Number.isFinite(x) ? x.toFixed(2) : "—"),
    });
    setKpiRow({
      valueId: "ttlTrafficKpiRefund",
      subId: "ttlTrafficKpiRefundSub",
      cur: cur.refundRate,
      prev: p.refundRate,
      higherIsBetter: false,
      fmt: formatPct,
    });

    const daily = dailyFromRecords(records);
    renderBridge(daily);
    renderDual(daily);
    renderEfficiencyCards(cur);
    renderDiagnostics(buildDiagnostics(cur, p, momRates));

    window.requestAnimationFrame(() => {
      Object.values(chartBag).forEach((c) => {
        try {
          c.resize();
        } catch {
          /* ignore */
        }
      });
    });
  }

  function schedule(context) {
    pendingCtx = context;
    if (rafScheduled) return;
    rafScheduled = true;
    const kick = () => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          rafScheduled = false;
          const ctx = pendingCtx;
          pendingCtx = null;
          if (ctx) runUpdate(ctx);
        });
      });
    };
    if (window.requestIdleCallback) window.requestIdleCallback(kick, { timeout: 900 });
    else window.setTimeout(kick, 48);
  }

  function onContext(ev) {
    const context = ev && ev.detail && ev.detail.context;
    if (!context) return;
    if (!document.getElementById("ttlTrafficAnalysisPanel")) return;
    schedule(context);
  }

  window.addEventListener("ttl-dashboard-context-updated", onContext);
  window.addEventListener("resize", () => {
    Object.values(chartBag).forEach((c) => {
      try {
        c.resize();
      } catch {
        /* ignore */
      }
    });
  });
})();
