import { fetch, Widget } from "scripting";

export type ProviderId =
  | "generic"
  | "sub2api"
  | "newapi"
  | "newapi_sub"
  | "openrouter";

export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai";

export interface ProviderMeta {
  label: string;
  path: string;
  hint: string;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  generic: {
    label: "通用",
    path: "/v1/usage",
    hint: "GET {baseUrl}/v1/usage · 解析 remaining / quota.remaining / balance",
  },
  sub2api: {
    label: "sub2api",
    path: "/v1/usage",
    hint:
      "GET {baseUrl}/v1/usage · API Key 鉴权，支持余额 / 订阅 / 配额 / 速率限制模式",
  },
  newapi: {
    label: "new-api / one-api",
    path: "/api/user/self",
    hint:
      "自动兼容：系统令牌（填用户 ID）→ /api/user/self，订阅套餐令牌→ /dashboard/billing/subscription",
  },
  newapi_sub: {
    label: "new-api subscription",
    path: "/dashboard/billing/subscription",
    hint:
      "GET {baseUrl}/dashboard/billing/subscription · 订阅套餐账单（OpenAI 兼容）；hard_limit_usd=总额度，使用量查 /dashboard/billing/usage",
  },
  openrouter: {
    label: "OpenRouter",
    path: "/api/v1/key",
    hint: "GET https://openrouter.ai/api/v1/key · 仅需 API Key，自动解析额度与用量",
  },
};

export interface BalanceResult {
  isValid: boolean;
  remaining: number | null;
  used: number | null;
  total: number | null;
  unit: string;
  /**
   * 请求次数（New API / one-api 谱系）。
   * - /api/user/self → data.request_count
   * - 旧版无该字段时回退 /api/log/self 的分页 total
   * 其他供应商不返回该字段（undefined → 界面显示 --）
   */
  requests?: number | null;
  /**
   * 签到信息（New API / Veloera 谱系）。
   * - new-api：GET /api/user/checkin → data.stats.checked_in_today
   * - Veloera：GET /api/user/check_in_status → data.can_check_in（true 表示今日未签到）
   * 未部署签到功能或接口无权限时为 null（界面隐藏该项）。
   */
  checkin?: CheckinInfo | null;
  planName?: string;
  extra?: string;
}

export interface CheckinInfo {
  /** 服务端是否启用了签到功能 */
  enabled: boolean;
  /** 今日是否已签到 */
  checkedToday: boolean;
  /** 本月签到次数（new-api 提供，可选） */
  monthCount?: number | null;
  /** 累计签到次数（可选） */
  totalCount?: number | null;
  /** 接口形态来源，便于排错 */
  source?: string;
}

/** 单个中转供应商配置 */
export interface ProviderConfig {
  id: string;
  provider: ProviderId;
  baseUrl: string;
  token: string;
  path: string;
  title: string;
  siteName: string;
  /** New API / one-api 的用户 ID（请求头 New-Api-User） */
  userId: string;
  /** 供应商自定义名字（用量列表展示名） */
  name: string;
  /** 自定义 logo 版本号：0=未设置（用默认）；>0 时读取 faviconPath(id, logoVersion) */
  logoVersion: number;
}

/** New API / one-api 谱系：500,000 额度 = 1 美元 */
const NEWAPI_QUOTA_PER_USD = 500000;

function num(v: any): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 补全 ProviderConfig 可能的缺失字段（旧版数据迁移安全） */
function normalizeProvider(p: Partial<ProviderConfig>): ProviderConfig {
  // 旧版独立「new-api subscription」类型并入 newapi：保留其订阅账单路径，
  // 统一由 parseNewApi 自动识别形态，后续仍可被 getBalance 自动回退逻辑接管。
  const migrated: Partial<ProviderConfig> = { ...p };
  if (migrated.provider === "newapi_sub") {
    migrated.provider = "newapi";
    const cur = String(migrated.path || "").trim();
    if (!cur || cur === PROVIDERS.generic.path) {
      migrated.path = PROVIDERS.newapi_sub.path;
    }
  }
  if (migrated.provider === "openrouter") {
    if (!migrated.baseUrl || !migrated.baseUrl.trim()) {
      migrated.baseUrl = OPENROUTER_DEFAULT_BASE_URL;
    }
    const cur = String(migrated.path || "").trim();
    if (!cur || cur === PROVIDERS.generic.path) {
      migrated.path = PROVIDERS.openrouter.path;
    }
    if (!migrated.name || !migrated.name.trim()) {
      migrated.name = "OpenRouter";
    }
    if (migrated.logoVersion && migrated.logoVersion > 0 && migrated.id) {
      if (!FileManager.existsSync(faviconPath(migrated.id, migrated.logoVersion))) {
        migrated.logoVersion = 0;
      }
    }
  }
  return {
    id: migrated.id ?? newId(),
    provider: migrated.provider ?? "generic",
    baseUrl: migrated.baseUrl ?? "",
    token: migrated.token ?? "",
    path: migrated.path ?? PROVIDERS.generic.path,
    title: migrated.title ?? "",
    siteName: migrated.siteName ?? "",
    userId: migrated.userId ?? "",
    name: migrated.name ?? "",
    logoVersion: typeof migrated.logoVersion === "number" ? migrated.logoVersion : 0,
  };
}

