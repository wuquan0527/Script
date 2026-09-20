import {
  Divider,
  HStack,
  Image,
  ProgressView,
  Spacer,
  Text,
  VStack,
} from "scripting";
import { CheckinInfo, ProviderId } from "../class/api";
import { Header } from "./comp/header";

export interface WidgetData {
  isValid: boolean;
  remaining: number | null;
  used: number | null;
  total: number | null;
  unit: string;
  /** 请求次数（New API / one-api 谱系；其他供应商为 undefined） */
  requests?: number | null;
  /** 签到状态（New API / Veloera 谱系；未部署签到功能时为 null/undefined） */
  checkin?: CheckinInfo | null;
  planName?: string;
  extra?: string;
  /** 供应商预设，用于 Logo 的 fallback */
  provider?: ProviderId;
  /** 供应商 id，用于按供应商查找 favicon */
  providerId: string;
  /** 自定义 logo 版本号 */
  logoVersion: number;
  /** 最近一次成功拉取余额的时间 */
  updatedAt: Date;
  /** 小组件标题（用户自定义，为空则用自动识别的站点名） */
  title: string;
}

/** 常见货币单位 → 符号；未知单位返回 null（保留原单位后缀展示） */
export function currencySymbol(unit: string): string | null {
  const u = (unit || "").trim().toUpperCase();
  switch (u) {
    case "CNY":
    case "RMB":
    case "CN¥":
    case "¥":
      return "¥";
    case "USD":
    case "$":
      return "$";
    case "EUR":
    case "€":
      return "€";
    case "GBP":
    case "£":
      return "£";
    default:
      return null;
  }
}

export function formatUpdateTime(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${m}/${day} ${h}:${min}`;
}

export function formatAmount(value: number | null, unit: string): string {
  if (value == null) return "--";
  const symbol = currencySymbol(unit);
  return symbol
    ? `${symbol} ${value.toFixed(2)}`
    : `${value.toFixed(2)} ${unit}`;
}

/** 紧凑金额（圆形 / 内联小组件用）：金额越大保留位数越少 */
export function formatAmountCompact(
  value: number | null,
  unit: string,
): string {
  if (value == null) return "--";
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 0 : abs >= 100 ? 1 : 2;
  const text = value.toFixed(digits);
  const symbol = currencySymbol(unit);
  return symbol ? `${symbol}${text}` : `${text}${unit}`;
}

export function formatRemaining(d: WidgetData): string {
  if (d.remaining != null) return formatAmount(d.remaining, d.unit);
  if (d.extra && (d.extra.includes("无限制") || d.extra.includes("无限额度"))) {
    return "∞";
  }
  // 无剩余也无已用/总额度 → 视为无限额度
  if (d.used == null && d.total == null) return "∞";
  return "--";
}

/** 无 toLocaleString 依赖的千分位分组 */
function groupDigits(n: number): string {
  const s = String(Math.abs(Math.round(n)));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ",";
    out += s.charAt(i);
  }
  return (n < 0 ? "-" : "") + out;
}

/** 请求次数：超万自动折算，避免小组件溢出 */
export function formatRequests(value?: number | null): string {
  if (value == null) return "--";
  const n = Math.max(0, Math.round(value));
  if (n >= 100000000) return `${(n / 100000000).toFixed(2)}亿`;
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`;
  return groupDigits(n);
}

/**
 * 已用占比（进度条 + 三色预警）：
 * 优先接口返回的总额；New API / one-api 只给「余额 + 已用」，
 * 此时以 已用 + 余额 推导总充值额度（接口语义：quota=剩余，used_quota=已用）。
 */
export interface RatioInput {
  used?: number | null;
  remaining?: number | null;
  total?: number | null;
}

export function usedRatio(d: RatioInput): number | null {
  const used = d.used ?? null;
  let total = d.total ?? null;
  if (total == null && used != null && d.remaining != null && d.remaining >= 0) {
    total = used + d.remaining;
  }
  if (used == null || total == null || !(total > 0)) return null;
  return Math.max(0, Math.min(1, used / total));
}

