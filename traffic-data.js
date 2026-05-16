/**
 * 流量日表（由 日数据/流量 Excel 生成）与出货筛选联动
 */
(() => {
  "use strict";

  const trafficState = { rows: [], loaded: false, loadError: null };

  function normKey(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
  }

  function rowMatchesChannel(row, channelSet) {
    if (!channelSet || !channelSet.size) return true;
    const shop = normKey(row.shop);
    const platform = normKey(row.platform);
    for (const ch of channelSet) {
      const k = normKey(ch);
      if (!k) continue;
      if (shop.includes(k) || k.includes(shop) || platform.includes(k) || k.includes(platform)) {
        return true;
      }
    }
    return false;
  }

  function rowMatchesStore(row, storeSet) {
    if (!storeSet || !storeSet.size) return true;
    const shop = normKey(row.shop);
    for (const s of storeSet) {
      const k = normKey(s);
      if (!k) continue;
      if (shop.includes(k) || k.includes(shop)) return true;
    }
    return false;
  }

  function filterTrafficRows({ start, end, channelSet, storeSet }) {
    if (!trafficState.rows.length) return [];
    return trafficState.rows.filter((row) => {
      if (!row.date) return false;
      if (start && row.date < start) return false;
      if (end && row.date > end) return false;
      if (!rowMatchesChannel(row, channelSet)) return false;
      if (!rowMatchesStore(row, storeSet)) return false;
      return true;
    });
  }

  function sumTrafficRows(rows) {
    let uv = 0;
    let promo = 0;
    let gmv = 0;
    let netGmv = 0;
    let impressions = 0;
    let clicks = 0;
    let hasNet = false;
    rows.forEach((row) => {
      const u = Number(row.uv) || 0;
      const s = Number(row.spend) || 0;
      const g = Number(row.gmv) || 0;
      const n = Number(row.netGmv);
      uv += u;
      promo += s;
      gmv += g;
      if (Number.isFinite(n)) {
        netGmv += n;
        hasNet = true;
      } else {
        netGmv += g;
      }
    });
    if (!hasNet) netGmv = gmv;
    return { uv, promo, gmv, netGmv, impressions, clicks };
  }

  function dailyTrafficMap(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const dk = row.date;
      if (!map.has(dk)) {
        map.set(dk, { date: dk, uv: 0, promo: 0, gmv: 0 });
      }
      const d = map.get(dk);
      d.uv += Number(row.uv) || 0;
      d.promo += Number(row.spend) || 0;
      d.gmv += Number(row.gmv) || 0;
    });
    return map;
  }

  function buildTrafficContext(context, getFilters) {
    const channelSet = getFilters ? getFilters().channelSet : null;
    const storeSet = getFilters ? getFilters().storeSet : null;
    const range = context.currentRange;
    const compareRange = context.compareRange;
    const curRows = filterTrafficRows({
      start: range?.start,
      end: range?.end,
      channelSet,
      storeSet,
    });
    const prevRows = compareRange
      ? filterTrafficRows({
          start: compareRange.start,
          end: compareRange.end,
          channelSet,
          storeSet,
        })
      : [];
    return {
      cur: sumTrafficRows(curRows),
      prev: sumTrafficRows(prevRows),
      curRows,
      prevRows,
      curDaily: dailyTrafficMap(curRows),
      prevDaily: dailyTrafficMap(prevRows),
      hasUv: curRows.some((r) => (Number(r.uv) || 0) > 0),
      hasPromo: curRows.some((r) => (Number(r.spend) || 0) > 0),
      hasImpressions: false,
      hasClicks: false,
    };
  }

  async function loadTrafficDaily() {
    try {
      const res = await fetch("./data/traffic_daily.json?v=20260516f");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      trafficState.rows = await res.json();
      trafficState.loaded = true;
      trafficState.loadError = null;
    } catch (err) {
      trafficState.rows = [];
      trafficState.loaded = true;
      trafficState.loadError = err.message || String(err);
    }
    return trafficState.rows;
  }

  window.TTL_TRAFFIC_DATA = {
    loadTrafficDaily,
    buildTrafficContext,
    filterTrafficRows,
    sumTrafficRows,
    dailyTrafficMap,
    get rows() {
      return trafficState.rows;
    },
    get loaded() {
      return trafficState.loaded;
    },
    get loadError() {
      return trafficState.loadError;
    },
  };
})();