function defaultProvider(): ProviderConfig {
  return {
    id: newId(),
    provider: "generic",
    baseUrl: "",
    token: "",
    path: PROVIDERS.generic.path,
    title: "",
    siteName: "",
    userId: "",
    name: "",
    logoVersion: 0,
  };
}

/** 旧版单供应商配置的 Storage key（用于迁移） */
const LEGACY_KEY = "relay_panel_setting";
/** 旧版 favicon 文件名（用于迁移） */
const LEGACY_FAVICON =
  FileManager.appGroupDocumentsDirectory + "/ai-relay-panel-favicon.png";

/** 按供应商 id 返回 favicon 缓存路径（App Group 目录，小组件进程可读）。
 * version>0 时带版本后缀，每次更新 logo 写入新路径，避免 Image 按路径缓存旧图。 */
export function faviconPath(id: string, version = 0): string {
  return (
    FileManager.appGroupDocumentsDirectory +
    `/ai-relay-panel-favicon-${id}${version ? `-${version}` : ""}.png`
  );
}

/** 通用模板解析：remaining ?? quota.remaining ?? balance；unit ?? quota.unit ?? USD */
function parseGeneric(json: any): BalanceResult {
  const remaining = json?.remaining ?? json?.quota?.remaining ?? json?.balance;
  const unit = json?.unit ?? json?.quota?.unit ?? "USD";
  const isValid = json?.is_active ?? json?.isValid ?? true;
  return {
    isValid: !!isValid,
    remaining: num(remaining),
    used: num(json?.quota?.used),
    total: num(json?.quota?.limit),
    // 通用模板常见字段名：requests / request_count / quota.requests
    requests: num(
      json?.requests ?? json?.request_count ?? json?.quota?.requests,
    ),
    unit: String(unit),
    planName: json?.planName ? String(json.planName) : undefined,
    extra: json?.extra ? String(json.extra) : undefined,
  };
}

/**
 * sub2api 网关 GET /v1/usage 解析（对齐 cc-switch 的 extractor）：
 * 订阅 → 配额 → 速率限制 → 余额 四种模式依次判定。
 */
