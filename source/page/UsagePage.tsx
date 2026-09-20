import {
  Button,
  Group,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  ProgressView,
  Script,
  Spacer,
  Text,
  VStack,
  useEffect,
  useObservable,
} from "scripting";
import { api, BalanceResult, ProviderConfig } from "../class/api";
import { getCachedBalance, saveBalanceCache } from "../services/cache";
import { Logo } from "../widget/comp/header";
import {
  formatAmount,
  formatRequests,
  formatUpdateTime,
  ratioColor,
  usedRatio,
} from "../widget/small";
import { ProviderFormPage } from "./ProviderFormPage";
import { SettingsPage } from "./SettingsPage";

interface CardState {
  loading: boolean;
  data: BalanceResult | null;
  error: string;
  updatedAt: Date | null;
}

export function UsagePage() {
  const isHomeScreen = Script.env === "home_screen";
  const dismiss = (() => {
    try {
      return Navigation.useDismiss();
    } catch {
      return () => {};
    }
  })();
  const providers = useObservable(api.providers);
  const activeId = useObservable(api.activeId);
  const refreshTick = useObservable(0);
  type Destination =
    | { kind: "editor"; initial: ProviderConfig; isNew: boolean; nonce: number }
    | { kind: "settings" }
    | null;
  const destination = useObservable<Destination>(null);

  const addProvider = () => {
    // 先创建草稿，用户点“完成”才真正落库
    const draft = api.createDraft();
    destination.setValue({
      kind: "editor",
      initial: draft,
      isNew: true,
      nonce: Date.now(),
    });
  };

  const openEditor = (id: string) => {
    const cfg = api.providers.find((p) => p.id === id);
    if (!cfg) return;
    destination.setValue({
      kind: "editor",
      initial: cfg,
      isNew: false,
      nonce: Date.now(),
    });
  };

  const openSettings = () => {
    destination.setValue({ kind: "settings" });
  };

  /** 保存：新增或更新供应商（新增不自动设为默认） */
  const saveProvider = (cfg: ProviderConfig, isNew: boolean) => {
    if (isNew) {
      api.addProvider(cfg);
    } else {
      api.updateProvider(cfg.id, cfg);
    }
    activeId.setValue(api.activeId);
    refreshProviders();
  };

  /** 删除供应商 */
  const deleteProviderById = (id: string) => {
    api.removeProvider(id);
    refreshProviders();
  };

  const refreshAll = () => {
    refreshTick.setValue(refreshTick.value + 1);
  };

  const refreshProviders = () => {
    providers.setValue([...api.providers]);
  };

  const setDefault = (id: string) => {
    api.setActive(id);
    activeId.setValue(id);
    refreshProviders();
  };

  /** 长按菜单里的删除（含二次确认） */
  const deleteProvider = async (id: string) => {
    const cfg = api.providers.find((p) => p.id === id);
    const name =
      cfg?.name.trim() || cfg?.title.trim() || cfg?.baseUrl.trim() || "该供应商";
    const ok = await Dialog.actionSheet({
      title: "删除供应商",
      message: `确定要删除「${name}」吗？删除后不可恢复。`,
      cancelButton: true,
      actions: [{ label: "删除", destructive: true }],
    });
    if (ok == null) return; // 取消
    api.removeProvider(id);
    refreshProviders();
  };

  return (
    <NavigationStack>
      <List
        navigationTitle={"用量"}
        navigationBarTitleDisplayMode={"inline"}
        listRowSpacing={12}
        listRowSeparator="hidden"
        toolbar={{
          cancellationAction: isHomeScreen
            ? [
                <Button
                  title="设置"
                  systemImage="gearshape.fill"
                  action={openSettings}
                />,
              ]
            : [
                <Button
                  title={"关闭"}
                  systemImage={"xmark"}
                  action={dismiss}
                />,
              ],
          topBarTrailing: [
            <Button
              title="刷新"
              systemImage="arrow.clockwise"
              action={refreshAll}
            />,
            <Button title="添加" systemImage="plus" action={addProvider} />,
          ],
        }}
        navigationDestination={{
          isPresented: destination.value != null,
          onChanged: (v) => {
            if (!v) {
              destination.setValue(null);
              // 返回列表后用最新配置重新拉取所有卡片
              refreshProviders();
              refreshAll();
            }
          },
          content:
            destination.value?.kind === "editor" ? (
              <ProviderFormPage
                key={`${destination.value.initial.id}-${destination.value.nonce}`}
                initial={destination.value.initial}
                isNew={destination.value.isNew}
                onSave={saveProvider}
                onDelete={deleteProviderById}
                onDismiss={() => destination.setValue(null)}
              />
            ) : destination.value?.kind === "settings" ? (
              <SettingsPage />
            ) : (
              <Text>选择</Text>
            ),
        }}>
        {providers.value.length === 0 ? (
          <EmptyView onAdd={addProvider} />
        ) : (
          providers.value.map((p) => (
            <ProviderCard
              key={p.id}
              cfg={p}
              isActive={p.id === activeId.value}
              refreshTick={refreshTick.value}
              onOpen={() => openEditor(p.id)}
              onSetDefault={() => setDefault(p.id)}
              onDelete={() => deleteProvider(p.id)}
            />
          ))
        )}
      </List>
    </NavigationStack>
  );
}

