(() => {
  "use strict";

  const FIELD_ALIASES = {
    date: ["订单日期", "发货时间", "出货日期", "日期", "日", "date", "orderdate", "shipdate"],
    store: ["店铺", "店铺名称", "网店", "店铺名", "门店名称", "shop", "store name", "店铺编码"],
    channel: ["经销商", "渠道", "门店", "客户"],
    product: ["商品名称", "品名", "货品名称", "SKU名称", "sku名称", "产品名称"],
    sku: ["商品编码", "货品编号", "SKU编号", "sku编号", "编码", "货号"],
    quantity: ["数量", "出货数量", "销售数量", "货品数量", "销量", "件数"],
    amount: ["GMV", "销售金额", "应收金额", "合计", "摊分支付金额", "金额", "销售额", "成交金额"],
    region: ["省", "省份", "州省", "市", "城市", "区县", "地区", "区域"],
    brand: ["品牌", "品牌名称", "brand"],
    orderId: ["订单号", "订单编号", "发货单号", "发货单编号", "交易单号", "单据编号", "单号", "订单ID"],
    category: ["产品大类", "类目", "品类", "商品类目"],
  };

  const REQUIRED_FIELDS = ["date", "channel", "product", "quantity", "amount"];
  const FIELD_LABELS = {
    date: "日期",
    channel: "渠道",
    store: "店铺",
    product: "商品",
    sku: "商品编码",
    quantity: "数量",
    amount: "金额",
    region: "地区",
    brand: "品牌",
    orderId: "订单 / 发货单",
    category: "产品大类",
    visitors: "访客",
    conversionRate: "转化率",
    promotionSpend: "推广花费",
    impressions: "曝光",
    clicks: "点击",
  };

  const EXTERNAL_SOURCE_STATUS = [
    {
      name: "流量 / 推广数据",
      status: "本版不接入",
      detail: "因当前流量数据不完整，页面指标只使用出货数据；未来 7 日预估也仅基于历史出货 GMV 趋势计算。",
    },
  ];

  const COLORS = {
    primary: "#2454a6",
    primarySoft: "#e8efff",
    positive: "#14845f",
    negative: "#c2413a",
    warning: "#b7791f",
    muted: "#667085",
    grid: "#e5ebf3",
    text: "#172033",
    palette: ["#7fc0b8", "#f2d36b", "#91b8d8", "#f7a6b5", "#95c48b", "#f3aa67", "#9a86b8", "#d56e6e", "#7a9cc6"],
  };

  /** 多选下拉中「全部」选项的 value，勿与真实渠道/类目重名 */
  const MULTI_ALL_VALUE = "__all__";

  const state = {
    allRecords: [],
    filteredRecords: [],
    fileReports: [],
    dataBundle: null,
    /** 无店铺列时，店铺下拉与筛选使用渠道值（常见于仅含 data-bundle 的发布包） */
    storeFilterUsesChannel: false,
    compareManuallyChanged: false,
    chartInstances: {},
    fieldCoverage: {
      brand: false,
      region: false,
      store: false,
      orderId: false,
    },
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", () => {
    cacheDom();
    bindEvents();
    renderEmptyState();
    if (!window.echarts) {
      showFieldStatus([
        {
          fileName: "图表依赖加载",
          records: 0,
          invalidRows: 0,
          missing: [],
          dependencyError: true,
        },
      ]);
      return;
    }
    if (window.TTL_DASHBOARD_DATA) {
      loadBundledDashboardData();
    } else {
      autoLoadCsvFiles();
    }
  });

  function cacheDom() {
    const ids = [
      "csvInput",
      "encodingSelect",
      "reloadDataBtn",
      "reloadDataPanelBtn",
      "dropZone",
      "fieldStatus",
      "dataHealthText",
      "uploadPanel",
      "monthFilter",
      "startDateFilter",
      "endDateFilter",
      "compareStartDateFilter",
      "compareEndDateFilter",
      "channelFilter",
      "categoryFilter",
      "storeFilter",
      "storeFilterWrap",
      "filterDimsPrimaryGrid",
      "brandFilter",
      "brandFilterWrap",
      "regionFilter",
      "regionFilterWrap",
      "channelFilterTrigger",
      "channelFilterPanel",
      "categoryFilterTrigger",
      "categoryFilterPanel",
      "storeFilterTrigger",
      "storeFilterPanel",
      "regionFilterTrigger",
      "regionFilterPanel",
      "productSearch",
      "resetFiltersBtn",
      "exportBtn",
      "dateRangeText",
      "recordCountText",
      "filteredCountText",
      "fileCountText",
      "emptyState",
      "dashboardContent",
      "overviewConclusion",
      "overviewInsights",
      "kpiGmv",
      "kpiGmvSub",
      "kpiQty",
      "kpiQtySub",
      "kpiOrders",
      "kpiOrdersSub",
      "kpiAvgPrice",
      "kpiDailyAvg",
      "kpiDailyAvgSub",
      "kpiMom",
      "kpiMomSub",
      "monthTrendLabel",
      "forecastSummary",
      "channelConclusion",
      "topChannelName",
      "topChannelDesc",
      "fastChannelName",
      "fastChannelDesc",
      "dragChannelName",
      "dragChannelDesc",
      "channelConcentration",
      "channelConcentrationDesc",
      "channelTableNote",
      "channelTableBody",
      "productConclusion",
      "heroProductCount",
      "heroProductDesc",
      "potentialProductCount",
      "potentialProductDesc",
      "riskProductCount",
      "riskProductDesc",
      "productConcentration",
      "productConcentrationDesc",
      "productTableBody",
      "anomalyConclusion",
      "priorityList",
      "anomalyDateList",
      "recommendationConclusion",
      "recommendationPriorityList",
      "actionList",
      "qualityPanel",
    ];

    ids.forEach((id) => {
      els[id] = document.getElementById(id);
    });
    els.navItems = Array.from(document.querySelectorAll(".nav-item"));
    els.moduleSections = Array.from(document.querySelectorAll(".module-section"));
    els.statusDot = document.querySelector(".status-dot");
  }

  function bindEvents() {
    initMultiDropdowns();

    els.csvInput.addEventListener("change", (event) => {
      handleFiles(Array.from(event.target.files || []));
    });

    [els.reloadDataBtn, els.reloadDataPanelBtn].forEach((button) => {
      button.addEventListener("click", autoLoadCsvFiles);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      els.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.dropZone.classList.add("dragging");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      els.dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.dropZone.classList.remove("dragging");
      });
    });

    els.dropZone.addEventListener("drop", (event) => {
      const files = Array.from(event.dataTransfer.files || []).filter((file) =>
        /\.csv$/i.test(file.name),
      );
      handleFiles(files);
    });

    const filterControls = [
      els.monthFilter,
      els.startDateFilter,
      els.endDateFilter,
      els.channelFilter,
      els.categoryFilter,
      els.storeFilter,
      els.brandFilter,
      els.regionFilter,
      els.productSearch,
    ];

    filterControls.forEach((control) => {
      control.addEventListener(control.type === "search" ? "input" : "change", () => {
        if (
          control === els.channelFilter ||
          control === els.categoryFilter ||
          control === els.storeFilter ||
          control === els.regionFilter
        ) {
          syncMultiSelectExclusiveAll(control);
          refreshMultiDropdownCheckboxes(control);
        }
        if (control === els.monthFilter) handleMonthFilterChange();
        if (control === els.startDateFilter || control === els.endDateFilter) {
          syncCompareDates();
        }
        renderDashboard();
      });
    });

    [els.compareStartDateFilter, els.compareEndDateFilter].forEach((control) => {
      control.addEventListener("change", () => {
        state.compareManuallyChanged = true;
        renderDashboard();
      });
    });

    els.resetFiltersBtn.addEventListener("click", () => {
      resetFilters();
      renderDashboard();
    });

    els.exportBtn.addEventListener("click", exportFilteredRecords);

    els.navItems.forEach((button) => {
      button.addEventListener("click", () => {
        switchModule(button.dataset.module);
      });
    });

    window.addEventListener("resize", debounce(resizeCharts, 120));
  }

  async function handleFiles(files) {
    if (!files.length) return;
    if (!window.TTL_DASHBOARD_DATA && !window.Papa) {
      showToastLikeStatus("PapaParse 未加载，无法读取 CSV。请确认网络可访问 CDN 后刷新页面。", true);
      return;
    }

    showToastLikeStatus(`正在解析 ${files.length} 个 CSV 文件...`);

    try {
      const reports = await Promise.all(files.map((file) => parseCsvFile(file)));
      applyReports(reports);
    } catch (error) {
      console.error(error);
      showToastLikeStatus(`CSV 解析失败：${error.message || error}`, true);
    }
  }

  async function autoLoadCsvFiles() {
    if (!window.Papa) {
      showToastLikeStatus("PapaParse 未加载，无法自动读取 CSV。", true);
      return;
    }

    showToastLikeStatus("正在自动读取同目录 CSV 数据...");
    try {
      const manifest = await loadCsvManifest();
      const sources = manifest.files.length ? manifest.files : await discoverCommonCsvFiles();
      if (!sources.length) {
        applyReports([]);
        showFieldStatus([
          {
            fileName: "自动数据源",
            records: [],
            invalidRows: 0,
            missing: REQUIRED_FIELDS,
            autoSourceMissing: true,
          },
        ]);
        showToastLikeStatus(
          "未自动读取到 CSV。请把 CSV 放到本项目目录或 data 目录，并在 csv-manifest.json 中列出文件名。",
          true,
        );
        return;
      }

      const reports = await Promise.all(sources.map((source) => fetchAndParseCsvSource(source, manifest.encoding)));
      applyReports(reports);
    } catch (error) {
      console.error(error);
      showToastLikeStatus(`自动读取失败：${error.message || error}`, true);
      showFieldStatus([
        {
          fileName: "自动数据源",
          records: [],
          invalidRows: 0,
          missing: REQUIRED_FIELDS,
          autoSourceError: error.message || String(error),
        },
      ]);
    }
  }

  function loadBundledDashboardData() {
    const bundle = window.TTL_DASHBOARD_DATA;
    const dims = bundle.dims || {};
    const products = dims.products || [];
    const metricKeys = bundle.metrics || bundle.meta?.operationFields || [];
    const records = (bundle.rows || []).map((row, index) => {
      const product = products[row[2]] || {};
      const dateKey = dims.dates[row[0]];
      const metrics = {};
      metricKeys.forEach((key, metricIndex) => {
        metrics[key] = Number(row[8 + metricIndex]) || 0;
      });
      return {
        date: parseDateValue(dateKey),
        dateKey,
        monthKey: dateKey.slice(0, 7),
        channel: dims.channels[row[1]] || "未识别渠道",
        product: product.product || "未识别商品",
        sku: product.sku || "",
        productKey: `${product.product || "未识别商品"}__${product.sku || "NO_SKU"}`,
        category: dims.categories[row[3]] || "未识别类目",
        store: "",
        quantity: Number(row[6]) || 0,
        amount: Number(row[5]) || 0,
        brand: "",
        region: dims.regions[row[4]] || "未识别地区",
        orderId: "",
        orderCount: Number(row[7]) || 0,
        visitors: metrics.visitors || 0,
        conversionRate: metrics.conversionRate || 0,
        promotionSpend: metrics.promotionSpend || 0,
        impressions: metrics.impressions || 0,
        clicks: metrics.clicks || 0,
        fileName: "data-bundle.js",
        rowNumber: index + 1,
        raw: row,
      };
    }).filter((record) => record.date);

    state.dataBundle = bundle;
    const report = {
      fileName: "本地经营数据包 data-bundle.js",
      headers: ["日期", "渠道", "商品", "类目", "地区", "GMV", "数量", "订单量"],
      fields: {
        date: "年份/月/日",
        channel: "经销商",
        product: "产品名称/商品名称",
        sku: "商品编码",
        quantity: "数量",
        amount: "GMV",
        region: "省",
      },
      missing: [],
      records,
      invalidRows: 0,
      bundled: true,
    };

    applyReports([report]);
    showToastLikeStatus(
      `已加载本地数据包：${formatInteger(bundle.meta.rawRows)} 行原始数据，${formatInteger(bundle.meta.factRows)} 条经营事实`,
    );
  }

  function applyReports(reports) {
    const records = reports.flatMap((report) => report.records || []);

    state.fileReports = reports;
    state.allRecords = records.sort((a, b) => a.date - b.date);
    state.filteredRecords = [...state.allRecords];
    state.fieldCoverage = {
      brand: state.allRecords.some((record) => record.brand),
      region: state.allRecords.some((record) => record.region),
      store: state.allRecords.some((record) => record.store),
      orderId: state.allRecords.some((record) => record.orderId),
    };

    showFieldStatus(reports);
    buildFilterOptions();
    enableControls(Boolean(records.length));
    if (records.length) renderDashboard();
    else renderEmptyState();
  }

  async function loadCsvManifest() {
    const fallback = { files: [], encoding: els.encodingSelect.value || "UTF-8" };
    try {
      const response = await fetch(`./csv-manifest.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) return fallback;
      const manifest = await response.json();
      const rawFiles = Array.isArray(manifest) ? manifest : manifest.files || [];
      return {
        files: rawFiles.map(normalizeCsvSource).filter(Boolean),
        encoding: manifest.encoding || els.encodingSelect.value || "UTF-8",
      };
    } catch {
      return fallback;
    }
  }

  function normalizeCsvSource(item) {
    if (typeof item === "string") {
      return {
        path: item,
        name: item.split("/").pop(),
      };
    }
    if (item && typeof item.path === "string") {
      return {
        path: item.path,
        name: item.name || item.path.split("/").pop(),
        encoding: item.encoding,
      };
    }
    return null;
  }

  async function discoverCommonCsvFiles() {
    const candidates = buildDefaultCsvCandidates().map((path) => ({
      path,
      name: path.split("/").pop(),
    }));
    const checks = await Promise.all(
      candidates.map(async (source) => {
        try {
          const response = await fetch(source.path, { cache: "no-store" });
          if (!response.ok) return null;
          const buffer = await response.arrayBuffer();
          if (!buffer.byteLength) return null;
          return {
            ...source,
            buffer,
          };
        } catch {
          return null;
        }
      }),
    );
    return checks.filter(Boolean);
  }

  function buildDefaultCsvCandidates() {
    const names = [];
    for (let month = 1; month <= 12; month += 1) {
      const padded = String(month).padStart(2, "0");
      names.push(
        `2026-${padded}.csv`,
        `2026_${padded}.csv`,
        `2026${padded}.csv`,
        `2026-${month}.csv`,
        `2026年${month}月.csv`,
        `${month}月.csv`,
        `${padded}月.csv`,
        `data/2026-${padded}.csv`,
        `data/2026_${padded}.csv`,
        `data/2026${padded}.csv`,
        `data/2026年${month}月.csv`,
        `data/${month}月.csv`,
      );
    }
    return Array.from(new Set(names));
  }

  async function fetchAndParseCsvSource(source, defaultEncoding) {
    const buffer = source.buffer || (await fetchCsvBuffer(source.path));
    const encoding = source.encoding || defaultEncoding || els.encodingSelect.value || "UTF-8";
    const text = decodeCsvBuffer(buffer, encoding);
    return parseCsvText(text, source.name || source.path);
  }

  async function fetchCsvBuffer(path) {
    const response = await fetch(`${path}${path.includes("?") ? "&" : "?"}ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path} 读取失败：HTTP ${response.status}`);
    return response.arrayBuffer();
  }

  function decodeCsvBuffer(buffer, encoding) {
    try {
      return new TextDecoder(encoding || "UTF-8").decode(buffer);
    } catch {
      return new TextDecoder("UTF-8").decode(buffer);
    }
  }

  function parseCsvText(text, fileName) {
    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: "greedy",
      dynamicTyping: false,
    });
    const rows = Array.isArray(result.data) ? result.data : [];
    const headers = (result.meta.fields || []).filter(Boolean);
    const fields = detectFields(headers);
    ensureChannelColumnWhenMissing(fields);
    const missing = REQUIRED_FIELDS.filter((field) => !fields[field]);
    const parsedRows = [];
    let invalidRows = 0;

    rows.forEach((row, index) => {
      const record = normalizeRecord(row, fields, fileName, index + 2);
      if (record) parsedRows.push(record);
      else invalidRows += 1;
    });

    return {
      fileName,
      headers,
      fields,
      missing,
      records: parsedRows,
      invalidRows,
      errors: result.errors || [],
    };
  }

  function ensureChannelColumnWhenMissing(fields) {
    if (!fields.channel && fields.store) {
      fields.channel = fields.store;
    }
  }

  function parseCsvFile(file) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: "greedy",
        dynamicTyping: false,
        encoding: els.encodingSelect.value || "UTF-8",
        complete: (result) => {
          const rows = Array.isArray(result.data) ? result.data : [];
          const headers = (result.meta.fields || []).filter(Boolean);
          const fields = detectFields(headers);
          ensureChannelColumnWhenMissing(fields);
          const missing = REQUIRED_FIELDS.filter((field) => !fields[field]);
          const parsedRows = [];
          let invalidRows = 0;

          rows.forEach((row, index) => {
            const record = normalizeRecord(row, fields, file.name, index + 2);
            if (record) {
              parsedRows.push(record);
            } else {
              invalidRows += 1;
            }
          });

          resolve({
            fileName: file.name,
            headers,
            fields,
            missing,
            records: parsedRows,
            invalidRows,
            errors: result.errors || [],
          });
        },
        error: reject,
      });
    });
  }

  function detectFields(headers) {
    const normalizedHeaders = headers.map((header) => ({
      raw: header,
      norm: normalizeHeader(header),
    }));

    return Object.keys(FIELD_ALIASES).reduce((fields, group) => {
      const aliases = FIELD_ALIASES[group].map(normalizeHeader);
      const exact = normalizedHeaders.find((header) => aliases.includes(header.norm));
      if (exact) {
        fields[group] = exact.raw;
        return fields;
      }

      const contained = normalizedHeaders.find((header) =>
        aliases.some((alias) => header.norm.includes(alias) || alias.includes(header.norm)),
      );
      if (contained && isReasonableMatch(group, contained.norm)) {
        fields[group] = contained.raw;
        return fields;
      }

      const fuzzy = normalizedHeaders.find((header) => fuzzyMatch(group, header.norm));
      fields[group] = fuzzy ? fuzzy.raw : null;
      return fields;
    }, {});
  }

  function isReasonableMatch(group, normalizedHeader) {
    if (group === "quantity") return !/(日期|时间|date|time)/i.test(normalizedHeader);
    if (group === "amount") return !/(数量|件数|qty|quantity)/i.test(normalizedHeader);
    if (group === "sku") return !/(名称|name)/i.test(normalizedHeader);
    return true;
  }

  function fuzzyMatch(group, normalizedHeader) {
    const text = normalizedHeader;
    const matchers = {
      date: () => /(日期|时间|date|time|day)/i.test(text),
      channel: () => /(经销商|渠道|门店|客户|分销|channel|dealer)/i.test(text),
      product: () => /(商品|品名|货品|产品|sku名称|productname|itemname)/i.test(text) && !/(编码|编号|code|id)/i.test(text),
      sku: () => /(商品编码|货品编号|sku编号|sku|编码|编号|code)/i.test(text) && !/(名称|name)/i.test(text),
      quantity: () => /(数量|销量|件数|出货量|qty|quantity|volume)/i.test(text) && !/(日期|时间|date|time)/i.test(text),
      amount: () => /(gmv|金额|应收|合计|支付|销售额|成交额|amount|sales|revenue)/i.test(text),
      region: () => /(省|市|区县|地区|区域|城市|province|city|region)/i.test(text),
      brand: () => /(品牌|brand)/i.test(text),
      orderId: () => /(订单|发货单|交易单|单据|单号|order|bill|no|id)/i.test(text),
      category: () =>
        /(产品大类|类目|品类|商品类目|category)/i.test(text) && !/(商品名称|品名|货品名称|编码)/i.test(text),
      store: () =>
        /(店铺|网店|shop|store)/i.test(text) &&
        !/(商品|品名|货品|产品|渠道|经销商|金额|数量|编码|日期)/i.test(text),
    };
    return matchers[group] ? matchers[group]() : false;
  }

  function normalizeRecord(row, fields, fileName, rowNumber) {
    const rawDate = getCell(row, fields.date);
    const date = parseDateValue(rawDate, fileName);
    if (!date) return null;

    const product = cleanText(getCell(row, fields.product)) || "未识别商品";
    const sku = cleanText(getCell(row, fields.sku));
    const channel = cleanText(getCell(row, fields.channel)) || "未识别渠道";
    const store = cleanText(getCell(row, fields.store));
    const quantity = fields.quantity ? parseNumberValue(getCell(row, fields.quantity)) : 0;
    const amount = fields.amount ? parseNumberValue(getCell(row, fields.amount)) : 0;
    const brand = cleanText(getCell(row, fields.brand));
    const region = cleanText(getCell(row, fields.region));
    const category = cleanText(getCell(row, fields.category)) || "未识别类目";
    const orderId = cleanText(getCell(row, fields.orderId));
    const dateKey = toDateKey(date);

    return {
      date,
      dateKey,
      monthKey: dateKey.slice(0, 7),
      channel,
      store,
      product,
      sku,
      productKey: `${product}__${sku || "NO_SKU"}`,
      quantity,
      amount,
      brand,
      region,
      category,
      orderId,
      fileName,
      rowNumber,
      raw: row,
    };
  }

  function getCell(row, fieldName) {
    if (!fieldName) return "";
    return row[fieldName] ?? "";
  }

  function buildFilterOptions() {
    const months = uniqueSorted(state.allRecords.map((record) => record.monthKey));
    const channels = sortValuesByGmv(state.allRecords, "channel");
    const categories = sortValuesByGmv(state.allRecords, "category");
    const brands = sortValuesByGmv(state.allRecords.filter((record) => record.brand), "brand");
    const regions = sortValuesByGmv(state.allRecords.filter((record) => record.region), "region");
    let stores = sortValuesByGmv(state.allRecords.filter((record) => record.store), "store");
    state.storeFilterUsesChannel = false;
    if (!stores.length && state.allRecords.length) {
      stores = sortValuesByGmv(state.allRecords, "channel");
      state.storeFilterUsesChannel = true;
    }
    const dates = state.allRecords.map((record) => record.dateKey).sort();

    fillSelect(els.monthFilter, months, "全部月份", formatMonthLabel);
    fillMultiSelect(els.channelFilter, channels, "全部渠道");
    fillMultiSelect(els.categoryFilter, categories, "全部大类");
    fillSelect(els.brandFilter, brands, "全部品牌");
    fillMultiSelect(els.regionFilter, regions, "全部地区");
    fillMultiSelect(els.storeFilter, stores, "全部店铺");

    const storeHint = document.getElementById("storeFilterHint");
    if (storeHint) {
      storeHint.textContent = state.storeFilterUsesChannel
        ? "当前数据无独立店铺列，选项与「渠道」一致，可在此多选店铺（经销商）"
        : "可多选；默认「全部」";
    }

    els.brandFilterWrap.classList.toggle("hidden", !brands.length);
    els.regionFilterWrap.classList.toggle("hidden", !regions.length);
    if (els.filterDimsPrimaryGrid) {
      els.filterDimsPrimaryGrid.classList.toggle("has-region", regions.length > 0);
    }

    if (dates.length) {
      els.startDateFilter.min = dates[0];
      els.startDateFilter.max = dates[dates.length - 1];
      els.endDateFilter.min = dates[0];
      els.endDateFilter.max = dates[dates.length - 1];
      els.compareStartDateFilter.min = dates[0];
      els.compareStartDateFilter.max = dates[dates.length - 1];
      els.compareEndDateFilter.min = dates[0];
      els.compareEndDateFilter.max = dates[dates.length - 1];
      setDefaultCurrentRange(dates);
      syncCompareDates(true);
    }
  }

  function enableControls(enabled) {
    [
      els.monthFilter,
      els.startDateFilter,
      els.endDateFilter,
      els.compareStartDateFilter,
      els.compareEndDateFilter,
      els.channelFilter,
      els.categoryFilter,
      els.storeFilter,
      els.productSearch,
      els.exportBtn,
    ].forEach((control) => {
      control.disabled = !enabled;
    });

    els.brandFilter.disabled = !enabled || els.brandFilterWrap.classList.contains("hidden");
    els.regionFilter.disabled = !enabled || els.regionFilterWrap.classList.contains("hidden");
    els.storeFilter.disabled = !enabled;

    [els.channelFilter, els.categoryFilter, els.storeFilter, els.regionFilter].forEach((select) => {
      syncMultiDropdownFromSelect(select);
    });
  }

  function getMultiDropdownParts(select) {
    const root = select?.closest?.(".multi-dropdown-root");
    if (!root) return null;
    const trigger = root.querySelector(".multi-dropdown-trigger");
    const panel = root.querySelector(".multi-dropdown-panel");
    if (!trigger || !panel) return null;
    return { root, trigger, panel };
  }

  function closeAllMultiDropdowns() {
    document.querySelectorAll(".multi-dropdown-root.is-open").forEach((root) => root.classList.remove("is-open"));
    document.querySelectorAll(".multi-dropdown-panel:not([hidden])").forEach((panel) => {
      panel.hidden = true;
    });
    document.querySelectorAll(".multi-dropdown-trigger[aria-expanded='true']").forEach((btn) => {
      btn.setAttribute("aria-expanded", "false");
    });
  }

  function openMultiDropdown(trigger, panel) {
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    const root = trigger.closest(".multi-dropdown-root");
    if (root) root.classList.add("is-open");
  }

  function updateMultiDropdownTriggerText(select, trigger) {
    const span = trigger.querySelector(".multi-dropdown-trigger-text");
    if (!span) return;
    const selected = Array.from(select.selectedOptions);
    if (!selected.length) {
      const allOpt = Array.from(select.options).find((o) => o.value === MULTI_ALL_VALUE);
      span.textContent = allOpt ? allOpt.textContent : "—";
      return;
    }
    if (selected.length === 1 && selected[0].value === MULTI_ALL_VALUE) {
      span.textContent = selected[0].textContent;
      return;
    }
    const specifics = selected.filter((o) => o.value !== MULTI_ALL_VALUE);
    if (specifics.length === 1) {
      span.textContent = specifics[0].textContent;
      return;
    }
    span.textContent = `已选 ${specifics.length} 项`;
  }

  function syncCheckboxesFromSelect(select, panel) {
    panel.querySelectorAll('input[type="checkbox"][data-md-value]').forEach((cb) => {
      const val = cb.dataset.mdValue;
      const opt = Array.from(select.options).find((o) => o.value === val);
      if (opt) cb.checked = opt.selected;
    });
  }

  function refreshMultiDropdownCheckboxes(select) {
    const parts = getMultiDropdownParts(select);
    if (!parts) return;
    syncCheckboxesFromSelect(select, parts.panel);
    updateMultiDropdownTriggerText(select, parts.trigger);
  }

  function rebuildMultiDropdownPanel(select, panel, trigger) {
    panel.innerHTML = "";
    Array.from(select.options).forEach((opt, index) => {
      const row = document.createElement("div");
      row.className = "multi-dropdown-option";
      row.setAttribute("role", "option");
      const safeId = `${select.id}-md-${index}`;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = safeId;
      cb.checked = opt.selected;
      cb.dataset.mdValue = opt.value;
      const lab = document.createElement("label");
      lab.htmlFor = safeId;
      lab.textContent = opt.textContent;
      row.appendChild(cb);
      row.appendChild(lab);
      panel.appendChild(row);

      cb.addEventListener("change", () => {
        const targetOpt = Array.from(select.options).find((o) => o.value === opt.value);
        if (!targetOpt) return;
        targetOpt.selected = cb.checked;
        syncMultiSelectExclusiveAll(select);
        syncCheckboxesFromSelect(select, panel);
        updateMultiDropdownTriggerText(select, trigger);
        renderDashboard();
      });
    });
  }

  function syncMultiDropdownFromSelect(select) {
    const parts = getMultiDropdownParts(select);
    if (!parts) return;
    const { trigger, panel } = parts;
    trigger.disabled = select.disabled;
    updateMultiDropdownTriggerText(select, trigger);
    rebuildMultiDropdownPanel(select, panel, trigger);
  }

  function initMultiDropdowns() {
    const rows = [
      { select: els.channelFilter, trigger: els.channelFilterTrigger, panel: els.channelFilterPanel },
      { select: els.categoryFilter, trigger: els.categoryFilterTrigger, panel: els.categoryFilterPanel },
      { select: els.storeFilter, trigger: els.storeFilterTrigger, panel: els.storeFilterPanel },
      { select: els.regionFilter, trigger: els.regionFilterTrigger, panel: els.regionFilterPanel },
    ].filter((row) => row.select && row.trigger && row.panel);

    rows.forEach(({ select, trigger, panel }) => {
      panel.addEventListener("mousedown", (event) => {
        event.stopPropagation();
      });
      trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        if (select.disabled) return;
        const willOpen = panel.hidden;
        closeAllMultiDropdowns();
        if (willOpen) {
          syncMultiDropdownFromSelect(select);
          openMultiDropdown(trigger, panel);
        }
      });
    });

    document.addEventListener(
      "mousedown",
      (event) => {
        if (!(event.target instanceof Element)) return;
        if (event.target.closest(".multi-dropdown-root")) return;
        closeAllMultiDropdowns();
      },
      true,
    );

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeAllMultiDropdowns();
    });
  }

  function fillSelect(select, values, allLabel, labelFormatter = (value) => value) {
    const current = select.value || "all";
    select.innerHTML = `<option value="all">${allLabel}</option>`;
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = labelFormatter(value);
      select.appendChild(option);
    });
    select.value = values.includes(current) ? current : "all";
  }

  function syncMultiSelectExclusiveAll(select) {
    if (!select || !select.multiple) return;
    const opts = Array.from(select.options);
    const selected = opts.filter((o) => o.selected);
    if (!selected.length) {
      const allOpt = opts.find((o) => o.value === MULTI_ALL_VALUE);
      if (allOpt) allOpt.selected = true;
      return;
    }
    if (selected.length > 1 && selected.some((o) => o.value === MULTI_ALL_VALUE)) {
      opts.forEach((o) => {
        if (o.value === MULTI_ALL_VALUE) o.selected = false;
      });
    }
  }

  function resetMultiSelectToAll(select) {
    if (!select || !select.multiple) return;
    Array.from(select.options).forEach((o) => {
      o.selected = o.value === MULTI_ALL_VALUE;
    });
    syncMultiDropdownFromSelect(select);
  }

  function fillMultiSelect(select, values, allLabel, labelFormatter = (value) => value) {
    const prev = new Set(
      Array.from(select.selectedOptions)
        .map((o) => o.value)
        .filter(Boolean),
    );
    const valueSet = new Set(values);
    select.innerHTML = "";
    const allOpt = document.createElement("option");
    allOpt.value = MULTI_ALL_VALUE;
    allOpt.textContent = allLabel;
    select.appendChild(allOpt);
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = labelFormatter(value);
      select.appendChild(option);
    });

    const restored = [...prev].filter((v) => v === MULTI_ALL_VALUE || valueSet.has(v));
    if (!restored.length || restored.includes(MULTI_ALL_VALUE)) {
      allOpt.selected = true;
      syncMultiDropdownFromSelect(select);
      return;
    }
    Array.from(select.options).forEach((o) => {
      o.selected = restored.includes(o.value);
    });
    syncMultiDropdownFromSelect(select);
  }

  function readMultiFilter(select) {
    if (!select || !select.multiple) return null;
    const picked = new Set(
      Array.from(select.selectedOptions)
        .map((o) => o.value)
        .filter((v) => v && v !== MULTI_ALL_VALUE),
    );
    if (!picked.size) return null;
    return picked;
  }

  function setMultiSelectOnly(select, value) {
    if (!select || !select.multiple) return false;
    const opts = Array.from(select.options);
    const hit = opts.find((o) => o.value === value);
    if (!hit) return false;
    opts.forEach((o) => {
      o.selected = o.value === value;
    });
    syncMultiDropdownFromSelect(select);
    return true;
  }

  function sortValuesByGmv(records, field) {
    const map = new Map();
    records.forEach((record) => {
      const key = record[field];
      if (!key) return;
      map.set(key, (map.get(key) || 0) + record.amount);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"))
      .map(([key]) => key);
  }

  function resetFilters() {
    els.monthFilter.value = "all";
    const dates = state.allRecords.map((record) => record.dateKey).sort();
    setDefaultCurrentRange(dates);
    state.compareManuallyChanged = false;
    syncCompareDates(true);
    resetMultiSelectToAll(els.channelFilter);
    resetMultiSelectToAll(els.categoryFilter);
    resetMultiSelectToAll(els.storeFilter);
    els.brandFilter.value = "all";
    resetMultiSelectToAll(els.regionFilter);
    els.productSearch.value = "";
  }

  function setDefaultCurrentRange(dates) {
    if (!dates.length) return;
    const latest = getDefaultEndDate(dates);
    const latestMonth = latest.slice(0, 7);
    const monthDates = dates.filter((date) => date.startsWith(latestMonth));
    els.startDateFilter.value = monthDates[0] || dates[0];
    els.endDateFilter.value = latest;
  }

  function getDefaultEndDate(dates) {
    const todayKey = toDateKey(new Date());
    const lastComplete = [...dates].reverse().find((date) => date < todayKey);
    const latest = dates[dates.length - 1];
    return latest >= todayKey && lastComplete ? lastComplete : latest;
  }

  function handleMonthFilterChange() {
    const month = els.monthFilter.value;
    const dates = state.allRecords.map((record) => record.dateKey).sort();
    if (month !== "all") {
      const monthDates = dates.filter((date) => date.startsWith(month));
      if (monthDates.length) {
        els.startDateFilter.value = monthDates[0];
        els.endDateFilter.value = getDefaultEndDate(monthDates);
      }
    }
    state.compareManuallyChanged = false;
    syncCompareDates(true);
  }

  function syncCompareDates(force = false) {
    if (state.compareManuallyChanged && !force) return;
    const current = getCurrentRange();
    if (!current) return;
    const compare = getAlignedPreviousMonthRange(current.start, current.end);
    if (!compare) return;
    els.compareStartDateFilter.value = compare.start;
    els.compareEndDateFilter.value = compare.end;
  }

  function getCurrentRange() {
    const dates = state.allRecords.map((record) => record.dateKey).sort();
    const start = els.startDateFilter.value || dates[0];
    const end = els.endDateFilter.value || dates[dates.length - 1];
    if (!start || !end) return null;
    return start <= end ? { start, end } : { start: end, end: start };
  }

  function getCompareRange(currentRange) {
    if (!currentRange) return null;
    const start = els.compareStartDateFilter.value;
    const end = els.compareEndDateFilter.value;
    if (start && end) return start <= end ? { start, end } : { start: end, end: start };
    return getAlignedPreviousMonthRange(currentRange.start, currentRange.end);
  }

  function getAlignedPreviousMonthRange(startKey, endKey) {
    const start = dateKeyToDate(startKey);
    const end = dateKeyToDate(endKey);
    if (!start || !end) return null;
    const compareStart = addMonthsClamped(start, -1);
    const compareEnd = addDays(compareStart, diffDays(start, end));
    return { start: toDateKey(compareStart), end: toDateKey(compareEnd) };
  }

  function switchModule(moduleId) {
    els.navItems.forEach((button) => {
      button.classList.toggle("active", button.dataset.module === moduleId);
    });
    els.moduleSections.forEach((section) => {
      section.classList.toggle("active", section.id === moduleId);
    });
    window.setTimeout(() => {
      renderDashboard();
      resizeCharts();
    }, 60);
  }

  function renderDashboard() {
    if (!state.allRecords.length) {
      renderEmptyState();
      return;
    }

    const filteredRecords = applyCurrentFilters(state.allRecords, {
      includeMonth: true,
      includeDate: true,
      includeCategory: true,
    });
    state.filteredRecords = filteredRecords;

    const comparisonRecords = applyCurrentFilters(state.allRecords, {
      includeMonth: false,
      includeDate: false,
      includeCategory: true,
    });

    const context = buildContext(filteredRecords, comparisonRecords);

    els.emptyState.classList.add("hidden");
    els.dashboardContent.classList.remove("hidden");
    updateMeta(context);
    renderOverview(context);
    renderChannel(context);
    renderProduct(context);
    renderAnomaly(context);
    renderRecommendation(context);
    updateHealthText(context);
    resizeCharts();
  }

  function renderEmptyState() {
    els.emptyState.classList.remove("hidden");
    els.dashboardContent.classList.add("hidden");
    els.exportBtn.disabled = true;
    els.dateRangeText.textContent = "-";
    els.recordCountText.textContent = "0";
    els.filteredCountText.textContent = "0";
    els.fileCountText.textContent = "0";
  }

  function applyCurrentFilters(records, options) {
    const month = els.monthFilter.value;
    const start = els.startDateFilter.value;
    const end = els.endDateFilter.value;
    const channelSet = readMultiFilter(els.channelFilter);
    const categorySet = readMultiFilter(els.categoryFilter);
    const storeSet = readMultiFilter(els.storeFilter);
    const brand = els.brandFilter.value;
    const regionSet = readMultiFilter(els.regionFilter);
    const productKeyword = normalizeForSearch(els.productSearch.value);

    return records.filter((record) => {
      if (options.includeCategory) {
        if (channelSet && !channelSet.has(record.channel)) return false;
        if (categorySet && !categorySet.has(record.category || "未识别类目")) return false;
        if (storeSet) {
          const storeKey = state.storeFilterUsesChannel ? record.channel : record.store || "";
          if (!storeSet.has(storeKey)) return false;
        }
        if (brand !== "all" && record.brand !== brand) return false;
        if (regionSet && !regionSet.has(record.region)) return false;
        if (productKeyword) {
          const productText = normalizeForSearch(`${record.product} ${record.sku}`);
          if (!productText.includes(productKeyword)) return false;
        }
      }
      if (options.includeMonth && month !== "all" && record.monthKey !== month) return false;
      if (options.includeDate) {
        if (start && record.dateKey < start) return false;
        if (end && record.dateKey > end) return false;
      }
      return true;
    });
  }

  function buildContext(filteredRecords, comparisonRecords) {
    const currentRange = getCurrentRange();
    const compareRange = getCompareRange(currentRange);
    const currentMonth = currentRange ? currentRange.start.slice(0, 7) : latestMonth(comparisonRecords);
    const previousMonth = compareRange ? compareRange.start.slice(0, 7) : previousMonthKey(currentMonth);
    const currentMonthRecords = filteredRecords;
    const previousMonthRecords = compareRange
      ? comparisonRecords.filter((record) => record.dateKey >= compareRange.start && record.dateKey <= compareRange.end)
      : [];
    const daily = aggregateDaily(filteredRecords);
    const totals = calcTotals(filteredRecords);
    const currentTotals = calcTotals(currentMonthRecords);
    const previousTotals = calcTotals(previousMonthRecords);
    const mom = calcGrowth(currentTotals.amount, previousTotals.amount);
    const channelStats = buildEntityStats({
      displayRecords: filteredRecords,
      currentRecords: currentMonthRecords,
      previousRecords: previousMonthRecords,
      field: "channel",
      keyField: "channel",
    });
    const categoryStats = buildEntityStats({
      displayRecords: filteredRecords,
      currentRecords: currentMonthRecords,
      previousRecords: previousMonthRecords,
      field: "category",
      keyField: "category",
    });
    const productStats = buildProductStats({
      displayRecords: filteredRecords,
      currentRecords: currentMonthRecords,
      previousRecords: previousMonthRecords,
    });
    const forecast = buildForecast(currentRange, comparisonRecords);

    return {
      filteredRecords,
      comparisonRecords,
      currentRange,
      compareRange,
      currentLabel: formatRangeLabel(currentRange),
      compareLabel: formatRangeLabel(compareRange),
      currentMonth,
      previousMonth,
      currentMonthRecords,
      previousMonthRecords,
      totals,
      currentTotals,
      previousTotals,
      mom,
      daily,
      forecast,
      channelStats,
      categoryStats,
      productStats,
      anomalies: buildAnomalies(daily, channelStats, productStats),
    };
  }

  function updateMeta(context) {
    const allDates = state.allRecords.map((record) => record.dateKey).sort();
    const start = allDates[0] || "-";
    const end = allDates[allDates.length - 1] || "-";
    els.dateRangeText.textContent = start === "-" ? "-" : `${start} 至 ${end}`;
    els.recordCountText.textContent = formatInteger(state.allRecords.length);
    els.filteredCountText.textContent = formatInteger(context.filteredRecords.length);
    els.fileCountText.textContent = formatInteger(state.dataBundle?.meta?.files || state.fileReports.length);
    els.exportBtn.disabled = !context.filteredRecords.length;
  }

  function renderOverview(context) {
    const { totals, currentTotals, previousTotals, mom, daily } = context;
    const latestDays = daily.slice(-7);

    setText("kpiGmv", formatMoney(totals.amount));
    setText("kpiGmvSub", `${formatInteger(totals.dateCount)} 个有出货日期`);
    setText("kpiQty", formatInteger(totals.quantity));
    setText("kpiQtySub", totals.quantity ? `平均每日 ${formatInteger(totals.quantity / Math.max(totals.dateCount, 1))}` : "-");
    setText("kpiOrders", formatInteger(totals.orderCount));
    setText("kpiOrdersSub", totals.orderMode);
    setText("kpiAvgPrice", totals.avgPrice ? formatMoney(totals.avgPrice) : "-");
    setText("kpiDailyAvg", totals.dailyAvg ? formatMoney(totals.dailyAvg) : "-");
    setText("kpiDailyAvgSub", latestDays.length ? `最近日期 ${latestDays[latestDays.length - 1].date}` : "-");
    setText("kpiMom", formatGrowth(mom.rate));
    setText("kpiMomSub", `${context.currentLabel} vs ${context.compareLabel}，差额 ${formatSignedMoney(mom.delta)}`);
    setTone(els.kpiMom, mom.delta);

    const overviewConclusion = buildOverviewConclusion(context);
    setText("overviewConclusion", overviewConclusion);
    renderList(els.overviewInsights, buildOverviewInsights(context));
    setText("monthTrendLabel", `${context.currentLabel}，累计 ${formatMoney(currentTotals.amount)}`);

    renderKpiSparks(context);
    renderOverviewStoryCharts(context);
    renderRecentTrendChart(latestDays);
    renderMonthlyCumulativeChart(context);
    renderForecastChart(context);
  }

  function buildOverviewConclusion(context) {
    const { mom, currentTotals, previousTotals } = context;
    if (!context.filteredRecords.length) return "当前筛选下没有可分析的数据，请调整筛选条件。";
    if (!previousTotals.amount) {
      return `${context.currentLabel} GMV 为 ${formatMoney(currentTotals.amount)}；对比周期缺少可比 GMV，暂不能判断增长或下滑。`;
    }
    const status = mom.rate > 0.03 ? "增长" : mom.rate < -0.03 ? "下滑" : "基本持平";
    return `${context.currentLabel} GMV 较对比周期${status} ${formatGrowth(mom.rate)}，差额 ${formatSignedMoney(mom.delta)}。当前整体生意判断为：${status}。`;
  }

  function buildOverviewInsights(context) {
    const insights = [];
    const topChannel = context.channelStats.byDisplayGmv[0];
    const growthChannel = context.channelStats.byDelta.find((item) => item.delta > 0);
    const dragChannel = [...context.channelStats.byDelta].reverse().find((item) => item.delta < 0);
    const dragProduct = [...context.productStats.byDelta].reverse().find((item) => item.delta < 0);
    const lowDays = context.anomalies.rolling.filter((item) => item.diffRate < -0.1).slice(-3);
    const forecast = context.forecast;

    insights.push(buildOverviewConclusion(context));
    if (forecast?.items?.length) {
      insights.push(`未来 7 日预计 GMV ${formatMoney(forecast.total)}，日均 ${formatMoney(forecast.dailyAvg)}；该预估基于历史出货趋势和星期分布，不包含临时活动、缺货等突发因素。`);
    }
    if (topChannel) {
      insights.push(`${topChannel.name} 是当前 GMV 贡献最大的渠道，贡献 ${formatMoney(topChannel.gmv)}，占当前筛选 GMV 的 ${formatPercent(topChannel.share)}。`);
    }
    if (growthChannel) {
      insights.push(`增长主要来自 ${growthChannel.name}，当前周期较对比周期增加 ${formatMoney(growthChannel.delta)}。`);
    }
    if (dragChannel) {
      insights.push(`渠道端最大拖累来自 ${dragChannel.name}，当前周期较对比周期减少 ${formatMoney(Math.abs(dragChannel.delta))}。`);
    }
    if (dragProduct) {
      insights.push(`商品端需要关注 ${dragProduct.name}，当前周期较对比周期减少 ${formatMoney(Math.abs(dragProduct.delta))}。`);
    }
    if (lowDays.length) {
      insights.push(`最近存在 ${lowDays.length} 天低于近 7 日均值 10% 以上，需复盘对应日期的渠道和商品结构。`);
    }
    return insights.slice(0, 6);
  }

  function renderRecentTrendChart(days) {
    if (!days.length) {
      setChart("recentTrendChart", emptyChartOption("当前筛选下暂无每日趋势"));
      return;
    }

    setChart(
      "recentTrendChart",
      {
        ...baseChartOption(),
        tooltip: moneyTooltip("GMV"),
        grid: chartGrid(),
        xAxis: {
          type: "category",
          data: days.map((day) => day.date),
          axisLabel: { color: COLORS.muted },
        },
        yAxis: moneyAxis(),
        series: [
          {
            name: "GMV",
            type: "line",
            smooth: true,
            symbolSize: 8,
            areaStyle: { color: "rgba(36, 84, 166, 0.12)" },
            lineStyle: { width: 3, color: COLORS.primary },
            itemStyle: { color: COLORS.primary },
            data: days.map((day) => round2(day.amount)),
          },
        ],
      },
      (params) => linkDateFilter(params.name),
    );
  }

  function renderMonthlyCumulativeChart(context) {
    const monthRecords = context.currentMonthRecords;
    const daily = aggregateDaily(monthRecords);
    let cumulative = 0;
    const data = daily.map((day) => {
      cumulative += day.amount;
      return {
        date: day.date,
        value: round2(cumulative),
      };
    });

    if (!data.length) {
      setChart("monthlyCumulativeChart", emptyChartOption("当前月份暂无数据"));
      return;
    }

    setChart(
      "monthlyCumulativeChart",
      {
        ...baseChartOption(),
        tooltip: moneyTooltip("累计 GMV"),
        grid: chartGrid(),
        xAxis: {
          type: "category",
          data: data.map((item) => item.date),
          axisLabel: { color: COLORS.muted },
        },
        yAxis: moneyAxis(),
        series: [
          {
            name: "累计 GMV",
            type: "line",
            smooth: true,
            symbol: "none",
            lineStyle: { width: 3, color: COLORS.positive },
            areaStyle: { color: "rgba(20, 132, 95, 0.12)" },
            data: data.map((item) => item.value),
          },
        ],
      },
      (params) => linkDateFilter(params.name),
    );
  }

  function renderForecastChart(context) {
    const forecast = context.forecast;
    if (!forecast?.items?.length) {
      setText("forecastSummary", "历史有效日期不足，暂不输出预估");
      setChart("forecastTrendChart", emptyChartOption("至少需要 3 天历史数据才能生成预估"));
      return;
    }

    setText(
      "forecastSummary",
      `预计未来 7 日 GMV ${formatMoney(forecast.total)}，日均 ${formatMoney(forecast.dailyAvg)}`,
    );

    const actual = forecast.actual;
    const forecastItems = forecast.items;
    const dates = [...actual.map((item) => item.date), ...forecastItems.map((item) => item.date)];
    const actualMap = new Map(actual.map((item) => [item.date, item.amount]));
    const forecastMap = new Map(forecastItems.map((item) => [item.date, item.amount]));
    const lastActual = actual[actual.length - 1];

    setChart(
      "forecastTrendChart",
      {
        ...baseChartOption(),
        tooltip: {
          trigger: "axis",
          formatter: (params) => {
            const lines = [`${params[0].axisValue}`];
            params.forEach((param) => {
              if (param.value == null || param.value === "-") return;
              lines.push(`${param.marker}${param.seriesName}：${formatMoney(param.value)}`);
            });
            return lines.join("<br/>");
          },
        },
        legend: { top: 0, right: 8, textStyle: { color: COLORS.muted } },
        grid: chartGrid(),
        xAxis: {
          type: "category",
          data: dates,
          axisLabel: { color: COLORS.muted },
        },
        yAxis: moneyAxis(),
        series: [
          {
            name: "历史 GMV",
            type: "line",
            smooth: true,
            symbolSize: 6,
            lineStyle: { width: 3, color: COLORS.primary },
            itemStyle: { color: COLORS.primary },
            areaStyle: { color: "rgba(36, 84, 166, 0.08)" },
            data: dates.map((date) => (actualMap.has(date) ? round2(actualMap.get(date)) : null)),
          },
          {
            name: "7 日预估",
            type: "line",
            smooth: true,
            symbolSize: 7,
            lineStyle: { width: 3, color: COLORS.warning, type: "dashed" },
            itemStyle: { color: COLORS.warning },
            data: dates.map((date) => {
              if (lastActual && date === lastActual.date) return round2(lastActual.amount);
              return forecastMap.has(date) ? round2(forecastMap.get(date)) : null;
            }),
          },
        ],
      },
      (params) => {
        if (actualMap.has(params.name)) linkDateFilter(params.name);
      },
    );
  }

  function buildForecast(currentRange, records) {
    const endKey = currentRange?.end;
    const history = aggregateDaily(records)
      .filter((item) => !endKey || item.date <= endKey)
      .filter((item) => item.amount > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (history.length < 3) {
      return { actual: history, items: [], total: 0, dailyAvg: 0 };
    }

    const recent = history.slice(-Math.min(14, history.length));
    const lastSeven = recent.slice(-Math.min(7, recent.length));
    const base = sum(lastSeven.map((item) => item.amount)) / Math.max(lastSeven.length, 1);
    const slope = linearSlope(recent.map((item) => item.amount));
    const weekdayFactors = buildWeekdayFactors(history);
    const latestDate = dateKeyToDate(history[history.length - 1].date);
    if (!latestDate) return { actual: history.slice(-21), items: [], total: 0, dailyAvg: 0 };

    const items = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(latestDate, index + 1);
      const factor = weekdayFactors[date.getDay()] || 1;
      const raw = (base + slope * (index + 1)) * factor;
      return {
        date: toDateKey(date),
        amount: Math.max(0, raw),
      };
    });
    const total = sum(items.map((item) => item.amount));
    return {
      actual: history.slice(-21),
      items,
      total,
      dailyAvg: total / items.length,
      base,
      slope,
    };
  }

  function linearSlope(values) {
    if (values.length < 2) return 0;
    const xAvg = (values.length - 1) / 2;
    const yAvg = sum(values) / values.length;
    let numerator = 0;
    let denominator = 0;
    values.forEach((value, index) => {
      numerator += (index - xAvg) * (value - yAvg);
      denominator += (index - xAvg) ** 2;
    });
    return denominator ? numerator / denominator : 0;
  }

  function buildWeekdayFactors(days) {
    const overall = sum(days.map((item) => item.amount)) / Math.max(days.length, 1);
    if (!overall) return Array(7).fill(1);
    return Array.from({ length: 7 }, (_, weekday) => {
      const sameWeekday = days.filter((item) => dateKeyToDate(item.date)?.getDay() === weekday);
      if (!sameWeekday.length) return 1;
      const avg = sum(sameWeekday.map((item) => item.amount)) / sameWeekday.length;
      return clamp(avg / overall, 0.72, 1.28);
    });
  }

  function renderKpiSparks(context) {
    const daily = context.daily;
    const monthly = aggregateByMonth(context.comparisonRecords);
    renderSparkLine("sparkGmvChart", daily.map((item) => item.amount), COLORS.primary);
    renderSparkLine("sparkQtyChart", daily.map((item) => item.quantity), COLORS.negative);
    renderSparkLine("sparkOrderChart", daily.map((item) => item.orderCount), COLORS.warning);
    renderSparkLine(
      "sparkAvgPriceChart",
      daily.map((item) => (item.quantity ? item.amount / item.quantity : 0)),
      COLORS.warning,
    );
    renderSparkLine(
      "sparkDailyAvgChart",
      daily.map((item, index) => {
        const part = daily.slice(0, index + 1);
        return sum(part.map((day) => day.amount)) / Math.max(part.length, 1);
      }),
      COLORS.primary,
    );
    renderSparkLine("sparkMomChart", monthly.map((item) => item.amount), context.mom.delta >= 0 ? COLORS.positive : COLORS.negative);
  }

  function renderSparkLine(chartId, values, color) {
    if (!values.length) {
      setChart(chartId, emptyChartOption(""));
      return;
    }

    setChart(chartId, {
      ...baseChartOption(),
      grid: { top: 3, right: 2, bottom: 3, left: 2 },
      xAxis: { type: "category", show: false, data: values.map((_, index) => String(index + 1)) },
      yAxis: { type: "value", show: false, min: "dataMin", max: "dataMax" },
      series: [
        {
          type: "line",
          smooth: true,
          symbol: "none",
          lineStyle: { width: 2, color },
          areaStyle: { color: `${color}22` },
          data: values.map(round2),
        },
      ],
    });
  }

  function renderOverviewStoryCharts(context) {
    renderHorizontalMoneyBar(
      "overviewChannelRankChart",
      context.channelStats.byDisplayGmv.slice(0, 12).reverse(),
      "GMV",
      "gmv",
      linkChannelFilter,
    );
    renderChannelDailyStackChart(context);
    renderHorizontalMoneyBar(
      "overviewProductRankChart",
      context.productStats.byDisplayGmv.slice(0, 12).reverse(),
      "GMV",
      "gmv",
      linkProductFilter,
    );
    renderOrderAmountBucketChart(context);
    renderProductShareDonutChart(context);
    renderPriceSalesTrendChart(context);
  }

  function renderChannelDailyStackChart(context) {
    const records = context.filteredRecords;
    const days = context.daily.map((item) => item.date);
    const topChannels = context.channelStats.byDisplayGmv.slice(0, 8).map((item) => item.name);
    if (!records.length || !days.length || !topChannels.length) {
      setChart("channelDailyStackChart", emptyChartOption("当前筛选下暂无经销商日表现"));
      return;
    }

    const map = new Map();
    records.forEach((record) => {
      const channel = topChannels.includes(record.channel) ? record.channel : "其他";
      const key = `${record.dateKey}__${channel}`;
      map.set(key, (map.get(key) || 0) + record.amount);
    });
    const channels = topChannels.length < context.channelStats.all.length ? [...topChannels, "其他"] : topChannels;

    setChart(
      "channelDailyStackChart",
      {
        ...baseChartOption(),
        color: COLORS.palette,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: formatMoney,
        },
        legend: {
          type: "scroll",
          orient: "vertical",
          right: 0,
          top: 12,
          bottom: 12,
          textStyle: { color: COLORS.muted },
        },
        grid: { top: 34, right: 132, bottom: 36, left: 56, containLabel: true },
        xAxis: {
          type: "category",
          data: days,
          axisLabel: { color: COLORS.muted, formatter: (value) => value },
          axisTick: { show: false },
        },
        yAxis: moneyAxis(),
        series: channels.map((channel) => ({
          name: channel,
          type: "line",
          stack: "GMV",
          areaStyle: { opacity: 0.82 },
          symbol: "none",
          emphasis: { focus: "series" },
          data: days.map((day) => round2(map.get(`${day}__${channel}`) || 0)),
        })),
      },
      (params) => {
        if (params.seriesName && params.seriesName !== "其他") linkChannelFilter(params.seriesName);
      },
    );
  }

  function renderOrderAmountBucketChart(context) {
    const values = buildOrderAmountValues(context.filteredRecords);
    if (!values.length) {
      setChart("orderAmountBucketChart", emptyChartOption("当前筛选下暂无订单金额"));
      return;
    }
    const buckets = [
      { name: "0-25", min: 0, max: 25 },
      { name: "25-50", min: 25, max: 50 },
      { name: "50-100", min: 50, max: 100 },
      { name: "100+", min: 100, max: Infinity },
    ].map((bucket) => ({
      ...bucket,
      count: values.filter((value) => value >= bucket.min && value < bucket.max).length,
    }));
    const total = values.length || 1;

    setChart("orderAmountBucketChart", {
      ...baseChartOption(),
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const item = buckets[params[0].dataIndex];
          return `${item.name}<br/>占比：${formatPercent(item.count / total)}<br/>数量：${formatInteger(item.count)}`;
        },
      },
      grid: chartGrid(58),
      xAxis: {
        type: "value",
        max: 1,
        axisLabel: { color: COLORS.muted, formatter: (value) => formatPercent(value) },
        splitLine: { lineStyle: { color: COLORS.grid } },
      },
      yAxis: categoryAxis(buckets.map((item) => item.name)),
      series: [
        {
          type: "bar",
          data: buckets.map((item) => round2(item.count / total)),
          itemStyle: { color: "#557fae" },
          label: {
            show: true,
            position: "right",
            color: COLORS.text,
            formatter: (params) => formatPercent(params.value),
          },
        },
      ],
    });
  }

  function buildOrderAmountValues(records) {
    const hasOrderId = records.some((record) => record.orderId);
    if (!hasOrderId) return records.map((record) => record.amount).filter((value) => value > 0);
    const map = new Map();
    records.forEach((record) => {
      const key = record.orderId || `${record.fileName}-${record.rowNumber}`;
      map.set(key, (map.get(key) || 0) + record.amount);
    });
    return Array.from(map.values()).filter((value) => value > 0);
  }

  function renderProductShareDonutChart(context) {
    const rows = context.productStats.byDisplayGmv.slice(0, 6);
    if (!rows.length) {
      setChart("productShareDonutChart", emptyChartOption("当前筛选下暂无商品集中度"));
      return;
    }
    const topAmount = sum(rows.map((item) => item.gmv));
    const otherAmount = Math.max(context.productStats.totalDisplayAmount - topAmount, 0);
    const data = [
      ...rows.map((item) => ({ name: truncate(item.name, 10), value: round2(item.gmv), rawName: item.name })),
      ...(otherAmount > 0 ? [{ name: "其他", value: round2(otherAmount), rawName: "其他" }] : []),
    ];

    setChart(
      "productShareDonutChart",
      {
        ...baseChartOption(),
        color: COLORS.palette,
        tooltip: {
          trigger: "item",
          formatter: (params) => `${escapeHtml(params.data.rawName)}<br/>GMV：${formatMoney(params.value)}<br/>占比：${params.percent}%`,
        },
        series: [
          {
            type: "pie",
            radius: ["44%", "72%"],
            center: ["50%", "52%"],
            avoidLabelOverlap: true,
            label: {
              formatter: "{d}%",
              color: COLORS.text,
            },
            data,
          },
        ],
      },
      (params) => {
        if (params.data.rawName !== "其他") linkProductFilter(params.data.rawName);
      },
    );
  }

  function renderPriceSalesTrendChart(context) {
    const daily = context.daily;
    if (!daily.length) {
      setChart("priceSalesTrendChart", emptyChartOption("当前筛选下暂无价格和销售趋势"));
      return;
    }
    setChart(
      "priceSalesTrendChart",
      {
        ...baseChartOption(),
        tooltip: {
          trigger: "axis",
          formatter: (params) => {
            const date = params[0].axisValue;
            const gmv = params.find((item) => item.seriesName === "GMV")?.value || 0;
            const price = params.find((item) => item.seriesName === "平均单价")?.value || 0;
            return `${date}<br/>GMV：${formatMoney(gmv)}<br/>平均单价：${formatMoney(price)}`;
          },
        },
        legend: { top: 0, right: 0, textStyle: { color: COLORS.muted } },
        grid: { top: 42, right: 54, bottom: 34, left: 56, containLabel: true },
        xAxis: {
          type: "category",
          data: daily.map((item) => item.date),
          axisLabel: { color: COLORS.muted, formatter: (value) => value },
          axisTick: { show: false },
        },
        yAxis: [
          moneyAxis(),
          {
            type: "value",
            axisLabel: { color: COLORS.muted, formatter: compactAxis },
            splitLine: { show: false },
          },
        ],
        series: [
          {
            name: "GMV",
            type: "bar",
            barMaxWidth: 18,
            itemStyle: { color: "#7aa6ce" },
            data: daily.map((item) => round2(item.amount)),
          },
          {
            name: "平均单价",
            type: "line",
            yAxisIndex: 1,
            smooth: true,
            symbolSize: 6,
            lineStyle: { width: 3, color: "#6cb7b0" },
            itemStyle: { color: "#6cb7b0" },
            data: daily.map((item) => round2(item.quantity ? item.amount / item.quantity : 0)),
          },
        ],
      },
      (params) => linkDateFilter(params.name),
    );
  }

  function renderChannel(context) {
    const stats = context.channelStats;
    const topChannel = stats.byDisplayGmv[0];
    const fastChannel = stats.byGrowth.find((item) => Number.isFinite(item.growthRate) && item.currentAmount > 0);
    const dragChannel = [...stats.byDelta].reverse().find((item) => item.delta < 0);

    setText("topChannelName", topChannel ? topChannel.name : "-");
    setText("topChannelDesc", topChannel ? `${formatMoney(topChannel.gmv)}，占比 ${formatPercent(topChannel.share)}` : "-");
    setText("fastChannelName", fastChannel ? fastChannel.name : "-");
    setText("fastChannelDesc", fastChannel ? `环比 ${formatGrowth(fastChannel.growthRate)}，增加 ${formatSignedMoney(fastChannel.delta)}` : "缺少可比增长渠道");
    setText("dragChannelName", dragChannel ? dragChannel.name : "-");
    setText("dragChannelDesc", dragChannel ? `减少 ${formatMoney(Math.abs(dragChannel.delta))}，环比 ${formatGrowth(dragChannel.growthRate)}` : "暂无明显拖累渠道");
    setText("channelConcentration", formatPercent(stats.top3Share));
    setText("channelConcentrationDesc", stats.top3Share >= 0.7 ? "TOP3 渠道占比较高，存在集中依赖" : "渠道结构相对分散");
    setText("channelConclusion", buildChannelConclusion(context));
    setText("channelTableNote", `${context.currentLabel} vs ${context.compareLabel}`);

    renderChannelCharts(stats);
    renderChannelTable(stats);
  }

  function buildChannelConclusion(context) {
    const stats = context.channelStats;
    const top = stats.byDisplayGmv[0];
    const growth = stats.byDelta.find((item) => item.delta > 0);
    const drag = [...stats.byDelta].reverse().find((item) => item.delta < 0);
    if (!top) return "当前筛选下没有渠道数据。";

    const concentration = stats.top3Share >= 0.7 ? "渠道集中度偏高，需要降低对头部渠道的依赖。" : "渠道集中度处于可控状态。";
    const growthText = growth ? `增长最大来自 ${growth.name}（${formatSignedMoney(growth.delta)}）` : "暂无明确增长渠道";
    const dragText = drag ? `拖累最大来自 ${drag.name}（${formatSignedMoney(drag.delta)}）` : "暂无明确拖累渠道";
    return `${top.name} 贡献最大，${growthText}，${dragText}。${concentration}`;
  }

  function renderChannelCharts(stats) {
    const byGmv = stats.byDisplayGmv.slice(0, 12).reverse();
    const byQty = [...stats.all].sort((a, b) => b.quantity - a.quantity).slice(0, 12).reverse();
    const byGrowth = stats.byGrowth
      .filter((item) => item.previousAmount > 0 || item.currentAmount > 0)
      .slice(0, 12)
      .reverse();
    const byDelta = stats.byDelta.slice(0, 12).reverse();

    renderHorizontalMoneyBar("channelGmvChart", byGmv, "GMV", "gmv", linkChannelFilter);
    renderHorizontalNumberBar("channelQtyChart", byQty, "出货数量", "quantity", linkChannelFilter);

    if (!byGrowth.length) {
      setChart("channelGrowthChart", emptyChartOption("缺少对比周期渠道数据"));
    } else {
      setChart(
        "channelGrowthChart",
        {
          ...baseChartOption(),
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            formatter: (params) => {
              const item = byGrowth[params[0].dataIndex];
              return `${escapeHtml(item.name)}<br/>环比：${formatGrowth(item.growthRate)}<br/>差额：${formatSignedMoney(item.delta)}`;
            },
          },
          grid: chartGrid(96),
          xAxis: percentAxis(),
          yAxis: categoryAxis(byGrowth.map((item) => item.name)),
          series: [
            {
              type: "bar",
              data: byGrowth.map((item) => ({
                value: Number.isFinite(item.growthRate) ? round2(item.growthRate * 100) : 100,
                itemStyle: { color: item.delta >= 0 ? COLORS.positive : COLORS.negative },
              })),
              label: {
                show: true,
                position: "right",
                formatter: (params) => formatGrowth((params.value || 0) / 100),
                color: COLORS.text,
              },
            },
          ],
        },
        (params) => linkChannelFilter(params.name),
      );
    }

    renderHorizontalDeltaBar("channelContributionChart", byDelta, "GMV 增量", "delta", linkChannelFilter);
  }

  function renderChannelTable(stats) {
    const rows = stats.byDisplayGmv.slice(0, 80);
    els.channelTableBody.innerHTML = rows.length
      ? rows
          .map(
            (item) => `
              <tr>
                <td title="${escapeHtml(item.name)}">${escapeHtml(truncate(item.name, 26))}</td>
                <td>${formatMoney(item.gmv)}</td>
                <td>${formatInteger(item.quantity)}</td>
                <td>${formatPercent(item.share)}</td>
                <td class="${toneClass(item.delta)}">${formatGrowth(item.growthRate)}</td>
                <td class="${toneClass(item.delta)}">${formatSignedMoney(item.delta)}</td>
              </tr>
            `,
          )
          .join("")
      : `<tr><td colspan="6">当前筛选下暂无渠道数据</td></tr>`;
  }

  function renderProduct(context) {
    const stats = context.productStats;
    const counts = stats.categoryCounts;
    const topProduct = stats.byDisplayGmv[0];
    const dragProduct = [...stats.byDelta].reverse().find((item) => item.delta < 0);

    setText("heroProductCount", formatInteger(counts["核心爆品"] || 0));
    setText("heroProductDesc", firstProductByCategory(stats.all, "核心爆品") || "暂无达到分层标准的商品");
    setText("potentialProductCount", formatInteger(counts["增长潜力品"] || 0));
    setText("potentialProductDesc", firstProductByCategory(stats.all, "增长潜力品") || "暂无显著增长潜力品");
    setText("riskProductCount", formatInteger(counts["下滑风险品"] || 0));
    setText("riskProductDesc", firstProductByCategory(stats.all, "下滑风险品") || "暂无显著下滑风险品");
    setText("productConcentration", formatPercent(stats.top5Share));
    setText("productConcentrationDesc", stats.top5Share >= 0.6 ? "TOP5 单品占比较高" : "单品集中度相对可控");
    setText("productConclusion", buildProductConclusion(stats, topProduct, dragProduct));

    renderCategoryCharts(context.categoryStats);
    renderProductCharts(stats);
    renderProductTable(stats);
  }

  function renderCategoryCharts(stats) {
    if (!stats?.all?.length) {
      setChart("categoryGmvChart", emptyChartOption("当前筛选下暂无产品大类数据"));
      setChart("categoryContributionChart", emptyChartOption("当前筛选下暂无产品大类数据"));
      return;
    }
    renderHorizontalMoneyBar(
      "categoryGmvChart",
      stats.byDisplayGmv.slice(0, 14).reverse(),
      "GMV",
      "gmv",
      linkCategoryFilter,
    );
    renderHorizontalDeltaBar(
      "categoryContributionChart",
      stats.byDelta.slice(0, 14).reverse(),
      "GMV 增量",
      "delta",
      linkCategoryFilter,
    );
  }

  function buildProductConclusion(stats, topProduct, dragProduct) {
    if (!topProduct) return "当前筛选下没有商品数据。";
    const concentration = stats.top5Share >= 0.6 ? "单品集中度偏高，需关注头部商品波动对整体 GMV 的影响。" : "商品结构相对均衡。";
    const dragText = dragProduct ? `拖累商品主要是 ${dragProduct.name}，环比减少 ${formatMoney(Math.abs(dragProduct.delta))}。` : "暂无明显拖累商品。";
    return `${topProduct.name} 是当前 GMV 最高商品，贡献 ${formatPercent(topProduct.share)}。${dragText}${concentration}`;
  }

  function renderProductCharts(stats) {
    const byGmv = stats.byDisplayGmv.slice(0, 12).reverse();
    const byQty = [...stats.all].sort((a, b) => b.quantity - a.quantity).slice(0, 12).reverse();
    const byDelta = stats.byDelta.slice(0, 12).reverse();

    renderHorizontalMoneyBar("productGmvChart", byGmv, "GMV", "gmv", linkProductFilter);
    renderHorizontalNumberBar("productQtyChart", byQty, "出货数量", "quantity", linkProductFilter);
    renderHorizontalDeltaBar("productGrowthChart", byDelta, "GMV 增量", "delta", linkProductFilter);
    renderProductMatrix("productMatrixChart", stats.all.slice(0, 250));
  }

  function renderProductMatrix(chartId, products) {
    if (!products.length) {
      setChart(chartId, emptyChartOption("当前筛选下暂无商品数据"));
      return;
    }

    const categoryColor = {
      核心爆品: COLORS.positive,
      增长潜力品: COLORS.primary,
      下滑风险品: COLORS.negative,
      长尾低效品: COLORS.warning,
      普通经营品: "#64748b",
    };

    setChart(
      chartId,
      {
        ...baseChartOption(),
        tooltip: {
          trigger: "item",
          formatter: (params) => {
            const item = params.data.raw;
            return [
              escapeHtml(item.name),
              `产品大类：${escapeHtml(item.productCategory || "-")}`,
              `分类：${item.category}`,
              `GMV：${formatMoney(item.gmv)}`,
              `出货数量：${formatInteger(item.quantity)}`,
              `环比：${formatGrowth(item.growthRate)}`,
            ].join("<br/>");
          },
        },
        grid: chartGrid(70),
        xAxis: {
          type: "value",
          name: "销量/GMV增长率",
          axisLabel: { color: COLORS.muted, formatter: (value) => `${value}%` },
          splitLine: { lineStyle: { color: COLORS.grid } },
        },
        yAxis: {
          type: "value",
          name: "GMV贡献",
          axisLabel: { color: COLORS.muted, formatter: (value) => `${value}%` },
          splitLine: { lineStyle: { color: COLORS.grid } },
        },
        series: [
          {
            type: "scatter",
            symbolSize: (value) => clamp(Math.sqrt(Math.max(value[2], 0)) / 160, 8, 34),
            data: products.map((item) => ({
              name: item.name,
              value: [
                Number.isFinite(item.growthRate) ? round2(item.growthRate * 100) : 100,
                round2(item.share * 100),
                item.gmv,
              ],
              raw: item,
              itemStyle: { color: categoryColor[item.category] || "#64748b", opacity: 0.82 },
            })),
          },
        ],
      },
      (params) => linkProductFilter(params.name),
    );
  }

  function renderProductTable(stats) {
    const rows = stats.byDisplayGmv.slice(0, 100);
    els.productTableBody.innerHTML = rows.length
      ? rows
          .map(
            (item) => `
              <tr>
                <td title="${escapeHtml(item.name)}">${escapeHtml(truncate(item.name, 30))}</td>
                <td>${escapeHtml(item.sku || "-")}</td>
                <td>${escapeHtml(truncate(item.productCategory || "-", 18))}</td>
                <td><span class="tag ${categoryClass(item.category)}">${item.category}</span></td>
                <td>${formatMoney(item.gmv)}</td>
                <td>${formatInteger(item.quantity)}</td>
                <td class="${toneClass(item.delta)}">${formatGrowth(item.growthRate)}</td>
                <td>${formatPercent(item.share)}</td>
              </tr>
            `,
          )
          .join("")
      : `<tr><td colspan="8">当前筛选下暂无商品数据</td></tr>`;
  }

  function renderAnomaly(context) {
    const anomalies = context.anomalies;
    setText("anomalyConclusion", buildAnomalyConclusion(anomalies));
    renderDailyAnomalyChart(anomalies);
    renderRollingAverageChart(anomalies);
    renderAnomalyEntityCharts(context);
    renderPriorityList(context);
    renderAnomalyDateList(anomalies);
  }

  function buildAnomalyConclusion(anomalies) {
    if (!anomalies.daily.length) return "当前筛选下没有可用于异常识别的每日数据。";
    const high = anomalies.highDays[0];
    const low = anomalies.lowDays[0];
    const lowRollingCount = anomalies.rolling.filter((item) => item.diffRate < -0.1).length;
    const parts = [];
    if (high) parts.push(`${high.date} 是当前 GMV 高点，GMV ${formatMoney(high.amount)}`);
    if (low) parts.push(`${low.date} 是当前 GMV 低点，GMV ${formatMoney(low.amount)}`);
    if (lowRollingCount) parts.push(`${lowRollingCount} 天低于近 7 日均值 10% 以上`);
    return parts.length ? `${parts.join("；")}。` : "当前筛选范围内未出现明显异常波动。";
  }

  function renderDailyAnomalyChart(anomalies) {
    const daily = anomalies.daily;
    if (!daily.length) {
      setChart("dailyAnomalyChart", emptyChartOption("暂无每日 GMV 数据"));
      return;
    }

    const highSet = new Set(anomalies.highDays.map((item) => item.date));
    const lowSet = new Set(anomalies.lowDays.map((item) => item.date));

    setChart(
      "dailyAnomalyChart",
      {
        ...baseChartOption(),
        tooltip: moneyTooltip("GMV"),
        grid: chartGrid(),
        xAxis: {
          type: "category",
          data: daily.map((item) => item.date),
          axisLabel: { color: COLORS.muted },
        },
        yAxis: moneyAxis(),
        series: [
          {
            name: "GMV",
            type: "bar",
            data: daily.map((item) => ({
              value: round2(item.amount),
              itemStyle: {
                color: highSet.has(item.date) ? COLORS.positive : lowSet.has(item.date) ? COLORS.negative : COLORS.primary,
              },
            })),
            markLine: anomalies.thresholds
              ? {
                  symbol: "none",
                  lineStyle: { type: "dashed", color: COLORS.warning },
                  data: [{ yAxis: round2(anomalies.thresholds.high), name: "高点阈值" }],
                }
              : undefined,
          },
        ],
      },
      (params) => linkDateFilter(params.name),
    );
  }

  function renderRollingAverageChart(anomalies) {
    const rolling = anomalies.rolling.filter((item) => Number.isFinite(item.avg7));
    if (!rolling.length) {
      setChart("rollingAverageChart", emptyChartOption("至少需要 8 个日期才能计算近 7 日均值"));
      return;
    }

    setChart(
      "rollingAverageChart",
      {
        ...baseChartOption(),
        tooltip: {
          trigger: "axis",
          formatter: (params) => {
            const date = params[0].axisValue;
            const item = rolling.find((row) => row.date === date);
            return [
              date,
              `当日 GMV：${formatMoney(item.amount)}`,
              `近 7 日均值：${formatMoney(item.avg7)}`,
              `偏离：${formatGrowth(item.diffRate)}`,
            ].join("<br/>");
          },
        },
        grid: chartGrid(),
        legend: { top: 0, right: 0, textStyle: { color: COLORS.muted } },
        xAxis: {
          type: "category",
          data: rolling.map((item) => item.date),
          axisLabel: { color: COLORS.muted },
        },
        yAxis: moneyAxis(),
        series: [
          {
            name: "当日 GMV",
            type: "bar",
            data: rolling.map((item) => ({
              value: round2(item.amount),
              itemStyle: { color: item.diff >= 0 ? COLORS.positive : COLORS.negative },
            })),
          },
          {
            name: "近 7 日均值",
            type: "line",
            symbol: "none",
            lineStyle: { width: 3, color: COLORS.primary },
            data: rolling.map((item) => round2(item.avg7)),
          },
        ],
      },
      (params) => linkDateFilter(params.name),
    );
  }

  function renderAnomalyEntityCharts(context) {
    const channelVolatility = [...context.channelStats.all]
      .filter((item) => Math.abs(item.delta) > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 10)
      .reverse();
    const productVolatility = [...context.productStats.all]
      .filter((item) => Math.abs(item.delta) > 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 10)
      .reverse();

    renderHorizontalDeltaBar("anomalyChannelChart", channelVolatility, "GMV 波动", "delta", linkChannelFilter);
    renderHorizontalDeltaBar("anomalyProductChart", productVolatility, "GMV 波动", "delta", linkProductFilter);
  }

  function renderPriorityList(context) {
    const priorities = buildPriorities(context);
    els.priorityList.innerHTML = priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  }

  function buildPriorities(context) {
    const items = [];
    const dragChannel = [...context.channelStats.byDelta].reverse().find((item) => item.delta < 0);
    const dragProduct = [...context.productStats.byDelta].reverse().find((item) => item.delta < 0);
    const growthChannel = context.channelStats.byDelta.find((item) => item.delta > 0);
    const lowRolling = context.anomalies.rolling.filter((item) => item.diffRate < -0.1).slice(-3);

    if (context.previousTotals.amount && context.mom.delta < 0) {
      items.push(`先止住当前周期下滑：GMV 较对比周期减少 ${formatMoney(Math.abs(context.mom.delta))}，优先拆解 ${dragChannel ? dragChannel.name : "下滑渠道"} 与 ${dragProduct ? dragProduct.name : "下滑商品"}。`);
    } else if (growthChannel) {
      items.push(`放大有效增长来源：${growthChannel.name} 当前周期贡献增量 ${formatMoney(growthChannel.delta)}，优先复盘其商品组合和投放节奏。`);
    } else {
      items.push("先补齐可比数据或扩大筛选范围，当前筛选下增长归因不够充分。");
    }

    if (context.channelStats.top3Share >= 0.7) {
      items.push(`降低渠道集中风险：TOP3 渠道 GMV 占比 ${formatPercent(context.channelStats.top3Share)}，需要扶持腰部渠道或设置渠道备份目标。`);
    } else if (dragChannel) {
      items.push(`重点修复拖累渠道：${dragChannel.name} 环比 ${formatGrowth(dragChannel.growthRate)}，减少 ${formatMoney(Math.abs(dragChannel.delta))}。`);
    } else {
      items.push("保持渠道结构健康：继续跟踪 TOP 渠道贡献，同时观察腰部渠道是否有可复制增长。");
    }

    if (dragProduct) {
      items.push(`处理商品拖累：${dragProduct.name} 环比减少 ${formatMoney(Math.abs(dragProduct.delta))}，需要检查库存、价格、活动和渠道覆盖。`);
    } else if (lowRolling.length) {
      items.push(`复盘异常低点：最近 ${lowRolling.length} 天低于近 7 日均值 10% 以上，需核对发货节奏和渠道断点。`);
    } else {
      items.push("继续监控每日波动：当前未发现强拖累商品，但应保留异常高低点复盘机制。");
    }

    return items.slice(0, 3);
  }

  function renderAnomalyDateList(anomalies) {
    const highItems = anomalies.highDays.slice(0, 3).map((item) => `异常高点：${item.date}，GMV ${formatMoney(item.amount)}。`);
    const lowItems = anomalies.lowDays.slice(0, 3).map((item) => `异常低点：${item.date}，GMV ${formatMoney(item.amount)}。`);
    const belowAvg = anomalies.rolling
      .filter((item) => item.diff < 0)
      .slice(-3)
      .map((item) => `${item.date} 低于近 7 日均值 ${formatGrowth(item.diffRate)}。`);
    const aboveAvg = anomalies.rolling
      .filter((item) => item.diff > 0)
      .slice(-3)
      .map((item) => `${item.date} 高于近 7 日均值 ${formatGrowth(item.diffRate)}。`);

    renderList(els.anomalyDateList, [...highItems, ...lowItems, ...belowAvg, ...aboveAvg].slice(0, 10));
  }

  function renderRecommendation(context) {
    const priorities = buildPriorities(context);
    const actions = buildActionSuggestions(context);
    setText(
      "recommendationConclusion",
      priorities.length
        ? `当前管理重点：${priorities[0]}`
        : "当前筛选下暂无足够数据生成经营建议。",
    );
    if (els.recommendationPriorityList) {
      els.recommendationPriorityList.innerHTML = priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    }
    renderList(els.actionList, actions);
    renderChannelHealthChart(context);
    renderProductPriorityChart(context);
    renderQualityPanel();
  }

  function buildActionSuggestions(context) {
    const actions = [];
    const growthChannel = context.channelStats.byDelta.find((item) => item.delta > 0);
    const dragChannel = [...context.channelStats.byDelta].reverse().find((item) => item.delta < 0);
    const hero = context.productStats.all.filter((item) => item.category === "核心爆品").sort((a, b) => b.gmv - a.gmv)[0];
    const potential = context.productStats.all.filter((item) => item.category === "增长潜力品").sort((a, b) => b.delta - a.delta)[0];
    const risk = context.productStats.all.filter((item) => item.category === "下滑风险品").sort((a, b) => a.delta - b.delta)[0];

    if (growthChannel) {
      actions.push(`复制增长渠道打法：优先复盘 ${growthChannel.name} 的活动、价格、商品组合和库存供给，当前周期增量 ${formatMoney(growthChannel.delta)}。`);
    }
    if (dragChannel) {
      actions.push(`建立渠道修复清单：${dragChannel.name} 是当前最大拖累，先排查流量、转化、缺货、价格和大促节奏。`);
    }
    if (potential) {
      actions.push(`加码潜力商品：${potential.name} 已出现增量，建议保障库存并扩大到高效率渠道。`);
    }
    if (hero) {
      actions.push(`保护核心爆品：${hero.name} 贡献 ${formatPercent(hero.share)}，建议设置缺货预警和价格带监控。`);
    }
    if (risk) {
      actions.push(`处理下滑风险品：${risk.name} 环比 ${formatGrowth(risk.growthRate)}，需要判断是需求下滑、渠道断点还是供给问题。`);
    }
    if (context.channelStats.top3Share >= 0.7) {
      actions.push(`降低集中风险：TOP3 渠道占比 ${formatPercent(context.channelStats.top3Share)}，需要提升腰部渠道承接能力。`);
    }
    return actions.slice(0, 6);
  }

  function renderChannelHealthChart(context) {
    const rows = context.channelStats.all.filter((item) => item.gmv > 0).slice(0, 80);
    if (!rows.length) {
      setChart("channelHealthChart", emptyChartOption("当前筛选下暂无渠道健康数据"));
      return;
    }
    setChart(
      "channelHealthChart",
      {
        ...baseChartOption(),
        tooltip: {
          trigger: "item",
          formatter: (params) => {
            const item = params.data.raw;
            return `${escapeHtml(item.name)}<br/>GMV：${formatMoney(item.gmv)}<br/>环比：${formatGrowth(item.growthRate)}<br/>贡献：${formatPercent(item.share)}`;
          },
        },
        grid: chartGrid(70),
        xAxis: {
          type: "value",
          name: "环比增长率",
          axisLabel: { color: COLORS.muted, formatter: (value) => `${value}%` },
          splitLine: { lineStyle: { color: COLORS.grid } },
        },
        yAxis: {
          type: "value",
          name: "GMV贡献",
          axisLabel: { color: COLORS.muted, formatter: (value) => `${value}%` },
          splitLine: { lineStyle: { color: COLORS.grid } },
        },
        series: [
          {
            type: "scatter",
            symbolSize: (value) => clamp(Math.sqrt(Math.max(value[2], 0)) / 220, 10, 42),
            data: rows.map((item) => ({
              name: item.name,
              value: [
                Number.isFinite(item.growthRate) ? round2(item.growthRate * 100) : 100,
                round2(item.share * 100),
                item.gmv,
              ],
              raw: item,
              itemStyle: { color: item.delta >= 0 ? COLORS.positive : COLORS.negative, opacity: 0.78 },
            })),
          },
        ],
      },
      (params) => linkChannelFilter(params.name),
    );
  }

  function renderProductPriorityChart(context) {
    const rows = context.productStats.byDisplayGmv.slice(0, 160);
    if (!rows.length) {
      setChart("productPriorityChart", emptyChartOption("当前筛选下暂无商品优先级数据"));
      return;
    }
    setChart(
      "productPriorityChart",
      {
        ...baseChartOption(),
        tooltip: {
          trigger: "item",
          formatter: (params) => {
            const item = params.data.raw;
            return `${escapeHtml(item.name)}<br/>分类：${item.category}<br/>GMV贡献：${formatPercent(item.share)}<br/>环比：${formatGrowth(item.growthRate)}`;
          },
        },
        grid: chartGrid(70),
        xAxis: {
          type: "value",
          name: "销量/GMV增长",
          axisLabel: { color: COLORS.muted, formatter: (value) => `${value}%` },
          splitLine: { lineStyle: { color: COLORS.grid } },
        },
        yAxis: {
          type: "value",
          name: "GMV贡献",
          axisLabel: { color: COLORS.muted, formatter: (value) => `${value}%` },
          splitLine: { lineStyle: { color: COLORS.grid } },
        },
        series: [
          {
            type: "scatter",
            symbolSize: (value) => clamp(Math.sqrt(Math.max(value[2], 0)) / 160, 8, 38),
            data: rows.map((item) => ({
              name: item.name,
              value: [
                Number.isFinite(item.growthRate) ? round2(item.growthRate * 100) : 100,
                round2(item.share * 100),
                item.gmv,
              ],
              raw: item,
              itemStyle: { color: productCategoryColor(item.category), opacity: 0.8 },
            })),
          },
        ],
      },
      (params) => linkProductFilter(params.name),
    );
  }

  function renderQualityPanel() {
    if (!els.qualityPanel) return;
    const bundle = state.dataBundle;
    if (!bundle) {
      els.qualityPanel.innerHTML = "<div class=\"field-report\">当前使用上传或在线数据源，暂无本地构建质量报告。</div>";
      return;
    }
    const meta = bundle.meta || {};
    const summary = `
      <div class="field-report">
        <strong>统一数据模型</strong>
        <span>源目录：${escapeHtml(bundle.sourceDir || "-")}</span>
        <span>原始行数：${formatInteger(meta.rawRows)}；经营事实：${formatInteger(meta.factRows)}；日期范围：${(meta.dateRange || []).join(" 至 ")}</span>
        <span class="ok-text">已完成文件遍历、多文件合并、字段统一、日期清洗和汇总建模。</span>
      </div>
    `;
    const operationFields = meta.operationFields || bundle.metrics || [];
    const operationStatus = `
      <div class="field-report">
        <strong>数据口径说明</strong>
        ${
          operationFields.length
            ? `<span class="ok-text">已识别运营字段：${escapeHtml(operationFields.map((key) => FIELD_LABELS[key] || key).join("、"))}。</span>`
            : `<span class="ok-text">当前版本只使用本地出货数据，不接入流量、转化、推广费用等不完整口径。</span>`
        }
        ${EXTERNAL_SOURCE_STATUS.map((source) => `<span>${escapeHtml(source.name)}：${escapeHtml(source.status)}。${escapeHtml(source.detail)}</span>`).join("")}
      </div>
    `;
    const details = (bundle.quality || [])
      .map((item) => `
        <div class="field-report">
          <strong>${escapeHtml(item.fileName)}</strong>
          <span>原始 ${formatInteger(item.rows)} 行，有效 ${formatInteger(item.validRows)} 行，异常日期 ${formatInteger(item.invalidDateRows)} 行。</span>
          <span>${(item.missingFields || []).length ? `<span class="warning-text">缺失字段：${escapeHtml(item.missingFields.join("、"))}</span>` : "<span class=\"ok-text\">关键字段完整。</span>"}</span>
        </div>
      `)
      .join("");
    els.qualityPanel.innerHTML = summary + operationStatus + details;
  }

  function productCategoryColor(category) {
    return (
      {
        核心爆品: COLORS.positive,
        增长潜力品: COLORS.primary,
        下滑风险品: COLORS.negative,
        长尾低效品: COLORS.warning,
      }[category] || "#64748b"
    );
  }

  function buildEntityStats({ displayRecords, currentRecords, previousRecords, field, keyField }) {
    const displayAgg = aggregateEntity(displayRecords, (record) => record[field], (record) => record[field]);
    const currentAgg = aggregateEntity(currentRecords, (record) => record[keyField], (record) => record[field]);
    const previousAgg = aggregateEntity(previousRecords, (record) => record[keyField], (record) => record[field]);
    const totalDisplayAmount = sum(Array.from(displayAgg.values()).map((item) => item.amount));
    const totalDelta = sum(
      Array.from(new Set([...currentAgg.keys(), ...previousAgg.keys()])).map((key) => {
        const current = currentAgg.get(key)?.amount || 0;
        const previous = previousAgg.get(key)?.amount || 0;
        return current - previous;
      }),
    );

    const allKeys = new Set([...displayAgg.keys(), ...currentAgg.keys(), ...previousAgg.keys()]);
    const all = Array.from(allKeys).map((key) => {
      const display = displayAgg.get(key) || blankAgg(key);
      const current = currentAgg.get(key) || blankAgg(key);
      const previous = previousAgg.get(key) || blankAgg(key);
      const delta = current.amount - previous.amount;
      return {
        key,
        name: display.name || current.name || previous.name || key,
        gmv: display.amount,
        quantity: display.quantity,
        currentAmount: current.amount,
        previousAmount: previous.amount,
        delta,
        growthRate: calcGrowth(current.amount, previous.amount).rate,
        contribution: totalDelta ? delta / Math.abs(totalDelta) : 0,
        share: totalDisplayAmount ? display.amount / totalDisplayAmount : 0,
      };
    });

    const byDisplayGmv = [...all].sort((a, b) => b.gmv - a.gmv);
    return {
      all,
      byDisplayGmv,
      byDelta: [...all].sort((a, b) => b.delta - a.delta),
      byGrowth: [...all].sort((a, b) => safeRate(b.growthRate) - safeRate(a.growthRate)),
      top3Share: sum(byDisplayGmv.slice(0, 3).map((item) => item.gmv)) / Math.max(totalDisplayAmount, 1),
      totalDisplayAmount,
    };
  }

  function buildProductCategoryMap(records) {
    const map = new Map();
    records.forEach((record) => {
      if (!record.productKey || !record.category) return;
      if (!map.has(record.productKey)) map.set(record.productKey, new Map());
      const categoryMap = map.get(record.productKey);
      categoryMap.set(record.category, (categoryMap.get(record.category) || 0) + (record.amount || 0));
    });
    const output = new Map();
    map.forEach((categoryMap, key) => {
      const top = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1])[0];
      if (top) output.set(key, top[0]);
    });
    return output;
  }

  function buildProductStats({ displayRecords, currentRecords, previousRecords }) {
    const displayAgg = aggregateEntity(
      displayRecords,
      (record) => record.productKey,
      (record) => record.product,
      (record) => record.sku,
    );
    const currentAgg = aggregateEntity(
      currentRecords,
      (record) => record.productKey,
      (record) => record.product,
      (record) => record.sku,
    );
    const previousAgg = aggregateEntity(
      previousRecords,
      (record) => record.productKey,
      (record) => record.product,
      (record) => record.sku,
    );
    const allKeys = new Set([...displayAgg.keys(), ...currentAgg.keys(), ...previousAgg.keys()]);
    const totalDisplayAmount = sum(Array.from(displayAgg.values()).map((item) => item.amount));
    const productCategoryMap = buildProductCategoryMap([...displayRecords, ...currentRecords, ...previousRecords]);
    const gmvValues = Array.from(displayAgg.values()).map((item) => item.amount).filter((value) => value > 0);
    const qtyValues = Array.from(displayAgg.values()).map((item) => item.quantity).filter((value) => value > 0);
    const thresholds = {
      highGmv: quantile(gmvValues, 0.75),
      medianGmv: quantile(gmvValues, 0.5),
      lowGmv: quantile(gmvValues, 0.25),
      highQty: quantile(qtyValues, 0.75),
      lowQty: quantile(qtyValues, 0.25),
    };

    const all = Array.from(allKeys).map((key) => {
      const display = displayAgg.get(key) || blankAgg(key);
      const current = currentAgg.get(key) || blankAgg(key);
      const previous = previousAgg.get(key) || blankAgg(key);
      const delta = current.amount - previous.amount;
      const growthRate = calcGrowth(current.amount, previous.amount).rate;
      const item = {
        key,
        name: display.name || current.name || previous.name || key,
        sku: display.sku || current.sku || previous.sku || "",
        productCategory: productCategoryMap.get(key) || "未识别类目",
        gmv: display.amount,
        quantity: display.quantity,
        currentAmount: current.amount,
        previousAmount: previous.amount,
        delta,
        growthRate,
        share: totalDisplayAmount ? display.amount / totalDisplayAmount : 0,
      };
      item.category = classifyProduct(item, thresholds);
      return item;
    });

    const byDisplayGmv = [...all].sort((a, b) => b.gmv - a.gmv);
    const categoryCounts = all.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});

    return {
      all,
      byDisplayGmv,
      byDelta: [...all].sort((a, b) => b.delta - a.delta),
      byGrowth: [...all].sort((a, b) => safeRate(b.growthRate) - safeRate(a.growthRate)),
      top5Share: sum(byDisplayGmv.slice(0, 5).map((item) => item.gmv)) / Math.max(totalDisplayAmount, 1),
      categoryCounts,
      totalDisplayAmount,
    };
  }

  function classifyProduct(item, thresholds) {
    const hasDisplay = item.gmv > 0 || item.quantity > 0;
    if (!hasDisplay) return "普通经营品";
    if (item.gmv >= thresholds.highGmv && item.quantity >= thresholds.highQty) return "核心爆品";
    if (
      item.delta > 0 &&
      ((Number.isFinite(item.growthRate) && item.growthRate >= 0.2) ||
        item.previousAmount <= 0 ||
        item.currentAmount >= thresholds.medianGmv)
    ) {
      return "增长潜力品";
    }
    if (
      item.delta < 0 &&
      ((Number.isFinite(item.growthRate) && item.growthRate <= -0.2) ||
        item.previousAmount >= thresholds.highGmv ||
        Math.abs(item.delta) >= thresholds.medianGmv)
    ) {
      return "下滑风险品";
    }
    if (item.gmv <= thresholds.lowGmv && item.quantity <= thresholds.lowQty) return "长尾低效品";
    return "普通经营品";
  }

  function buildAnomalies(daily, channelStats, productStats) {
    const values = daily.map((item) => item.amount).filter((value) => Number.isFinite(value));
    if (!values.length) {
      return {
        daily,
        highDays: [],
        lowDays: [],
        rolling: [],
        thresholds: null,
        channelStats,
        productStats,
      };
    }

    const q1 = quantile(values, 0.25);
    const q3 = quantile(values, 0.75);
    const iqr = q3 - q1;
    const highThreshold = q3 + 1.5 * iqr;
    const lowThreshold = Math.max(0, q1 - 1.5 * iqr);
    let highDays = daily.filter((item) => item.amount > highThreshold);
    let lowDays = daily.filter((item) => item.amount < lowThreshold);

    if (!highDays.length) highDays = [...daily].sort((a, b) => b.amount - a.amount).slice(0, Math.min(2, daily.length));
    if (!lowDays.length) lowDays = [...daily].sort((a, b) => a.amount - b.amount).slice(0, Math.min(2, daily.length));

    const rolling = daily.map((item, index) => {
      const history = daily.slice(Math.max(0, index - 7), index);
      const avg7 = history.length >= 7 ? sum(history.map((day) => day.amount)) / history.length : NaN;
      const diff = Number.isFinite(avg7) ? item.amount - avg7 : NaN;
      return {
        ...item,
        avg7,
        diff,
        diffRate: Number.isFinite(avg7) && avg7 !== 0 ? diff / avg7 : NaN,
      };
    });

    return {
      daily,
      highDays: highDays.sort((a, b) => b.amount - a.amount),
      lowDays: lowDays.sort((a, b) => a.amount - b.amount),
      rolling,
      thresholds: {
        high: highThreshold,
        low: lowThreshold,
      },
      channelStats,
      productStats,
    };
  }

  function aggregateDaily(records) {
    const map = new Map();
    records.forEach((record) => {
      if (!map.has(record.dateKey)) {
        map.set(record.dateKey, {
          date: record.dateKey,
          amount: 0,
          quantity: 0,
          records: 0,
          orderIds: new Set(),
          missingOrderRows: 0,
        });
      }
      const item = map.get(record.dateKey);
      item.amount += record.amount;
      item.quantity += record.quantity;
      item.records += 1;
      if (record.orderId) item.orderIds.add(record.orderId);
      else item.missingOrderRows += record.orderCount || 1;
    });
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        ...item,
        orderCount: item.orderIds.size + item.missingOrderRows,
      }));
  }

  function aggregateByMonth(records) {
    const map = new Map();
    records.forEach((record) => {
      if (!map.has(record.monthKey)) {
        map.set(record.monthKey, {
          month: record.monthKey,
          amount: 0,
          quantity: 0,
          records: 0,
        });
      }
      const item = map.get(record.monthKey);
      item.amount += record.amount;
      item.quantity += record.quantity;
      item.records += 1;
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }

  function aggregateEntity(records, keyGetter, nameGetter, skuGetter = () => "") {
    const map = new Map();
    records.forEach((record) => {
      const key = keyGetter(record) || "未识别";
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: nameGetter(record) || key,
          sku: skuGetter(record) || "",
          amount: 0,
          quantity: 0,
          records: 0,
          orderIds: new Set(),
          missingOrderRows: 0,
        });
      }
      const item = map.get(key);
      item.amount += record.amount;
      item.quantity += record.quantity;
      item.records += 1;
      if (record.orderId) item.orderIds.add(record.orderId);
      else item.missingOrderRows += record.orderCount || 1;
    });
    return map;
  }

  function calcTotals(records) {
    const amount = sum(records.map((record) => record.amount));
    const quantity = sum(records.map((record) => record.quantity));
    const dateCount = new Set(records.map((record) => record.dateKey)).size;
    const orderIds = new Set(records.map((record) => record.orderId).filter(Boolean));
    const missingOrderRows = sum(records.filter((record) => !record.orderId).map((record) => record.orderCount || 1));
    const orderCount = orderIds.size + missingOrderRows;
    const hasOrderId = orderIds.size > 0;

    return {
      amount,
      quantity,
      dateCount,
      orderCount,
      avgPrice: quantity ? amount / quantity : 0,
      dailyAvg: dateCount ? amount / dateCount : 0,
      orderMode: hasOrderId ? "识别到单号：按单号去重，缺失单号按行计" : "未识别单号：按明细行计",
    };
  }

  function renderHorizontalMoneyBar(chartId, rows, seriesName, valueKey, clickHandler) {
    renderHorizontalBar(chartId, rows, seriesName, valueKey, {
      formatter: formatMoney,
      axisFormatter: compactAxis,
      color: COLORS.primary,
      clickHandler,
    });
  }

  function renderHorizontalNumberBar(chartId, rows, seriesName, valueKey, clickHandler) {
    renderHorizontalBar(chartId, rows, seriesName, valueKey, {
      formatter: formatInteger,
      axisFormatter: compactAxis,
      color: COLORS.primary,
      clickHandler,
    });
  }

  function renderHorizontalDeltaBar(chartId, rows, seriesName, valueKey, clickHandler) {
    if (!rows.length) {
      setChart(chartId, emptyChartOption("当前筛选下暂无可比数据"));
      return;
    }

    setChart(
      chartId,
      {
        ...baseChartOption(),
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params) => {
            const item = rows[params[0].dataIndex];
            return `${escapeHtml(item.name)}<br/>${seriesName}：${formatSignedMoney(item[valueKey])}<br/>环比：${formatGrowth(item.growthRate)}`;
          },
        },
        grid: chartGrid(120),
        xAxis: {
          type: "value",
          axisLabel: { color: COLORS.muted, formatter: compactAxis },
          splitLine: { lineStyle: { color: COLORS.grid } },
        },
        yAxis: categoryAxis(rows.map((item) => item.name)),
        series: [
          {
            name: seriesName,
            type: "bar",
            data: rows.map((item) => ({
              value: round2(item[valueKey]),
              itemStyle: { color: item[valueKey] >= 0 ? COLORS.positive : COLORS.negative },
            })),
            label: {
              show: true,
              position: "right",
              formatter: (params) => formatSignedMoney(params.value),
              color: COLORS.text,
            },
          },
        ],
      },
      (params) => clickHandler(params.name),
    );
  }

  function renderHorizontalBar(chartId, rows, seriesName, valueKey, options) {
    if (!rows.length) {
      setChart(chartId, emptyChartOption("当前筛选下暂无数据"));
      return;
    }

    setChart(
      chartId,
      {
        ...baseChartOption(),
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params) => {
            const item = rows[params[0].dataIndex];
            return `${escapeHtml(item.name)}<br/>${seriesName}：${options.formatter(item[valueKey])}`;
          },
        },
        grid: chartGrid(120),
        xAxis: {
          type: "value",
          axisLabel: { color: COLORS.muted, formatter: options.axisFormatter },
          splitLine: { lineStyle: { color: COLORS.grid } },
        },
        yAxis: categoryAxis(rows.map((item) => item.name)),
        series: [
          {
            name: seriesName,
            type: "bar",
            barMaxWidth: 20,
            data: rows.map((item) => round2(item[valueKey])),
            itemStyle: { color: options.color },
            label: {
              show: true,
              position: "right",
              formatter: (params) => options.formatter(params.value),
              color: COLORS.text,
            },
          },
        ],
      },
      (params) => options.clickHandler(params.name),
    );
  }

  function setChart(id, option, clickHandler) {
    if (!window.echarts) return;
    const el = document.getElementById(id);
    if (!el) return;
    if (!state.chartInstances[id]) {
      state.chartInstances[id] = echarts.init(el, null, { renderer: "canvas" });
    }
    const chart = state.chartInstances[id];
    chart.off("click");
    if (clickHandler) chart.on("click", clickHandler);
    chart.setOption(option, true);
  }

  function resizeCharts() {
    Object.values(state.chartInstances).forEach((chart) => chart.resize());
  }

  function baseChartOption() {
    return {
      animationDuration: 450,
      textStyle: {
        fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
        color: COLORS.text,
      },
    };
  }

  function emptyChartOption(message) {
    return {
      ...baseChartOption(),
      graphic: {
        type: "text",
        left: "center",
        top: "middle",
        style: {
          text: message,
          fill: COLORS.muted,
          fontSize: 14,
        },
      },
      xAxis: { show: false },
      yAxis: { show: false },
      series: [],
    };
  }

  function chartGrid(left = 64) {
    return {
      top: 36,
      right: 42,
      bottom: 38,
      left,
      containLabel: true,
    };
  }

  function moneyAxis() {
    return {
      type: "value",
      axisLabel: { color: COLORS.muted, formatter: compactAxis },
      splitLine: { lineStyle: { color: COLORS.grid } },
    };
  }

  function percentAxis() {
    return {
      type: "value",
      axisLabel: { color: COLORS.muted, formatter: (value) => `${value}%` },
      splitLine: { lineStyle: { color: COLORS.grid } },
    };
  }

  function categoryAxis(names) {
    return {
      type: "category",
      data: names,
      axisLabel: {
        color: COLORS.muted,
        formatter: (value) => truncate(value, 12),
      },
      inverse: false,
      axisTick: { show: false },
    };
  }

  function moneyTooltip(seriesName) {
    return {
      trigger: "axis",
      formatter: (params) => `${params[0].axisValue}<br/>${seriesName}：${formatMoney(params[0].value)}`,
    };
  }

  function linkDateFilter(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    els.startDateFilter.value = dateKey;
    els.endDateFilter.value = dateKey;
    state.compareManuallyChanged = false;
    syncCompareDates(true);
    renderDashboard();
  }

  function linkChannelFilter(channel) {
    if (!channel) return;
    if (!setMultiSelectOnly(els.channelFilter, channel)) return;
    renderDashboard();
  }

  function linkCategoryFilter(category) {
    if (!category) return;
    if (!setMultiSelectOnly(els.categoryFilter, category)) return;
    renderDashboard();
  }

  function linkProductFilter(productName) {
    if (!productName) return;
    els.productSearch.value = productName;
    renderDashboard();
  }

  function exportFilteredRecords() {
    if (!state.filteredRecords.length) return;
    const rows = state.filteredRecords.map((record) => ({
      日期: record.dateKey,
      月份: record.monthKey,
      渠道: record.channel,
      店铺: state.storeFilterUsesChannel ? record.channel : record.store || "",
      产品大类: record.category,
      商品: record.product,
      商品编码: record.sku,
      数量: record.quantity,
      GMV: record.amount,
      订单或发货单号: record.orderId,
      品牌: record.brand,
      地区: record.region,
      来源文件: record.fileName,
      原始行号: record.rowNumber,
      访客: record.visitors || "",
      转化率: record.conversionRate || "",
      推广花费: record.promotionSpend || "",
      曝光: record.impressions || "",
      点击: record.clicks || "",
    }));
    const csv = window.Papa ? Papa.unparse(rows) : toCsv(rows);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `渠道日出货明细_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function showFieldStatus(reports) {
    els.fieldStatus.classList.remove("hidden");
    if (reports.some((report) => report.dependencyError)) {
      els.fieldStatus.innerHTML = `
        <div class="field-report">
          <strong>依赖未加载</strong>
          <span class="warning-text">ECharts 未成功加载。请确认 echarts.min.js 与 index.html 位于同一目录。</span>
        </div>
      `;
      return;
    }

    els.fieldStatus.innerHTML = reports
      .map((report) => {
        const mappings = Object.entries(report.fields)
          .filter(([, value]) => value)
          .map(([key, value]) => `${FIELD_LABELS[key]}=${value}`)
          .join("；");
        const missing = report.missing.map((field) => FIELD_LABELS[field]).join("、");
        return `
          <div class="field-report">
            <strong>${escapeHtml(report.fileName)}</strong>
            <span>识别记录 ${formatInteger(report.records.length)} 行，跳过无效日期行 ${formatInteger(report.invalidRows)} 行。</span>
            <span>${mappings ? `字段映射：${escapeHtml(mappings)}` : "未识别到有效字段。"}</span>
            ${
              missing
                ? `<span class="warning-text">缺少关键字段：${escapeHtml(missing)}。相关指标会受影响，请检查 CSV 表头。</span>`
                : `<span class="ok-text">关键字段已识别。</span>`
            }
          </div>
        `;
      })
      .join("");
  }

  function showToastLikeStatus(message, isError = false) {
    els.dataHealthText.textContent = message;
    els.statusDot.classList.toggle("ready", !isError && state.allRecords.length > 0);
  }

  function updateHealthText(context) {
    els.dataHealthText.textContent = `已加载 ${formatInteger(state.allRecords.length)} 行，当前筛选 ${formatInteger(context.filteredRecords.length)} 行`;
    els.statusDot.classList.add("ready");
  }

  function renderList(element, items) {
    element.innerHTML = items.length ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : "<li>当前筛选下暂无可输出洞察。</li>";
  }

  function setText(id, value) {
    if (els[id]) els[id].textContent = value;
  }

  function setTone(element, delta) {
    element.classList.remove("positive", "negative", "warning");
    if (delta > 0) element.classList.add("positive");
    else if (delta < 0) element.classList.add("negative");
    else element.classList.add("warning");
  }

  function firstProductByCategory(products, category) {
    const product = products
      .filter((item) => item.category === category)
      .sort((a, b) => b.gmv - a.gmv)[0];
    return product ? truncate(product.name, 22) : "";
  }

  function categoryClass(category) {
    return (
      {
        核心爆品: "hero",
        增长潜力品: "potential",
        下滑风险品: "risk",
        长尾低效品: "long-tail",
      }[category] || "normal"
    );
  }

  function toneClass(delta) {
    if (delta > 0) return "positive";
    if (delta < 0) return "negative";
    return "warning";
  }

  function calcGrowth(current, previous) {
    const delta = current - previous;
    if (!previous && current > 0) return { delta, rate: Infinity };
    if (!previous && !current) return { delta, rate: 0 };
    return { delta, rate: delta / previous };
  }

  function safeRate(rate) {
    if (rate === Infinity) return Number.MAX_SAFE_INTEGER;
    if (rate === -Infinity) return -Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(rate)) return -Number.MAX_SAFE_INTEGER;
    return rate;
  }

  function previousMonthKey(monthKey) {
    if (!monthKey) return "";
    const [year, month] = monthKey.split("-").map(Number);
    const date = new Date(year, month - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function latestMonth(records) {
    return uniqueSorted(records.map((record) => record.monthKey)).pop() || "";
  }

  function toDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function dateKeyToDate(dateKey) {
    const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return makeDate(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  function addDays(date, days) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + days);
    return next;
  }

  function diffDays(start, end) {
    const startTime = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endTime = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.round((endTime - startTime) / 86400000);
  }

  function addMonthsClamped(date, monthDelta) {
    const targetYear = date.getFullYear();
    const targetMonth = date.getMonth() + monthDelta;
    const first = new Date(targetYear, targetMonth, 1);
    const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), lastDay));
  }

  function formatRangeLabel(range) {
    if (!range) return "-";
    if (range.start === range.end) return range.start;
    return `${range.start} 至 ${range.end}`;
  }

  function parseDateValue(value, fileName = "") {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && value > 25000) {
      const excelDate = new Date(Math.round((value - 25569) * 86400 * 1000));
      return new Date(excelDate.getFullYear(), excelDate.getMonth(), excelDate.getDate());
    }

    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const text = raw.replace(/\uFEFF/g, "").replace(/[年月.]/g, "-").replace(/日/g, "").replace(/\//g, "-");

    const inferredYearMonth = inferYearMonthFromFileName(fileName);
    let match = text.match(/^(\d{1,2})$/);
    if (match) {
      const day = Number(match[1]);
      if (day >= 1 && day <= 31 && inferredYearMonth) {
        return makeDate(inferredYearMonth.year, inferredYearMonth.month, day);
      }
      return null;
    }

    match = text.match(/^(\d{2})(\d{2})(\d{2})$/);
    if (match) {
      return makeDate(2000 + Number(match[1]), Number(match[2]), Number(match[3]));
    }

    match = text.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (match) {
      return makeDate(Number(match[1]), Number(match[2]), Number(match[3]));
    }

    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
      return makeDate(Number(match[1]), Number(match[2]), Number(match[3]));
    }

    match = text.match(/^(\d{1,2})-(\d{1,2})$/);
    if (match) {
      const year = inferredYearMonth?.year || 2026;
      return makeDate(year, Number(match[1]), Number(match[2]));
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
    return null;
  }

  function inferYearMonthFromFileName(fileName) {
    const name = cleanText(fileName);
    let match = name.match(/(20\d{2})\D{0,3}(1[0-2]|0?[1-9])\s*月?/);
    if (match) {
      return { year: Number(match[1]), month: Number(match[2]) };
    }

    match = name.match(/(20\d{2})(1[0-2]|0[1-9])/);
    if (match) {
      return { year: Number(match[1]), month: Number(match[2]) };
    }

    match = name.match(/(?:^|[^\d])(1[0-2]|0?[1-9])\s*月/);
    if (match) {
      return { year: 2026, month: Number(match[1]) };
    }

    return null;
  }

  function makeDate(year, month, day) {
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function parseNumberValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    let text = String(value ?? "").trim();
    if (!text) return 0;

    const negative = /^\(.+\)$/.test(text) || text.includes("−");
    let multiplier = 1;
    if (text.includes("亿")) multiplier = 100000000;
    else if (text.includes("万")) multiplier = 10000;

    text = text
      .replace(/,/g, "")
      .replace(/，/g, "")
      .replace(/[￥¥$元件个\s]/g, "")
      .replace(/[()（）]/g, "")
      .replace(/−/g, "-")
      .replace(/[^\d.-]/g, "");

    const number = Number.parseFloat(text);
    if (!Number.isFinite(number)) return 0;
    return (negative && number > 0 ? -number : number) * multiplier;
  }

  function cleanText(value) {
    return String(value ?? "").replace(/\uFEFF/g, "").trim();
  }

  function normalizeHeader(value) {
    return cleanText(value)
      .toLowerCase()
      .replace(/[\s_\-/:：|（）()[\]{}]/g, "");
  }

  function normalizeForSearch(value) {
    return cleanText(value).toLowerCase().replace(/\s+/g, "");
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }

  function blankAgg(key) {
    return {
      key,
      name: key,
      sku: "",
      amount: 0,
      quantity: 0,
      records: 0,
      orderIds: new Set(),
      missingOrderRows: 0,
    };
  }

  function quantile(values, q) {
    const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const position = (sorted.length - 1) * q;
    const base = Math.floor(position);
    const rest = position - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  }

  function sum(values) {
    return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
  }

  function round2(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function formatMoney(value) {
    const number = Number(value) || 0;
    const sign = number < 0 ? "-" : "";
    const abs = Math.abs(number);
    if (abs >= 100000000) return `${sign}¥${trimZero(abs / 100000000)}亿`;
    if (abs >= 10000) return `${sign}¥${trimZero(abs / 10000)}万`;
    return `${sign}¥${abs.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
  }

  function formatSignedMoney(value) {
    const number = Number(value) || 0;
    if (number > 0) return `+${formatMoney(number)}`;
    if (number < 0) return `-${formatMoney(Math.abs(number))}`;
    return "¥0";
  }

  function formatInteger(value) {
    return Math.round(Number(value) || 0).toLocaleString("zh-CN");
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "-";
    return `${(number * 100).toFixed(Math.abs(number) < 0.1 ? 1 : 0)}%`;
  }

  function formatGrowth(value) {
    if (value === Infinity) return "新增";
    if (value === -Infinity) return "-100%";
    if (!Number.isFinite(value)) return "-";
    const sign = value > 0 ? "+" : "";
    return `${sign}${(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%`;
  }

  function formatMonthLabel(monthKey) {
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return "-";
    const [year, month] = monthKey.split("-");
    return `${year}年${Number(month)}月`;
  }

  function compactAxis(value) {
    const abs = Math.abs(Number(value) || 0);
    if (abs >= 100000000) return `${trimZero(value / 100000000)}亿`;
    if (abs >= 10000) return `${trimZero(value / 10000)}万`;
    return `${trimZero(value)}`;
  }

  function trimZero(value) {
    return Number(value).toLocaleString("zh-CN", {
      maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2,
    });
  }

  function truncate(value, length) {
    const text = String(value ?? "");
    return text.length > length ? `${text.slice(0, length)}...` : text;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toCsv(rows) {
    if (!rows.length) return "";
    const headers = Object.keys(rows[0]);
    return [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) => {
            const value = String(row[header] ?? "");
            return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
          })
          .join(","),
      ),
    ].join("\n");
  }

  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delay);
    };
  }
})();