function parseSub2Api(json: any): BalanceResult {
  if (json.error || json.isValid === false) {
    const msg =
      json?.error?.message ?? json?.message ?? "API Key 无效或查询失败";
    throw new Error(String(msg));
  }

  const pct = (used: any, limit: any): number | null => {
    const l = num(limit);
    if (l == null || l <= 0) return null;
    const u = num(used) ?? 0;
    return Math.max(0, Math.min(100, Math.round((u / l) * 100)));
  };

  // 1. 订阅模式
  if (json.subscription) {
    const sub = json.subscription;
    const tiers: string[] = [];
    const d = pct(sub.daily_usage_usd, sub.daily_limit_usd);
    const w = pct(sub.weekly_usage_usd, sub.weekly_limit_usd);
    const m = pct(sub.monthly_usage_usd, sub.monthly_limit_usd);
    if (d !== null) tiers.push(`日 ${d}%`);
    if (w !== null) tiers.push(`周 ${w}%`);
    if (m !== null) tiers.push(`月 ${m}%`);

    const remaining = num(json.remaining);
    if (remaining != null && remaining < 0) {
      return {
        isValid: true,
        remaining: null,
        used: null,
        total: null,
        unit: json.unit || "USD",
        planName: json.planName || "订阅",
        extra: "无限制",
      };
    }
    const limit = num(
      sub.monthly_limit_usd ?? sub.weekly_limit_usd ?? sub.daily_limit_usd,
    );
    const used =
      num(
        sub.monthly_usage_usd ??
          sub.weekly_usage_usd ??
          sub.daily_usage_usd,
      ) ?? 0;
    return {
      isValid: true,
      remaining,
      used,
      total: limit ?? remaining,
      unit: json.unit || "USD",
      planName: json.planName || "订阅",
      extra: tiers.length > 0 ? tiers.join(" · ") : "无限制",
    };
  }

  // 2. 配额受限模式
  if (json.quota) {
    const q = json.quota;
    const qp = pct(q.used, q.limit);
    return {
      isValid: true,
      remaining: num(q.remaining),
      used: num(q.used),
      total: num(q.limit),
      unit: q.unit || "USD",
      planName: "API Key 配额",
      extra: qp !== null ? `${qp}%` : "",
    };
  }

  // 3. 仅速率限制
  if (json.rate_limits && json.rate_limits.length > 0) {
    const rls = json.rate_limits;
    let binding = rls[0];
    let bindingRatio = pct(binding.used, binding.limit);
    for (let i = 1; i < rls.length; i++) {
      const r = pct(rls[i].used, rls[i].limit);
      if (r !== null && (bindingRatio === null || r > bindingRatio)) {
        binding = rls[i];
        bindingRatio = r;
      }
    }
    const windows = rls
      .map((x: any) => {
        const p = pct(x.used, x.limit);
        return `${x.window} ${p !== null ? `${p}%` : "∞"}`;
      })
      .join(" · ");
    return {
      isValid: true,
      remaining: num(binding.remaining),
      used: num(binding.used),
      total: num(binding.limit),
      unit: "USD",
      planName: "速率限制",
      extra: windows,
    };
  }

  // 4. 余额模式（sub2api 不提供已用额度，设为 null 隐藏；无总额字段）
  return {
    isValid: true,
    remaining: num(json.remaining),
    used: null,
    total: null,
    unit: json.unit || "USD",
    planName: json.planName || "钱包余额",
    extra: "",
  };
}

/**
 * New API / one-api 谱系统一解析（自动兼容三种形态）：
 * 1. 订阅账单（/dashboard/billing/subscription）→ hard_limit_usd / soft_limit_usd
 * 2. 系统令牌账户（/api/user/self）→ data.quota / data.used_quota，除以 500000 得美元
 * 3. 令牌用量（/api/usage/token）→ data.total_available / data.total_used / data.total_granted
 */
function parseNewApi(json: any): BalanceResult {
  // 1. 订阅账单形态（OpenAI 兼容，/dashboard/billing/subscription）
  if (json?.hard_limit_usd != null || json?.soft_limit_usd != null || json?.system_hard_limit_usd != null) {
    return parseNewApiSubscription(json);
  }
  const ok = json?.success === true || json?.code === true;
  if (!ok) {
    throw new Error(String(json?.message || "查询失败"));
  }
  const d = json?.data ?? {};

  // /api/usage/token 形态
  if (
    d.total_available != null ||
    d.total_used != null ||
    d.unlimited_quota != null
  ) {
    const unlimited = !!d.unlimited_quota;
    const used = num(d.total_used);
    const available = num(d.total_available);
    return {
      isValid: true,
      remaining: unlimited ? null : available,
      used,
      // 总额以接口返回的 total_granted 为准，不自行计算
      total: num(d.total_granted),
      // 令牌用量接口一般不返回次数，交由 enrichNewApiExtras 兜底
      requests: num(d.request_count ?? d.total_requests),
      unit: "USD",
      planName: d.name ? `令牌 ${d.name}` : "API Key 配额",
      extra: unlimited ? "无限额度" : "",
    };
  }

  // /api/user/self 形态（账户余额）
  const quota = num(d.quota);
  const usedQuota = num(d.used_quota);
  const statusOk = d.status == null || d.status === 1;
  // group 只是分组信息，默认分组/为空时不在小组件里展示
  const group = d.group ? String(d.group).trim() : "";
  const planName =
    group && group.toLowerCase() !== "default" ? group : undefined;
  return {
    isValid: statusOk,
    remaining: quota != null ? quota / NEWAPI_QUOTA_PER_USD : null,
    used: usedQuota != null ? usedQuota / NEWAPI_QUOTA_PER_USD : null,
    // 接口未返回总额字段，不自行计算
    total: null,
    // new-api 的 /api/user/self 直接返回累计请求次数；one-api 无该字段 → null
    requests: num(d.request_count ?? d.requestCount ?? d.request_num),
    unit: "USD",
    planName,
  };
}

