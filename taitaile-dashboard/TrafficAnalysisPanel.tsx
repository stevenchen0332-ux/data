/**
 * 流量转化数据汇总表 — 类型契约与全局挂载点（生产运行时在 ttl-traffic-panel.js）。
 * 接入真实表后：在 data-bundle 生成脚本或入口 HTML 前设置 window.TTL_TRAFFIC_CONVERSION_SUMMARY。
 */

export interface TtlTrafficConversionMeta {
  /** 如「流量转化数据汇总表_202605.csv」 */
  source: string;
}

export interface TtlTrafficDailyRow {
  date: string;
  gmv?: number;
  netGmv?: number;
  uv?: number;
  /** 0~1 */
  cvr?: number;
  aov?: number;
  promotionFee?: number;
  shipmentQty?: number;
  /** 0~1 */
  refundRate?: number;
}

/** 按日预聚合；筛选（渠道/店铺）可在适配层先裁剪再注入 */
export interface TtlTrafficConversionSummary {
  meta?: TtlTrafficConversionMeta;
  dailyRows?: TtlTrafficDailyRow[];
}

/** 演示/缺口占位：退款率、推广归因 GMV 占比等主数据包未覆盖字段 */
export interface TtlTrafficConversionStub {
  /** 0~1，默认 0 */
  refundRate?: number;
  /** 0~1，推广带来的 GMV / 总 GMV；未设置时 UI 显示「—」 */
  promotedGmvShare?: number;
}

declare global {
  interface Window {
    TTL_TRAFFIC_CONVERSION_SUMMARY?: TtlTrafficConversionSummary;
    TTL_TRAFFIC_CONVERSION_STUB?: TtlTrafficConversionStub;
  }
}

export {};