function EmptyView({ onAdd }: { onAdd: () => void }) {
  return (
    <VStack
      alignment="center"
      spacing={12}
      frame={{ maxWidth: "infinity" }}
      padding={{ top: 80, bottom: 40 }}>
      <Image
        systemName="wallet.pass"
        accessibilityHidden={true}
        foregroundStyle="secondaryLabel"
        resizable={true}
        scaleToFit={true}
        frame={{ width: 44, height: 44 }}
      />
      <Text font="subheadline" foregroundStyle="secondaryLabel">
        还没有供应商
      </Text>
      <Text font="caption" foregroundStyle="tertiaryLabel" lineLimit={2}>
        点击右上角「＋」添加中转站，即可查询余额
      </Text>
      <Button title="添加供应商" systemImage="plus" action={onAdd} />
    </VStack>
  );
}

function ProviderCard({
  cfg,
  isActive,
  refreshTick,
  onOpen,
  onSetDefault,
  onDelete,
}: {
  cfg: ProviderConfig;
  isActive: boolean;
  refreshTick: number;
  onOpen: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  // 默认先展示缓存，随后刷新替换
  const cached = getCachedBalance(cfg.id);
  const state = useObservable<CardState>({
    loading: false,
    data: cached?.data ?? null,
    error: "",
    updatedAt: cached ? new Date(cached.updatedAt) : null,
  });

  const refresh = async () => {
    const prev = state.value;
    state.setValue({
      loading: true,
      data: prev.data,
      error: "",
      updatedAt: prev.updatedAt,
    });
    try {
      const data = await api.getProviderBalance(cfg.id);
      saveBalanceCache(cfg.id, data);
      state.setValue({
        loading: false,
        data,
        error: "",
        updatedAt: new Date(),
      });
    } catch (e) {
      state.setValue({
        loading: false,
        data: prev.data,
        error: e instanceof Error ? e.message : String(e),
        updatedAt: prev.updatedAt,
      });
    }
  };

  useEffect(() => {
    refresh();
  }, [cfg.id, refreshTick]);

  const title =
    cfg.name.trim() || cfg.title.trim() || cfg.siteName || cfg.baseUrl.trim() || "未命名";
  const d = state.value.data;

  return (
    <VStack
      alignment="leading"
      spacing={6}
      padding={16}
      frame={{ maxWidth: "infinity" }}
      listRowInsets={{ top: 8, bottom: 8, leading: 16, trailing: 16 }}
      listRowSeparator="hidden"
      onTapGesture={onOpen}
      contextMenu={{
        menuItems: (
          <Group>
            <Button title="刷新余额" action={refresh} />
            {!isActive ? (
              <Button title="设为默认" action={onSetDefault} />
            ) : null}
            <Button title="删除供应商" role="destructive" action={onDelete} />
          </Group>
        ),
      }}>
      <HStack spacing={10}>
        <Logo
          size={22}
          provider={cfg.provider}
          providerId={cfg.id}
          logoVersion={cfg.logoVersion}
        />
        <VStack alignment="leading" spacing={1}>
          <Text font="headline" lineLimit={1}>
            {title}
          </Text>
          <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
            {cfg.baseUrl.trim() ||
              (cfg.provider === "openrouter"
                ? "https://openrouter.ai"
                : "未填写地址")}
          </Text>
        </VStack>
        <Spacer />
        {isActive ? (
          <Image
            systemName="checkmark.circle.fill"
            accessibilityHidden={true}
            foregroundStyle="systemGreen"
            frame={{ width: 18, height: 18 }}
          />
        ) : (
          <Button action={onSetDefault} buttonStyle="plain">
            <Image
              systemName="checkmark.circle"
              accessibilityHidden={true}
              foregroundStyle="secondaryLabel"
              frame={{ width: 18, height: 18 }}
            />
          </Button>
        )}
      </HStack>

      {d ? (
        <>
          <BalanceRow label={"剩余额度"} value={formatRemaining(d)} />
          {d.used != null && (
            <BalanceRow label={"已用金额"} value={formatAmount(d.used, d.unit)} />
          )}
          {d.requests != null && (
            <BalanceRow label={"请求次数"} value={`${formatRequests(d.requests)} 次`} />
          )}
          {d.total != null && (
            <BalanceRow label={"总额度"} value={formatAmount(d.total, d.unit)} />
          )}
          {usedRatio(d) != null ? (
            <ProgressView
              value={(usedRatio(d) as number) * 100}
              total={100}
              progressViewStyle={"linear"}
              tint={ratioColor(usedRatio(d))}
              scaleEffect={{ x: 1, y: 1.4 }}
              padding={{ top: 2 }}
            />
          ) : null}
          {d.extra ? <BalanceRow label={"说明"} value={d.extra} /> : null}
        </>
      ) : state.value.error ? (
        <HStack spacing={12} frame={{ maxWidth: "infinity", minHeight: 36 }}>
          <Image
            systemName="exclamationmark.triangle.fill"
            accessibilityHidden={true}
            foregroundStyle="systemRed"
          />
          <Text foregroundStyle="secondaryLabel" lineLimit={2}>
            {state.value.error}
          </Text>
        </HStack>
      ) : (
        <Text font="caption" foregroundStyle="secondaryLabel">
          暂无数据
        </Text>
      )}

      <HStack spacing={6}>
        <StatusDot
          hasData={!!d}
          isValid={d?.isValid ?? false}
          error={!!state.value.error}
        />
        <Text
          font="caption"
          foregroundStyle="secondaryLabel"
          monospacedDigit={true}>
          {state.value.updatedAt
            ? `更新于 ${formatUpdateTime(state.value.updatedAt)}${
                state.value.loading ? " · 刷新中" : ""
              }`
            : state.value.error
              ? "刷新失败"
              : state.value.loading
                ? "加载中"
                : "暂无数据"}
        </Text>
      </HStack>
    </VStack>
  );
}

function StatusDot({
  hasData,
  isValid,
  error,
}: {
  hasData: boolean;
  isValid: boolean;
  error: boolean;
}) {
  const color =
    error || (hasData && !isValid)
      ? "systemRed"
      : hasData
        ? "systemGreen"
        : "secondaryLabel";
  return (
    <Image
      systemName="circle.fill"
      accessibilityHidden={true}
      foregroundStyle={color}
      resizable={true}
      scaleToFit={true}
      frame={{ width: 6, height: 6 }}
    />
  );
}

function BalanceRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack frame={{ maxWidth: "infinity", minHeight: 26 }}>
      <Text foregroundStyle="label">{label}</Text>
      <Spacer />
      <Text foregroundStyle="label" monospacedDigit={true} lineLimit={1}>
        {value}
      </Text>
    </HStack>
  );
}

function formatRemaining(d: BalanceResult): string {
  if (d.remaining != null) return formatAmount(d.remaining, d.unit);
  if (d.used == null && d.total == null) return "∞";
  return "--";
}