/**
 * new-api 订阅账单解析（OpenAI 兼容）：
 * GET /dashboard/billing/subscription → hard_limit_usd / soft_limit_usd / system_hard_limit_usd
 * 仅返回总额度信息，不包含已用（需另行查询 /dashboard/billing/usage）
 */
function parseNewApiSubscription(json: any): BalanceResult {
  const err = json?.error?.message ?? json?.error ?? json?.message;
  if (err) throw new Error(String(err));
  const hardLimit = num(json?.hard_limit_usd);
  const softLimit = num(json?.soft_limit_usd);
  const systemHard = num(json?.system_hard_limit_usd);
  const total = hardLimit ?? softLimit ?? systemHard;
  return {
    isValid: true,
    remaining: total,
    used: null,
    total,
    unit: "USD",
    planName: "订阅套餐",
    extra: json?.access_until
      ? `有效期至 ${new Date(Number(json.access_until) * 1000).toLocaleDateString()}`
      : "",
  };
}

/**
 * OpenRouter API 解析：
 * GET https://openrouter.ai/api/v1/key
 * 返回当前 API Key 的限额与用量，例如：
 * {
 *   data: {
 *     label: "...",
 *     limit: 100, // spending limit USD（null 为无限制）
 *     limit_remaining: 74.5, // 剩余 USD（null 为无限制）
 *     limit_reset: "monthly",
 *     usage: 25.5, // 累计已用 USD
 *     is_free_tier: false
 *   }
 * }
 * 同时兼容 GET /api/v1/credits 形态（data.total_credits, data.total_usage）
 */
function parseOpenRouter(json: any): BalanceResult {
  if (json?.error) {
    const msg = json.error.message ?? json.error;
    throw new Error(String(msg));
  }
  const d = json?.data;
  if (!d) {
    throw new Error("OpenRouter 接口未返回有效数据");
  }

  // 兼容 credits 接口
  if (d.total_credits != null || d.total_usage != null) {
    const total = num(d.total_credits);
    const used = num(d.total_usage);
    const remaining =
      total != null && used != null ? Math.max(0, total - used) : total;
    return {
      isValid: true,
      remaining,
      used,
      total,
      unit: "USD",
      planName: "OpenRouter",
    };
  }

  const limit = num(d.limit);
  const limitRemaining = num(d.limit_remaining);
  const usage = num(d.usage);
  const label = d.label ? String(d.label).trim() : "";
  const isFreeTier = !!d.is_free_tier;

  const extras: string[] = [];
  if (d.limit_reset) {
    const resetMap: Record<string, string> = {
      daily: "日重置",
      weekly: "周重置",
      monthly: "月重置",
    };
    extras.push(resetMap[d.limit_reset] || `${d.limit_reset} 重置`);
  }
  if (isFreeTier) {
    extras.push("免费层");
  }
  if (limit == null && limitRemaining == null) {
    extras.push("无限额度");
  }

  return {
    isValid: true,
    remaining: limitRemaining,
    used: usage,
    total: limit,
    unit: "USD",
    extra: extras.length > 0 ? extras.join(" · ") : undefined,
  };
}

/**
 * 通用 AI 中转站余额查询与管理。
 * 支持多供应商，每个供应商独立配置。选中一个作为当前活跃供应商。
 */
class API {
  private readonly KEY = "relay_panel_settings";

  providers: ProviderConfig[] = [];
  activeId = "";

  constructor() {
    this.reload();
  }

  /**
   * 从持久化存储中重新加载配置与活跃供应商
   */
  reload(): void {
    const saved = Storage.get<{
      providers?: ProviderConfig[];
      activeId?: string;
    }>(this.KEY);
    if (saved?.providers && saved.providers.length > 0) {
      this.providers = saved.providers.map(normalizeProvider);
      this.activeId = saved.activeId ?? saved.providers[0].id;
    } else {
      // 迁移旧版单供应商配置
      const legacy = Storage.get<Partial<ProviderConfig> & { provider?: ProviderId }>(LEGACY_KEY);
      if (legacy && (legacy.baseUrl || legacy.token)) {
        const cfg: ProviderConfig = normalizeProvider({
          id: newId(),
          provider: legacy.provider ?? "generic",
          baseUrl: legacy.baseUrl ?? "",
          token: legacy.token ?? "",
          path: legacy.path ?? PROVIDERS.generic.path,
          title: legacy.title ?? "",
          siteName: legacy.siteName ?? "",
          userId: legacy.userId ?? "",
          name: legacy.name ?? "",
          logoVersion:
            typeof legacy.logoVersion === "number" ? legacy.logoVersion : 0,
        });
        this.providers.push(cfg);
        this.activeId = cfg.id;
        // 迁移旧 favicon 到新 id 路径
        try {
          if (FileManager.existsSync(LEGACY_FAVICON)) {
            FileManager.copyFileSync(LEGACY_FAVICON, faviconPath(cfg.id));
          }
        } catch {}
      } else {
        this.providers.push(defaultProvider());
        this.activeId = this.providers[0].id;
      }
    }
    if (!this.providers.some((p) => p.id === this.activeId)) {
      this.activeId = this.providers[0]?.id ?? "";
    }
  }

