import { Button, Script, Text, Widget } from "scripting";
import { ReloadIntent } from "./app_intents";
import { api } from "./class/api";
import { getCachedBalance, saveBalanceCache } from "./services/cache";
import { getAppDisplaySettings } from "./services/settings";
import { View as Small, WidgetData } from "./widget/small";
import { View as Medium } from "./widget/medium";
import { View as Circular } from "./widget/circular";
import { View as Inline } from "./widget/inline";

(async () => {
  // 小组件“参数”可指定供应商（id / title / baseUrl / {"id":"..."}），
  // 未填或找不到时回退到当前活跃供应商。
  const cfg = api.findProvider(Widget.parameter) ?? api.active;
  if (!cfg) throw new Error("未配置供应商");
  const hasBaseUrl =
    !!cfg.baseUrl.trim() || cfg.provider === "openrouter";
  if (!cfg.token || !hasBaseUrl) {
    throw new Error(
      cfg.provider === "openrouter"
        ? "请先在面板填写 API Key"
        : "请先在面板填写中转站地址和 API Key",
    );
  }

  // 查询余额：
  // 关键防死机制：WidgetKit 后台执行时间预算极苛刻（约 3-5 秒）。
  // 境外域名（如 openrouter.ai）在小组件后台进程若遇握手延迟或网络波动，
  // 必须在 2.5 秒内超时并立即降级到本地缓存，确保小组件绝不会被 iOS 强杀呈现骨架屏。
  let data;
  let fetchedAt: Date;
  const cached = getCachedBalance(cfg.id);

  try {
    const fetchPromise = api.getBalance(cfg);
    if (cached) {
      data = await Promise.race([
        fetchPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("网络超时，已使用缓存展示")), 2500)
        ),
      ]);
    } else {
      data = await fetchPromise;
    }
    fetchedAt = new Date();
    saveBalanceCache(cfg.id, data);
  } catch (e) {
    if (!cached) throw e;
    data = cached.data;
    fetchedAt = new Date(cached.updatedAt);
  }

  const props: WidgetData = {
    ...data,
    provider: cfg.provider,
    providerId: cfg.id,
    logoVersion: cfg.logoVersion,
    updatedAt: fetchedAt,
    title: cfg.title.trim() || cfg.name.trim() || cfg.siteName || "中转余额",
  };

  // 按设置里的刷新间隔指定 WidgetKit 下次请求时间线
  const { reloadMinutes } = getAppDisplaySettings();
  const reloadPolicy = {
    policy: "after",
    date: new Date(Date.now() + reloadMinutes * 60_000),
  } as const;

  const reloadButton = (node: JSX.Element) => (
    <Button intent={ReloadIntent(undefined)} buttonStyle={"plain"}>
      {node}
    </Button>
  );

  switch (Widget.family) {
    case "accessoryCircular":
      Widget.present(reloadButton(<Circular {...props} />), reloadPolicy);
      break;
    case "accessoryInline":
    case "accessoryRectangular":
      Widget.present(reloadButton(<Inline {...props} />), reloadPolicy);
      break;
    case "systemSmall":
      Widget.present(reloadButton(<Small {...props} />), reloadPolicy);
      break;
    case "systemMedium":
    case "systemLarge":
    case "systemExtraLarge":
      Widget.present(reloadButton(<Medium {...props} />), reloadPolicy);
      break;
    default:
      throw new Error("未适配的 Widget 尺寸");
  }
  Script.exit();
})().catch((e) => {
  const { reloadMinutes } = getAppDisplaySettings();
  const reloadPolicy = {
    policy: "after",
    date: new Date(Date.now() + Math.max(5, reloadMinutes || 30) * 60_000),
  } as const;
  Widget.present(<Text>{String(e)}</Text>, reloadPolicy);
  Script.exit();
});
