/**
 * 流量日表（Excel → traffic_daily.json）与驾驶舱筛选联动
 * 匹配键：经销商(shop) + 日期(yyyy-mm-dd)，精确相等，禁止模糊/平台串单
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

  function normalizeDateKey(raw) {
    if (!raw) return "";
    const s = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function normalizeCvrRate(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n > 1.001 ? n / 100 : n;
  }

  /** 经销商字段：与出货筛选「渠道」同名，精确匹配 */
  function rowDealerKey(row) {
    return normKey(row.dealer || row.shop || "");
  }

  function rowMatchesDealer(row, channelSet) {
    if (!channelSet || !channelSet.size) return true;
    const dealer = rowDealerKey(row);
    for (const ch of channelSet) {
      if (dealer === normKey(ch)) return true;
    }
    return false;
  }

  /** 流量日表无独立店铺维度；不按出货「店铺」误筛经销商 */
  function rowMatchesStore(_row, _storeSet) {
    return true;
  }

  function filterTrafficRows({ start, end, channelSet, storeSet }) {
    if (!trafficState.rows.length) return [];
    const s = start ? normalizeDateKey(start) : "";
    const e = end ? normalizeDateKey(end) : "";
    return trafficState.rows.filter((row) => {
      const dk = normalizeDateKey(row.date);
      if (!dk) return false;
      if (s && dk < s) return false;
      if (e && dk > e) return false;
      if (!rowMatchesDealer(row, channelSet)) return false;
      if (!rowMatchesStore(row, storeSet)) return false;
      return true;
    });
  }

  function sumTrafficRows(rows) {
    let uv = 0;
    let promo = 0;
    let gmv = 0;
    let netGmv = 0;
    let buyers = 0;
    let newBuyers = 0;
    let oldBuyers = 0;
    let hasNet = false;

    rows.forEach((row) => {
      uv += Number(row.uv) || 0;
      promo += Number(row.spend) || 0;
      gmv += Number(row.gmv) || 0;
      buyers += Number(row.buyers) || 0;
      newBuyers += Number(row.newBuyers) || 0;
      oldBuyers += Number(row.oldBuyers) || 0;
      const n = Number(row.netGmv);
      if (Number.isFinite(n)) {
        netGmv += n;
        hasNet = true;
      } else {
        netGmv += Number(row.gmv) || 0;
      }
    });

    if (!hasNet) netGmv = gmv;

    const cvr = uv > 0 && buyers > 0 ? buyers / uv : null;
    const aov = buyers > 0 ? gmv / buyers : null;
    const roi = promo > 0 ? gmv / promo : null;
    const adRate = gmv > 0 && promo > 0 ? promo / gmv : null;

    return {
      uv,
      promo,
      gmv,
      netGmv,
      buyers,
      newBuyers,
      oldBuyers,
      cvr,
      aov,
      roi,
      adRate,
      rowCount: rows.length,
    };
  }

  function buildDailySeries(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const dk = normalizeDateKey(row.date);
      if (!dk) return;
      if (!map.has(dk)) {
        map.set(dk, {
          date: dk,
          uv: 0,
          gmv: 0,
          promo: 0,
          buyers: 0,
          cvr: null,
          aov: null,
        });
      }
      const d = map.get(dk);
      d.uv += Number(row.uv) || 0;
      d.gmv += Number(row.gmv) || 0;
      d.promo += Number(row.spend) || 0;
      d.buyers += Number(row.buyers) || 0;
    });

    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => {
        const dayRows = rows.filter((r) => normalizeDateKey(r.date) === d.date);
        if (dayRows.length === 1) {
          const r = dayRows[0];
          d.cvr = normalizeCvrRate(r.cvr);
          d.aov = Number.isFinite(Number(r.aov)) ? Number(r.aov) : null;
        }
        if (d.cvr == null && d.uv > 0 && d.buyers > 0) d.cvr = d.buyers / d.uv;
        if (d.aov == null && d.buyers > 0) d.aov = d.gmv / d.buyers;
        return d;
      });
  }

  function dailyTrafficMap(rows) {
    const map = new Map();
    buildDailySeries(rows).forEach((d) => {
      map.set(d.date, d);
    });
    return map;
  }

  function shouldDebugTraffic(channelSet, range) {
    if (typeof window !== "undefined") {
      if (window.TTL_TRAFFIC_DEBUG === true) return true;
      if (String(window.location?.search || "").includes("traffic_debug=1")) return true;
    }
    if (!channelSet || !channelSet.size) return false;
    for (const ch of channelSet) {
      if (normKey(ch).includes("小宅")) return true;
    }
    return range?.start === "2026-05-01" && range?.end === "2026-05-13";
  }

  function emitTrafficDebug(filters, rows, sums) {
    const payload = {
      filters: {
        start: filters.start,
        end: filters.end,
        channels: filters.channels ? [...filters.channels] : [],
        storesIgnored: true,
      },
      rowCount: rows.length,
      uvTotal: sums.uv,
      gmvTotal: sums.gmv,
      promoTotal: sums.promo,
      buyersTotal: sums.buyers,
      sample: rows.slice(0, 3).map((r) => ({
        date: normalizeDateKey(r.date),
        dealer: r.shop || r.dealer,
        uv: r.uv,
        gmv: r.gmv,
        spend: r.spend,
        buyers: r.buyers,
        cvr: r.cvr,
        aov: r.aov,
      })),
    };
    console.info("[TTL Traffic Debug] 小宅拼多多等经销商校验", payload);
    if (typeof window !== "undefined") {
      window.__TTL_TRAFFIC_DEBUG__ = payload;
    }
    return payload;
  }

  function buildTrafficContext(context, getFilters) {
    const channelSet = getFilters ? getFilters().channelSet : null;
    const storeSet = getFilters ? getFilters().storeSet : null;
    const range = context.currentRange;
    const compareRange = context.compareRange;

    const filterArgs = (r) => ({
      start: r?.start,
      end: r?.end,
      channelSet,
      storeSet,
    });

    const curRows = filterTrafficRows(filterArgs(range));
    const prevRows = compareRange ? filterTrafficRows(filterArgs(compareRange)) : [];

    const cur = sumTrafficRows(curRows);
    const prev = sumTrafficRows(prevRows);
    const curDailySeries = buildDailySeries(curRows);
    const prevDailySeries = buildDailySeries(prevRows);

    if (shouldDebugTraffic(channelSet, range)) {
      emitTrafficDebug(
        {
          start: range?.start,
          end: range?.end,
          channels: channelSet ? [...channelSet] : [],
        },
        curRows,
        cur,
      );
    }

    return {
      cur,
      prev,
      curRows,
      prevRows,
      curDaily: dailyTrafficMap(curRows),
      prevDaily: dailyTrafficMap(prevRows),
      curDailySeries,
      prevDailySeries,
      hasUv: cur.uv > 0,
      hasPromo: cur.promo > 0,
      hasImpressions: false,
      hasClicks: false,
    };
  }

  async function loadTrafficDaily() {
    try {
      const res = await fetch("./data/traffic_daily.json?v=20260516h");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      trafficState.rows = raw.map((row) => ({
        ...row,
        date: normalizeDateKey(row.date),
        dealer: row.shop || row.dealer || "",
      }));
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
    buildDailySeries,
    dailyTrafficMap,
    rowMatchesDealer,
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