  save(): boolean {
    const ok = Storage.set(this.KEY, {
      providers: this.providers,
      activeId: this.activeId,
    });
    try {
      Widget.reloadAll();
      Widget.reloadUserWidgets();
    } catch {}
    return ok;
  }

  get active(): ProviderConfig {
    this.reload();
    return (
      this.providers.find((p) => p.id === this.activeId) ?? this.providers[0]
    );
  }

  addProvider(cfg?: ProviderConfig): ProviderConfig {
    const c = cfg ?? defaultProvider();
    this.providers.push(c);
    this.save();
    return c;
  }

  /** 创建一个未落库的草稿配置（供新增表单编辑，确认后才 addProvider） */
  createDraft(): ProviderConfig {
    return defaultProvider();
  }

  updateProvider(id: string, patch: Partial<ProviderConfig>): void {
    const idx = this.providers.findIndex((p) => p.id === id);
    if (idx < 0) return;
    this.providers[idx] = { ...this.providers[idx], ...patch };
    this.save();
  }

  removeProvider(id: string): void {
    this.providers = this.providers.filter((p) => p.id !== id);
    if (this.activeId === id) {
      this.activeId = this.providers[0]?.id ?? "";
    }
    this.save();
  }

  setActive(id: string): void {
    if (this.providers.some((p) => p.id === id)) {
      this.activeId = id;
      this.save();
    }
  }

  /**
   * 按小组件参数查找供应商：
   * JSON {"id":"..."} → id 精确 → title 精确 → baseUrl 精确
   */
  findProvider(param: string): ProviderConfig | null {
    this.reload();
    const p = (param || "").trim();
    if (!p) return null;
    if (p.startsWith("{")) {
      try {
        const parsed = JSON.parse(p);
        if (parsed && typeof parsed.id === "string") {
          const byId = this.providers.find((x) => x.id === parsed.id);
          if (byId) return byId;
        }
      } catch {}
    }
    const lower = p.toLowerCase();
    return (
      this.providers.find((x) => x.id === p) ??
      this.providers.find((x) => (x.name || "").trim().toLowerCase() === lower) ??
      this.providers.find((x) => (x.title || "").trim().toLowerCase() === lower) ??
      this.providers.find((x) => x.provider.toLowerCase() === lower) ??
      this.providers.find((x) => (x.baseUrl || "").trim().toLowerCase() === lower) ??
      this.providers.find(
        (x) =>
          (x.baseUrl || "").trim().replace(/\/+$/, "").toLowerCase() ===
          lower.replace(/\/+$/, ""),
      ) ??
      null
    );
  }

  /**
   * 按供应商 id 查询余额（统一入口，列表与表单共用）。
   * 读取 api.providers 中该供应商的最新配置。
   */
  async getProviderBalance(id: string): Promise<BalanceResult> {
    const cfg = this.providers.find((p) => p.id === id);
    if (!cfg) throw new Error("供应商不存在");
    return this.getBalance(cfg);
  }