/** 三档预警色：已用 ≥85% 红、≥60% 橙、其余绿 */
export function ratioColor(ratio: number | null): string {
  if (ratio == null) return "secondaryLabel";
  if (ratio >= 0.85) return "systemRed";
  if (ratio >= 0.6) return "systemOrange";
  return "systemGreen";
}

/** 已用占比进度条（沿用 AI Usage 的三色预警观感） */
export function UsageProgress({ ratio }: { ratio: number | null }) {
  if (ratio == null) return null;
  return (
    <ProgressView
      value={ratio * 100}
      total={100}
      progressViewStyle={"linear"}
      tint={ratioColor(ratio)}
      scaleEffect={{ x: 1, y: 1.4 }}
      frame={{ maxWidth: "infinity" }}
    />
  );
}

/** 今日签到文案：未部署签到功能时返回 null（界面隐藏该项） */
export function checkinLabel(checkin?: CheckinInfo | null): string | null {
  if (!checkin || !checkin.enabled) return null;
  return checkin.checkedToday ? "今日已签到" : "今日未签到";
}

/** 签到徽标：已签到=绿色实心印章，未签到=橙色空印章 */
export function CheckinBadge({
  checkin,
  compact = false,
}: {
  checkin?: CheckinInfo | null;
  compact?: boolean;
}) {
  const label = checkinLabel(checkin);
  if (label == null) return null;
  const ok = checkin!.checkedToday;
  const color = ok ? "systemGreen" : "systemOrange";
  return (
    <HStack spacing={3} alignment={"center"}>
      <Image
        systemName={ok ? "checkmark.seal.fill" : "seal"}
        accessibilityHidden={true}
        foregroundStyle={color}
        resizable={true}
        scaleToFit={true}
        frame={{ width: 10, height: 10 }}
      />
      <Text
        font={"caption2"}
        foregroundStyle={color}
        lineLimit={1}
        minScaleFactor={0.7}>
        {compact ? (ok ? "已签到" : "未签到") : label}
      </Text>
    </HStack>
  );
}

export function View(props: WidgetData) {
  const { isValid, unit } = props;
  const ratio = usedRatio(props);
  return (
    <VStack padding={true} alignment={"leading"} spacing={0}>
      <Header
        provider={props.provider}
        providerId={props.providerId}
        logoVersion={props.logoVersion}
        status={isValid ? "ok" : "error"}
        title={props.title}
      />
      <Divider />
      <Text
        font={"caption"}
        foregroundStyle={"secondaryLabel"}
        padding={{ top: 5, bottom: 1 }}>
        {"余额"}
      </Text>
      <Text
        font={"largeTitle"}
        fontWeight={"bold"}
        monospacedDigit={true}
        lineLimit={1}
        minScaleFactor={0.6}>
        {formatRemaining(props)}
      </Text>
      {ratio != null ? (
        <VStack frame={{ maxWidth: "infinity" }} padding={{ top: 4 }}>
          <UsageProgress ratio={ratio} />
        </VStack>
      ) : null}
      <Spacer minLength={3} />
      <HStack spacing={4} frame={{ maxWidth: "infinity" }}>
        <Text
          font={"caption2"}
          foregroundStyle={props.used != null && props.used > 0 ? "systemRed" : "secondaryLabel"}
          monospacedDigit={true}
          lineLimit={1}
          minScaleFactor={0.7}>
          {`已用 ${formatAmount(props.used, unit)}`}
        </Text>
        <Spacer />
        <Text
          font={"caption2"}
          foregroundStyle={"secondaryLabel"}
          monospacedDigit={true}
          lineLimit={1}
          minScaleFactor={0.7}>
          {`请求 ${formatRequests(props.requests)} 次`}
        </Text>
      </HStack>
      <HStack spacing={4} frame={{ maxWidth: "infinity" }}>
        <CheckinBadge checkin={props.checkin} />
        <Spacer />
        <Text
          font={"caption2"}
          foregroundStyle={"secondaryLabel"}
          monospacedDigit={true}
          lineLimit={1}
          minScaleFactor={0.7}>
          {`更新于 ${formatUpdateTime(props.updatedAt)}`}
        </Text>
      </HStack>
    </VStack>
  );
}
