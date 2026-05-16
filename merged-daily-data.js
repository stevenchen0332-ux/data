/**
 * 出货 + 流量 日粒度合并表（唯一数据层）
 * 聚合键：经销商/渠道(channel) + 日期(date)
 */
(() => {
  "use strict";

  const state = {
    all: [],
    built: false,
    shipmentRowCount: 0,
    trafficRowCount: 0,
  };

  /** 出货筛选渠道名 → 流量表经销商可能名称（精确日期匹配不变） */
  const channelAliasMap = {
    家凯猫旗: ["家凯猫旗", "家凯天猫", "家凯猫旗舰店", "家凯猫旗店", "家凯旗舰店"],
    小宅拼多多: ["小宅拼多多"],
    家凯拼多多: ["家凯拼多多"],
    三点水拼多多: ["三点水拼多多"],
    思其达拼多多: ["思其达拼多多"],
    心羽拼多多: ["心羽拼多多"],
    家凯餐饮: ["家凯餐饮"],
    嘉乐恒拼多多: ["嘉乐恒拼多多"],
  };

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

  function mergeKey(channel, date) {
    return `${normKey(channel)}|${normalizeDateKey(date)}`;
  }

  function emptyMergedRow(date, channel) {
    return {
      date: normalizeDateKey(date),
      channel: String(channel || "").trim(),
      shipmentQty: 0,
      shipmentGMV: 0,
      trafficGMV: 0,
      UV: 0,
      CVR: null,
      ASP: null,
      adCost: 0,
      buyers: 0,
      newBuyers: 0,
      oldBuyers: 0,
    };
  }

  /** 出货：按 channel + date 聚合 */
  function aggregateShipmentDaily(records) {
    const map = new Map();
    (records || []).forEach((r) => {
      const date = normalizeDateKey(r.dateKey || r.date);
      const channel = String(r.channel || "").trim();
      if (!date || !channel) return;
      const k = mergeKey(channel, date);
      if (!map.has(k)) map.set(k, emptyMergedRow(date, channel));
      const row = map.get(k);
      row.shipmentQty += Number(r.quantity) || 0;
      row.shipmentGMV += Number(r.amount) || 0;
    });
    return map;
  }

  /** 流量：按 shop(经销商) + date 聚合；单日多行时 UV/GMV/费用求和，CVR/ASP 取原表或重算 */
  function aggregateTrafficDaily(trafficRows) {
    const map = new Map();
    (trafficRows || []).forEach((r) => {
      const date = normalizeDateKey(r.date);
      const channel = String(r.shop || r.dealer || "").trim();
      if (!date || !channel) return;
      const k = mergeKey(channel, date);
      if (!map.has(k)) map.set(k, emptyMergedRow(date, channel));
      const row = map.get(k);
      row.trafficGMV += Number(r.gmv) || 0;
      row.UV += Number(r.uv) || 0;
      row.adCost += Number(r.spend) || 0;
      row.buyers += Number(r.buyers) || 0;
      row.newBuyers += Number(r.newBuyers) || 0;
      row.oldBuyers += Number(r.oldBuyers) || 0;
      const cvr = normalizeCvrRate(r.cvr);
      const asp = Number(r.aov);
      if (cvr != null) row._cvrSum = (row._cvrSum || 0) + cvr;
      if (Number.isFinite(asp)) row._aspSum = (row._aspSum || 0) + asp;
      row._trafficLines = (row._trafficLines || 0) + 1;
    });

    map.forEach((row) => {
      if (row._trafficLines === 1) {
        const src = (trafficRows || []).find(
          (r) =>
            normKey(r.shop || r.dealer) === normKey(row.channel) &&
            normalizeDateKey(r.date) === row.date,
        );
        if (src) {
          row.CVR = normalizeCvrRate(src.cvr);
          row.ASP = Number.isFinite(Number(src.aov)) ? Number(src.aov) : null;
        }
      }
      if (row.CVR == null && row.UV > 0 && row.buyers > 0) row.CVR = row.buyers / row.UV;
      if (row.ASP == null && row.buyers > 0) row.ASP = row.trafficGMV / row.buyers;
      delete row._cvrSum;
      delete row._aspSum;
      delete row._trafficLines;
    });
    return map;
  }

  function buildMergedDailyDataAll(shipmentRecords, trafficRows) {
    const shipMap = aggregateShipmentDaily(shipmentRecords);
    const trafficMap = aggregateTrafficDaily(trafficRows);
    const keys = new Set([...shipMap.keys(), ...trafficMap.keys()]);
    const all = [];

    keys.forEach((k) => {
      const ship = shipMap.get(k);
      const traf = trafficMap.get(k);
      const base = ship || traf || emptyMergedRow("", "");
      const row = {
        date: base.date,
        channel: base.channel,
        shipmentQty: ship ? ship.shipmentQty : 0,
        shipmentGMV: ship ? ship.shipmentGMV : 0,
        trafficGMV: traf ? traf.trafficGMV : 0,
        UV: traf ? traf.UV : 0,
        CVR: traf ? traf.CVR : null,
        ASP: traf ? traf.ASP : null,
        adCost: traf ? traf.adCost : 0,
        buyers: traf ? traf.buyers : 0,
        newBuyers: traf ? traf.newBuyers : 0,
        oldBuyers: traf ? traf.oldBuyers : 0,
      };
      all.push(row);
    });

    all.sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel));
    state.all = all;
    state.built = true;
    state.shipmentRowCount = (shipmentRecords || []).length;
    state.trafficRowCount = (trafficRows || []).length;
    return all;
  }

  function aliasesForFilterChannel(channel) {
    const key = String(channel || "").trim();
    return channelAliasMap[key] || [key];
  }

  function expandChannelFilterKeys(channelSet) {
    if (!channelSet || !channelSet.size) return null;
    const expanded = new Set();
    channelSet.forEach((ch) => {
      aliasesForFilterChannel(ch).forEach((alias) => expanded.add(normKey(alias)));
    });
    return expanded;
  }

  function rowMatchesChannelFilter(row, expandedKeys) {
    if (!expandedKeys) return true;
    return expandedKeys.has(normKey(row.channel));
  }

  function listTrafficDealersInMerged() {
    const set = new Set();
    state.all.forEach((row) => {
      if (row.UV > 0 || row.trafficGMV > 0 || row.adCost > 0) set.add(row.channel);
    });
    return [...set].sort();
  }

  function emitChannelTrafficDebug(channelSet, range, matchedRows, sums) {
    if (!channelSet || !channelSet.size) return;
    const filterChannels = [...channelSet];
    const aliasLists = Object.fromEntries(filterChannels.map((ch) => [ch, aliasesForFilterChannel(ch)]));
    const expandedKeys = expandChannelFilterKeys(channelSet);
    const trafficRows = matchedRows.filter((r) => r.UV > 0 || r.trafficGMV > 0 || r.adCost > 0);
    const payload = {
      filterChannels,
      normalizedAliases: aliasLists,
      expandedNormKeys: expandedKeys ? [...expandedKeys] : [],
      trafficDealersInTable: listTrafficDealersInMerged(),
      matchedRowCount: matchedRows.length,
      trafficMatchedRowCount: trafficRows.length,
      uvTotal: sums.UV,
      adCostTotal: sums.adCost,
      trafficGmvTotal: sums.trafficGMV,
      range: range ? `${range.start} ~ ${range.end}` : "—",
    };
    console.info("[TTL Channel Traffic Debug]", payload);

    filterChannels.forEach((ch) => {
      const aliases = aliasesForFilterChannel(ch);
      const hasTraffic = trafficRows.some((r) => aliases.some((a) => normKey(a) === normKey(r.channel)));
      if (!hasTraffic && range) {
        console.warn(`未匹配到${ch}流量数据，请检查经销商字段名称`, {
          filterChannel: ch,
          triedAliases: aliases,
          trafficDealersInTable: listTrafficDealersInMerged().filter((n) => n.includes(ch.slice(0, 2))),
        });
      }
    });

    if (typeof window !== "undefined") {
      window.__TTL_CHANNEL_TRAFFIC_DEBUG__ = payload;
    }
    return payload;
  }

  function filterMergedDaily(rows, { start, end, channelSet }) {
    const s = start ? normalizeDateKey(start) : "";
    const e = end ? normalizeDateKey(end) : "";
    const expandedKeys = expandChannelFilterKeys(channelSet);
    return (rows || []).filter((row) => {
      if (s && row.date < s) return false;
      if (e && row.date > e) return false;
      if (!rowMatchesChannelFilter(row, expandedKeys)) return false;
      return true;
    });
  }

  function sumMergedDaily(rows) {
    let shipmentQty = 0;
    let shipmentGMV = 0;
    let trafficGMV = 0;
    let UV = 0;
    let adCost = 0;
    let buyers = 0;
    let newBuyers = 0;
    let oldBuyers = 0;

    rows.forEach((row) => {
      shipmentQty += row.shipmentQty;
      shipmentGMV += row.shipmentGMV;
      trafficGMV += row.trafficGMV;
      UV += row.UV;
      adCost += row.adCost;
      buyers += row.buyers;
      newBuyers += row.newBuyers;
      oldBuyers += row.oldBuyers;
    });

    const CVR = UV > 0 && buyers > 0 ? buyers / UV : null;
    const ASP = buyers > 0 ? trafficGMV / buyers : null;
    const roi = adCost > 0 ? trafficGMV / adCost : null;
    const adRate = trafficGMV > 0 && adCost > 0 ? adCost / trafficGMV : null;

    return {
      shipmentQty,
      shipmentGMV,
      trafficGMV,
      UV,
      CVR,
      ASP,
      adCost,
      buyers,
      newBuyers,
      oldBuyers,
      roi,
      adRate,
      rowCount: rows.length,
    };
  }

  /** 按日汇总（多经销商时加总） */
  function aggregateMergedByDate(rows) {
    const map = new Map();
    rows.forEach((row) => {
      if (!map.has(row.date)) {
        map.set(row.date, emptyMergedRow(row.date, ""));
        const d = map.get(row.date);
        d.channel = "";
      }
      const d = map.get(row.date);
      d.shipmentQty += row.shipmentQty;
      d.shipmentGMV += row.shipmentGMV;
      d.trafficGMV += row.trafficGMV;
      d.UV += row.UV;
      d.adCost += row.adCost;
      d.buyers += row.buyers;
      d.newBuyers += row.newBuyers;
      d.oldBuyers += row.oldBuyers;
    });
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => {
        if (d.UV > 0 && d.buyers > 0) d.CVR = d.buyers / d.UV;
        if (d.buyers > 0) d.ASP = d.trafficGMV / d.buyers;
        return d;
      });
  }

  /** 兼容旧 traffic 块结构 */
  function toTrafficBlock(sums) {
    return {
      uv: sums.UV,
      gmv: sums.trafficGMV,
      netGmv: sums.trafficGMV,
      promo: sums.adCost,
      buyers: sums.buyers,
      newBuyers: sums.newBuyers,
      oldBuyers: sums.oldBuyers,
      cvr: sums.CVR,
      aov: sums.ASP,
      roi: sums.roi,
      adRate: sums.adRate,
      rowCount: sums.rowCount,
    };
  }

  /** 兼容旧日序（traffic panel / exec 趋势） */
  function toDailySeries(rows) {
    return aggregateMergedByDate(rows).map((d) => ({
      date: d.date,
      uv: d.UV,
      gmv: d.trafficGMV,
      promo: d.adCost,
      buyers: d.buyers,
      cvr: d.CVR,
      aov: d.ASP,
      shipmentQty: d.shipmentQty,
      shipmentGMV: d.shipmentGMV,
    }));
  }

  function buildMergedContext(context, getFilters) {
    if (!state.built) return null;
    const channelSet = getFilters ? getFilters().channelSet : null;
    const range = context.currentRange;
    const compareRange = context.compareRange;

    const curRows = filterMergedDaily(state.all, {
      start: range?.start,
      end: range?.end,
      channelSet,
    });
    const prevRows = compareRange
      ? filterMergedDaily(state.all, {
          start: compareRange.start,
          end: compareRange.end,
          channelSet,
        })
      : [];

    const curSums = sumMergedDaily(curRows);
    const prevSums = sumMergedDaily(prevRows);
    const curDaily = aggregateMergedByDate(curRows);
    const prevDaily = aggregateMergedByDate(prevRows);

    if (channelSet && channelSet.size) {
      emitChannelTrafficDebug(channelSet, range, curRows, curSums);
    }

    return {
      all: state.all,
      curRows,
      prevRows,
      curSums,
      prevSums,
      curDaily,
      prevDaily,
      curDailySeries: toDailySeries(curRows),
      prevDailySeries: toDailySeries(prevRows),
    };
  }

  function printMergedDailyValidation(channel, start, end) {
    const rows = filterMergedDaily(state.all, {
      start,
      end,
      channelSet: new Set([channel]),
    }).sort((a, b) => a.date.localeCompare(b.date));

    const sums = sumMergedDaily(rows);
    const payload = {
      channel,
      range: `${start} ~ ${end}`,
      rowCount: rows.length,
      totals: sums,
      rows,
    };

    console.info("[TTL mergedDailyData] 数据层校验", channel, `${start} ~ ${end}`);
    console.table(
      rows.map((r) => ({
        date: r.date,
        shipmentQty: r.shipmentQty,
        shipmentGMV: Math.round(r.shipmentGMV),
        trafficGMV: Math.round(r.trafficGMV),
        UV: r.UV,
        CVR: r.CVR != null ? Number(r.CVR.toFixed(4)) : null,
        ASP: r.ASP != null ? Number(r.ASP.toFixed(2)) : null,
        adCost: Math.round(r.adCost),
        buyers: r.buyers,
        newBuyers: r.newBuyers,
        oldBuyers: r.oldBuyers,
      })),
    );
    console.info("[TTL mergedDailyData] 区间合计", sums);

    if (typeof window !== "undefined") {
      window.__TTL_MERGED_DAILY__ = payload;
    }
    return payload;
  }

  function init(shipmentRecords, trafficRows) {
    buildMergedDailyDataAll(shipmentRecords, trafficRows);
    printMergedDailyValidation("小宅拼多多", "2026-05-01", "2026-05-13");
    return state.all;
  }

  function rebuild(shipmentRecords, trafficRows) {
    return init(shipmentRecords, trafficRows);
  }

  window.TTL_MERGED_DATA = {
    init,
    rebuild,
    buildMergedDailyDataAll,
    filterMergedDaily,
    sumMergedDaily,
    aggregateMergedByDate,
    buildMergedContext,
    printMergedDailyValidation,
    emitChannelTrafficDebug,
    expandChannelFilterKeys,
    aliasesForFilterChannel,
    channelAliasMap,
    listTrafficDealersInMerged,
    toTrafficBlock,
    toDailySeries,
    normKey,
    normalizeDateKey,
    get all() {
      return state.all;
    },
    get built() {
      return state.built;
    },
  };
})();