  async getBalance(cfg?: ProviderConfig): Promise<BalanceResult> {
    const c = cfg ?? this.active;
    const isOR = c.provider === "openrouter";
    const base = (isOR && !String(c.baseUrl || "").trim())
      ? OPENROUTER_DEFAULT_BASE_URL
      : String(c.baseUrl || "").trim().replace(/\/+$/, "");
    const rawPath = (isOR && !String(c.path || "").trim())
      ? PROVIDERS.openrouter.path
      : String(c.path || "").trim();
    const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

    const headers: Record<string, string> = {
      authorization: `Bearer ${String(c.token || "").trim()}`,
    };
    // New API / one-api 需要用户 ID 与 UA（对齐 cc-switch）
    if (c.provider === "newapi") {
      headers["content-type"] = "application/json";
      headers["user-agent"] = "cc-switch/1.0";
      const uid = String(c.userId || "").trim();
      if (uid) headers["new-api-user"] = uid;
    }

    // 订阅账单端点（OpenAI 兼容）按 token 鉴权，不发送 New-Api-User 头
    const subHeaders: Record<string, string> = { ...headers };
    delete subHeaders["new-api-user"];

    try {
      const json = await this.queryJson(base, path, headers);
      switch (c.provider) {
        case "openrouter": {
          const result = parseOpenRouter(json);
          // 若该 Key 未配置额度上限，尝试查 /api/v1/credits 获取总积分（管理 Key 支持）
          if (result.remaining == null && result.total == null) {
            try {
              const credJson = await this.queryJson(
                base,
                "/api/v1/credits",
                headers,
                8,
              );
              if (credJson?.data?.total_credits != null) {
                const totalCredits = num(credJson.data.total_credits);
                const totalUsage = num(credJson.data.total_usage);
                if (totalCredits != null) {
                  result.total = totalCredits;
                  if (totalUsage != null) {
                    result.used = totalUsage;
                    result.remaining = Math.max(0, totalCredits - totalUsage);
                  } else {
                    result.remaining = totalCredits;
                  }
                  if (result.extra) {
                    result.extra = result.extra
                      .replace(/ · 无限额度|无限额度 · |无限额度/g, "")
                      .trim() || undefined;
                  }
                }
              }
            } catch {
              // 普通 Key 无 /credits 权限，保持原样展示
            }
          }
          return result;
        }
        case "sub2api":
          return parseSub2Api(json);
        case "newapi": {
          const result = parseNewApi(json);
          // 订阅账单形态：账单接口不含已用额度，再从 usage 端点补上
          if (result.used == null && result.total != null) {
            return await this.enrichNewApiExtras(
              base,
              subHeaders,
              await this.enrichSubscriptionUsage(base, subHeaders, result),
            );
          }
          return await this.enrichNewApiExtras(base, headers, result);
        }
        case "newapi_sub":
          return parseNewApiSubscription(json);
        default:
          return parseGeneric(json);
      }
    } catch (firstErr) {
      // new-api 类型自动兼容订阅套餐：配置路径查询失败时回退到订阅账单端点
      // （订阅令牌可直接鉴权，系统令牌才需要 /api/user/self + New-Api-User）
      if (c.provider === "newapi") {
        const subPath = "/dashboard/billing/subscription";
        if (path !== subPath) {
          try {
            const subJson = await this.queryJson(base, subPath, subHeaders);
            const result = parseNewApi(subJson);
            return await this.enrichNewApiExtras(
              base,
              subHeaders,
              await this.enrichSubscriptionUsage(base, subHeaders, result),
            );
          } catch {
            // 回退也失败 → 抛出首次查询的错误（更贴合用户配置）
          }
        }
      }
      throw firstErr;
    }
  }

  /**
   * 补充订阅账单的已用额度与剩余：
   * - /dashboard/billing/usage → total_usage（单位为展示单位的 0.01，÷100 还原）
   * - 剩余 = 总额 - 已用（usage 查询失败时保留账单原始结果）
   */
  private async enrichSubscriptionUsage(
    base: string,
    headers: Record<string, string>,
    result: BalanceResult,
  ): Promise<BalanceResult> {
    try {
      const usageJson = await this.queryJson(
        base,
        "/dashboard/billing/usage",
        headers,
      );
      const totalUsage = num(usageJson?.total_usage);
      if (totalUsage != null) {
        const used = totalUsage / 100;
        result.used = used;
        if (result.total != null) {
          result.remaining = result.total - used;
        }
      }
    } catch {
      // usage 查询失败时保留账单接口结果（used=null，剩余=总额）
    }
    return result;
  }

  /**
   * 补充「请求次数」与「签到状态」（两者并发，避免拖慢小组件时间预算）。：
   * - new-api 的 /api/user/self 自带 data.request_count，无需额外请求；
   * - 旧版 one-api / 令牌用量端点不含该字段时，回退 GET /api/log/self?p=1&page_size=1
   *   取分页 total（每条调用日志 = 一次请求）；
   * - 签到状态探测 /api/user/checkin（new-api）→ /api/user/check_in_status（Veloera）。
   * 任一接口无权限或不存在时静默保持未知（界面隐藏 / 显示 --），不影响余额展示。
   */
  private async enrichNewApiExtras(
    base: string,
    headers: Record<string, string>,
    result: BalanceResult,
  ): Promise<BalanceResult> {
    const tasks: Array<Promise<void>> = [];
    if (result.requests == null) {
      tasks.push(this.fetchRequestCount(base, headers).then((v) => {
        result.requests = v ?? null;
      }));
    }
    if (result.checkin == null) {
      tasks.push(this.fetchCheckin(base, headers).then((v) => {
        result.checkin = v ?? null;
      }));
    }
    if (tasks.length > 0) await Promise.all(tasks);
    return result;
  }

  /** 请求次数兜底：/api/log/self 分页 total */
  private async fetchRequestCount(
    base: string,
    headers: Record<string, string>,
  ): Promise<number | null> {
    try {
      const json = await this.queryJson(
        base,
        "/api/log/self?p=1&page_size=1",
        headers,
        8,
      );
      const total = num(
        json?.data?.total ?? json?.total ?? json?.data?.count ?? json?.count,
      );
      return total != null && total >= 0 ? total : null;
    } catch {
      // 无权限 / 接口不存在 / 网关非 JSON → 保持未知
      return null;
    }
  }

  /** 签到状态探测：依次尝试 new-api 与 Veloera 两种形态 */
  private async fetchCheckin(
    base: string,
    headers: Record<string, string>,
  ): Promise<CheckinInfo | null> {
    // 1) new-api：/api/user/checkin?month=YYYY-MM
    try {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const json = await this.queryJson(
        base,
        `/api/user/checkin?month=${month}`,
        headers,
        6,
      );
      const stats = json?.data?.stats ?? json?.data ?? null;
      if (stats && typeof stats === "object") {
        const raw = (stats as any).checked_in_today;
        if (raw === true || raw === false) {
          return {
            enabled: true,
            checkedToday: raw,
            monthCount: num((stats as any).checkin_count),
            totalCount: num((stats as any).total_checkins),
            source: "new-api",
          };
        }
      }
      // 服务端明确回「签到功能未启用」→ 记录为未启用（界面隐藏）
      const msg = String(json?.message ?? "");
      if (json?.success === false && msg.includes("签到")) {
        return { enabled: false, checkedToday: false, source: "new-api" };
      }
    } catch {
      // 接口不存在 → 尝试下一种形态
    }

    // 2) Veloera 系：/api/user/check_in_status → data.can_check_in
    try {
      const json = await this.queryJson(
        base,
        "/api/user/check_in_status",
        headers,
        6,
      );
      const d = json?.data ?? null;
      const can = d ? (d as any).can_check_in : null;
      if (can === true || can === false) {
        return {
          enabled: true,
          checkedToday: can === false,
          source: "veloera",
        };
      }
    } catch {
      // 无签到能力 → 保持未知
    }
    return null;
  }

  /** GET 一个路径并返回解析后的 JSON（非 200 / 非 JSON 时抛错） */
  private async queryJson(
    base: string,
    path: string,
    headers: Record<string, string>,
    timeoutSeconds = 10,
  ): Promise<any> {
    const p = path.startsWith("/") ? path : `/${path}`;
    const res = await fetch(`${base}${p}`, {
      method: "GET",
      headers,
      timeout: timeoutSeconds,
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      // 网关返回非 JSON（如 502 HTML 页面）时兜底
    }
    if (!res.ok) {
      const message =
        json?.error?.message ?? json?.error ?? json?.message ?? json?.detail;
      throw new Error(
        message ? `查询失败: ${message}` : `查询失败 (${res.status})`,
      );
    }
    if (!json) {
      throw new Error("接口未返回 JSON 数据，请检查查询路径");
    }
    return json;
  }
}

export const api = new API();

/** 生成 favicon 候选地址：本站点 + 去掉最左侧子域名（api.xxx.com → xxx.com） */
function faviconCandidates(baseUrl: string): string[] {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return [];
  }
  const scheme = url.protocol;
  const out: string[] = [];
  const add = (host: string) => {
    out.push(`${scheme}//${host}/favicon.ico`);
    out.push(`${scheme}//${host}/favicon.png`);
  };
  add(url.host);
  const labels = url.host.split(".");
  if (labels.length >= 3) {
    add(labels.slice(1).join("."));
  }
  return Array.from(new Set(out));
}

/** 从单个 URL 或 data: URL 取图标并写入指定 id 的 favicon 路径（带版本号） */
async function saveIcon(url: string, id: string, version = 0): Promise<boolean> {
  try {
    let image: UIImage | null = null;
    if (url.startsWith("data:image/png;base64,")) {
      image = UIImage.fromBase64String(
        url.slice("data:image/png;base64,".length),
      );
    } else if (url.startsWith("data:image/")) {
      const comma = url.indexOf(",");
      const b64 = comma >= 0 ? url.slice(comma + 1) : "";
      image = UIImage.fromBase64String(b64);
    } else {
      image = await UIImage.fromURL(url);
    }
    if (!image || image.width <= 0) return false;
    const png = image.toPNGData();
    if (!png) return false;
    await FileManager.writeAsData(faviconPath(id, version), png);
    return true;
  } catch {
    return false;
  }
}

/** 从 HTML 提取 <link rel="icon"> 的 href，解析为绝对 URL */
function extractIconUrl(html: string, base: string): string | null {
  const linkRe = /<link[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    const isIcon =
      /rel=["'](?:shortcut\s+)?icon["']/i.test(tag) ||
      /rel=["']apple-touch-icon["']/i.test(tag);
    if (!isIcon) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag);
    if (!href?.[1]) continue;
    const raw = href[1].trim();
    if (!raw) continue;
    if (raw.startsWith("data:")) return raw;
    try {
      return new URL(raw, base + "/").toString();
    } catch {
      return raw;
    }
  }
  return null;
}

/**
 * 下载中转站 favicon 并转存为 PNG 到对应 id 的版本化路径。
 * 1. 解析首页 HTML <link rel="icon">（支持 data: URL / 相对路径）
 * 2. 标准路径 favicon.ico / favicon.png（本站点、去子域名后根域）
 * @param version 版本号，每次写入新文件避免 Image 缓存旧图
 */
export async function downloadFavicon(
  baseUrl: string,
  id: string,
  version = 0,
): Promise<boolean> {
  const trimmed = baseUrl.trim();
  if (!trimmed) return false;
  const base = trimmed.replace(/\/+$/, "");

  // 1. 解析首页 HTML 的 <link rel="icon">
  try {
    const res = await fetch(`${base}/`, { method: "GET", timeout: 10 });
    if (res.ok) {
      const html = await res.text();
      const iconUrl = extractIconUrl(html, base);
      if (iconUrl && (await saveIcon(iconUrl, id, version))) return true;
    }
  } catch {
    // 忽略，继续标准路径兜底
  }

  // 2. 标准路径兜底
  for (const url of faviconCandidates(trimmed)) {
    if (await saveIcon(url, id, version)) return true;
  }
  return false;
}

/** 清理站点名：去 HTML 标签、折叠空白、截断 */
function cleanName(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** 从 HTML 中提取 <title> 或 og:site_name */
function extractHtmlTitle(html: string): string | null {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title?.[1]) {
    const c = cleanName(title[1]);
    if (c) return c.slice(0, 40);
  }
  const og = /<meta[^>]+property=["']og:site_name["'][^>]*>/i.exec(html);
  const content = og ? /content=["']([^"']*)["']/i.exec(og[0]) : null;
  if (content?.[1]) {
    const c = cleanName(content[1]);
    if (c) return c.slice(0, 40);
  }
  return null;
}

/**
 * 通过接口识别中转站名称：
 * - New API / one-api：GET {baseUrl}/api/status → data.system_name（公开接口）
 * - 其他/兜底：GET {baseUrl}/ → 解析首页 <title> / og:site_name
 */
export async function detectSiteName(
  baseUrl: string,
  provider: ProviderId,
): Promise<string | null> {
  if (provider === "openrouter") {
    return "OpenRouter";
  }
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) return null;

  const candidates: string[] = [];
  if (provider === "newapi") {
    candidates.push(`${base}/api/status`);
  }
  candidates.push(`${base}/`);

  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: "GET", timeout: 8 });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || !text.trim()) continue;

      if (url.endsWith("/api/status")) {
        try {
          const json = JSON.parse(text);
          const name = json?.data?.system_name ?? json?.system_name;
          if (name) {
            const c = cleanName(String(name));
            if (c) return c.slice(0, 40);
          }
        } catch {
          // 非 JSON，继续按 HTML 解析
        }
      }

      const title = extractHtmlTitle(text);
      if (title) return title;
    } catch {
      // 继续下一个候选
    }
  }
  return null;
}