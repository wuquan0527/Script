import {
  Button,
  Group,
  HStack,
  Image,
  List,
  Picker,
  ProgressView,
  Section,
  SecureField,
  Spacer,
  Text,
  TextField,
  Toggle,
  VStack,
  useEffect,
  useObservable,
  useState,
} from "scripting";
import {
  api,
  BalanceResult,
  detectSiteName,
  downloadFavicon,
  faviconPath,
  OPENROUTER_DEFAULT_BASE_URL,
  ProviderConfig,
  ProviderId,
  PROVIDERS,
} from "../class/api";
import { saveBalanceCache } from "../services/cache";
import { Logo, OPENROUTER_LOCKUP_PATH } from "../widget/comp/header";
import { formatAmount } from "../widget/small";

export function ProviderFormPage({
  initial,
  isNew,
  onSave,
  onDelete,
  onDismiss,
}: {
  initial: ProviderConfig;
  isNew: boolean;
  onSave: (cfg: ProviderConfig, isNew: boolean) => void;
  onDelete: (id: string) => void;
  onDismiss: () => void;
}) {
  const provider = useObservable(initial.provider);
  const baseUrl = useObservable(initial.baseUrl);
  const token = useObservable(initial.token);
  const path = useObservable(initial.path);
  const title = useObservable(initial.title);
  const siteName = useObservable(initial.siteName);
  const userId = useObservable(initial.userId);
  const name = useObservable(initial.name);
  const logoVersion = useObservable(initial.logoVersion);
  const showCustomUrl = useObservable(
    initial.provider === "openrouter" &&
      !!initial.baseUrl &&
      initial.baseUrl.trim() !== OPENROUTER_DEFAULT_BASE_URL,
  );
  const favicon = useObservable({
    exists:
      (initial.logoVersion > 0 &&
        FileManager.existsSync(faviconPath(initial.id, initial.logoVersion))) ||
      (initial.logoVersion <= 0 &&
        FileManager.existsSync(faviconPath(initial.id))),
    loading: false,
  });
  const refreshTick = useObservable(1);
  const isActive = useObservable(!isNew && initial.id === api.activeId);
  // 首次进入不自动识别 logo/站点名，仅地址被修改（初始化填写）或手动触发时才执行
  const [isFirstRun, setIsFirstRun] = useState(true);

  const dirty =
    provider.value !== initial.provider ||
    baseUrl.value.trim() !== initial.baseUrl ||
    token.value.trim() !== initial.token ||
    path.value.trim() !== initial.path ||
    name.value.trim() !== initial.name ||
    userId.value.trim() !== initial.userId ||
    siteName.value !== initial.siteName ||
    logoVersion.value !== initial.logoVersion ||
    showCustomUrl.value !==
      (initial.provider === "openrouter" &&
        !!initial.baseUrl &&
        initial.baseUrl.trim() !== OPENROUTER_DEFAULT_BASE_URL);

  const buildConfig = (): ProviderConfig => {
    const isOR = provider.value === "openrouter";
    let finalBase = baseUrl.value.trim();
    if (isOR && (!finalBase || !showCustomUrl.value)) {
      finalBase = OPENROUTER_DEFAULT_BASE_URL;
    }
    let finalPath = path.value.trim();
    if (isOR && (!finalPath || !showCustomUrl.value)) {
      finalPath = PROVIDERS.openrouter.path;
    }
    let finalName = name.value.trim();
    if (isOR && !finalName) {
      finalName = "OpenRouter";
    }
    return {
      ...initial,
      provider: provider.value,
      baseUrl: finalBase,
      token: token.value.trim(),
      path: finalPath,
      name: finalName,
      userId: userId.value.trim(),
      siteName: siteName.value,
      logoVersion: logoVersion.value,
    };
  };

  const done = () => {
    commit();
    onDismiss();
  };

  const leave = async () => {
    if (dirty) {
      const index = await Dialog.actionSheet({
        title: isNew ? "保存新的供应商？" : "保存更改？",
        message: isNew
          ? "填写的内容尚未保存。"
          : "你有未保存的更改。",
        cancelButton: true,
        actions: [
          { label: "保存" },
          { label: "不保存", destructive: true },
        ],
      });
      if (index == null) return; // 取消 → 留在表单
      if (index === 0) commit();
      // index === 1 → 不保存，直接离开
    }
    onDismiss();
  };

  const deleteThis = async () => {
    if (isNew) {
      onDismiss();
      return;
    }
    const cfg = api.providers.find((p) => p.id === initial.id);
    const nm =
      cfg?.name.trim() ||
      cfg?.title.trim() ||
      initial.baseUrl.trim() ||
      "该供应商";
    const ok = await Dialog.actionSheet({
      title: "删除供应商",
      message: `确定要删除「${nm}」吗？删除后不可恢复。`,
      cancelButton: true,
      actions: [{ label: "删除", destructive: true }],
    });
    if (ok == null) return;
    onDelete(initial.id);
    onDismiss();
  };

  const setAsActive = () => {
    if (isNew) return;
    api.setActive(initial.id);
    isActive.setValue(true);
    Dialog.alert({
      title: "已设为默认",
      message: `已将「${name.value.trim() || initial.name || "该供应商"}」设为默认供应商`,
    });
  };

  // 地址修改后防抖自动拉取 favicon 与站点名称（首次挂载跳过，仅初始化填写/手动时触发）
  useEffect(() => {
    if (isFirstRun) {
      setIsFirstRun(false);
      return;
    }
    const url = baseUrl.value.trim();
    siteName.setValue("");
    if (!url) return;
    const timer = setTimeout(() => {
      // openrouter 默认使用内置官方深浅色 Logo，不自动抓取网页 favicon
      if (
        provider.value !== "openrouter" &&
        logoVersion.value <= 0 &&
        !FileManager.existsSync(faviconPath(initial.id))
      ) {
        downloadFavicon(url, initial.id, 1).then((ok) => {
          if (ok) {
            setResetPending(false);
            logoVersion.setValue(1);
            favicon.setValue({ exists: true, loading: false });
          }
        });
      }
      detectSiteName(url, provider.value).then((n) =>
        siteName.setValue(n || ""),
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [baseUrl.value]);

  /** 保存时清理旧 logo 文件（避免未保存就破坏旧文件，不保存时不做任何文件操作） */
  const cleanupOldLogoFiles = () => {
    const newVersion = logoVersion.value;
    if (newVersion === initial.logoVersion) return;
    if (initial.logoVersion > 0) {
      try {
        const p = faviconPath(initial.id, initial.logoVersion);
        if (FileManager.existsSync(p)) FileManager.removeSync(p);
      } catch {}
    }
    if (newVersion === 0) {
      try {
        const p = faviconPath(initial.id);
        if (FileManager.existsSync(p)) FileManager.removeSync(p);
      } catch {}
    }
  };

  const commit = () => {
    cleanupOldLogoFiles();
    onSave(buildConfig(), isNew);
  };

  /** 重新识别站点图标（下载到新版本，不删旧文件，仅保存时清理） */
  const refreshSiteInfo = async () => {
    const url = baseUrl.value.trim();
    favicon.setValue({ exists: favicon.value.exists, loading: true });
    const version = logoVersion.value + 1;
    const ok = await downloadFavicon(url, initial.id, version);
    if (ok) {
      setResetPending(false);
      logoVersion.setValue(version);
      favicon.setValue({ exists: true, loading: false });
    } else {
      favicon.setValue({ exists: favicon.value.exists, loading: false });
    }
    if (url) {
      const n = await detectSiteName(url, provider.value);
      siteName.setValue(n || "");
    }
  };

  /** 自定义 Logo（写入新版本文件，不删旧文件，仅保存时清理） */
  const pickImage = async () => {
    try {
      const images = await Photos.pickPhotos(1);
      if (!images || images.length === 0) return;
      const png = compressLogoImage(images[0]);
      if (!png) {
        Dialog.alert({ title: "图片处理失败", message: "无法转换为 PNG" });
        return;
      }
      const version = logoVersion.value + 1;
      await FileManager.writeAsData(faviconPath(initial.id, version), png);
      setResetPending(false);
      logoVersion.setValue(version);
      favicon.setValue({ exists: true, loading: false });
    } catch (e) {
      Dialog.alert({ title: "选择图片失败", message: String(e) });
    }
  };

  /** 恢复默认（仅标记草稿，不删文件；保存时才清理） */
  const [resetPending, setResetPending] = useState(false);
  const resetLogo = () => {
    setResetPending(true);
    logoVersion.setValue(0);
    favicon.setValue({ exists: false, loading: false });
  };

  const existing = api.providers.find((p) => p.id === initial.id);
  const isOpenRouter = provider.value === "openrouter";
  const effectiveBaseUrl = isOpenRouter
    ? (showCustomUrl.value && baseUrl.value.trim()
        ? baseUrl.value.trim()
        : OPENROUTER_DEFAULT_BASE_URL)
    : (baseUrl.value.trim() || "{baseUrl}");
  const effectivePath = isOpenRouter
    ? (showCustomUrl.value && path.value.trim()
        ? path.value.trim()
        : PROVIDERS.openrouter.path)
    : (path.value.trim() || "/v1/usage");
  const queryUrl =
    effectiveBaseUrl +
    (effectivePath.startsWith("/") ? effectivePath : `/${effectivePath}`);

  return (
    <List
      navigationTitle={isNew ? "新增供应商" : "供应商配置"}
      navigationBarTitleDisplayMode={"inline"}
      navigationBarBackButtonHidden={true}
      toolbar={{
        cancellationAction: [
          <Button title="返回" action={leave} />,
        ],
        topBarTrailing: [
          <Button
            title="刷新余额"
            systemImage="arrow.clockwise"
            action={() => refreshTick.setValue(refreshTick.value + 1)}
          />,
        ],
        confirmationAction: [
          <Button title="完成" action={done} />,
        ],
      }}>
      <Section>
        <SiteHeader
          displayName={
            name.value.trim() ||
            title.value.trim() ||
            siteName.value ||
            baseUrl.value.trim() ||
            "未命名站点"
          }
          provider={provider.value}
          providerId={initial.id}
          logoVersion={logoVersion.value}
          showDefaultLogo={resetPending}
          hasCustomLogo={favicon.value.exists}
          onRefreshSite={refreshSiteInfo}
          onPickImage={pickImage}
          onResetLogo={resetLogo}
        />
      </Section>
      <Section header={<Text>基本信息</Text>}>
        <ProviderPicker
          value={provider}
          path={path}
          baseUrl={baseUrl}
          name={name}
        />
        <NameField value={name} />
        {!isOpenRouter ? <DetectedNameRow name={siteName.value} /> : null}
      </Section>
      <Section header={<Text>API Key / 令牌</Text>}>
        <TokenField
          value={token}
          provider={provider.value}
        />
        {provider.value === "newapi" ? <UserIdField value={userId} /> : null}
      </Section>
      {isOpenRouter ? (
        <Section
          footer={
            <Text foregroundStyle="secondaryLabel">
              默认使用 OpenRouter 官方接口（https://openrouter.ai）。如需自建代理转发可开启自定义。
            </Text>
          }>
          <Toggle
            title="自定义接口地址"
            value={showCustomUrl.value}
            onChanged={(v) => showCustomUrl.setValue(v)}
          />
          {showCustomUrl.value ? (
            <>
              <BaseUrlField value={baseUrl} />
              <PathField value={path} />
            </>
          ) : null}
        </Section>
      ) : (
        <Section header={<Text>接口配置</Text>}>
          <BaseUrlField value={baseUrl} />
          <PathField value={path} />
        </Section>
      )}
      <Section
        header={<Text>余额</Text>}
        footer={
          <Text foregroundStyle="secondaryLabel">
            {"查询接口：GET " +
              queryUrl +
              "\n" +
              PROVIDERS[provider.value].hint}
          </Text>
        }>
        <BalanceSection
          id={initial.id}
          provider={provider}
          baseUrl={baseUrl}
          token={token}
          path={path}
          userId={userId}
          refreshTick={refreshTick.value}
        />
      </Section>
      <Section>
        {!isNew && existing && !isActive.value ? (
          <Button action={setAsActive}>
            <HStack
              spacing={8}
              frame={{ maxWidth: "infinity", alignment: "leading" }}>
              <Image
                systemName="checkmark.circle"
                accessibilityHidden={true}
                foregroundStyle="systemGreen"
                resizable={true}
                scaleToFit={true}
                frame={{ width: 18, height: 18 }}
              />
              <Text foregroundStyle="label">设为默认</Text>
            </HStack>
          </Button>
        ) : null}
        <Button action={deleteThis} role="destructive">
          <HStack spacing={8} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            <Image
              systemName="trash"
              accessibilityHidden={true}
              foregroundStyle="systemRed"
              resizable={true}
              scaleToFit={true}
              frame={{ width: 18, height: 18 }}
            />
            <Text foregroundStyle="systemRed">删除供应商</Text>
          </HStack>
        </Button>
      </Section>
    </List>
  );
}

function SiteHeader({
  displayName,
  provider,
  providerId,
  logoVersion,
  showDefaultLogo,
  hasCustomLogo,
  onRefreshSite,
  onPickImage,
  onResetLogo,
}: {
  displayName: string;
  provider: ProviderId;
  providerId: string;
  logoVersion: number;
  showDefaultLogo: boolean;
  hasCustomLogo: boolean;
  onRefreshSite: () => void;
  onPickImage: () => void;
  onResetLogo: () => void;
}) {
  const isOR = provider === "openrouter";
  if (isOR) {
    // OpenRouter 专属 Lockup：深浅自适应展示官方品牌标识，不支持自定义修改 Logo
    return (
      <VStack
        alignment="center"
        spacing={8}
        frame={{ maxWidth: "infinity" }}
        padding={{ top: 20, bottom: 20 }}>
        <Image
          filePath={OPENROUTER_LOCKUP_PATH}
          resizable={true}
          scaleToFit={true}
          frame={{ width: 164, height: 30 }}
        />
      </VStack>
    );
  }

  return (
    <VStack
      alignment="center"
      spacing={8}
      frame={{ maxWidth: "infinity" }}
      padding={{ top: 16, bottom: 16 }}
      contextMenu={{
        menuItems: (
          <Group>
            <Button title="自定义 Logo" action={onPickImage} />
            {hasCustomLogo ? (
              <Button title="恢复默认" action={onResetLogo} />
            ) : null}
            <Button title="重新识别" action={onRefreshSite} />
          </Group>
        ),
      }}>
      <Logo
        size={56}
        provider={provider}
        providerId={providerId}
        logoVersion={logoVersion}
        forceDefault={showDefaultLogo}
      />
      <Text font="subheadline" foregroundStyle="label" lineLimit={1}>
        {displayName}
      </Text>
    </VStack>
  );
}

function ProviderPicker({
  value,
  path,
  baseUrl,
  name,
}: {
  value: Observable<ProviderId>;
  path: Observable<string>;
  baseUrl: Observable<string>;
  name: Observable<string>;
}) {
  const onChanged = (next: string) => {
    const id = next as ProviderId;
    if (!(id in PROVIDERS)) return;
    const old = value.value;
    const oldDefault = PROVIDERS[old]?.path ?? "/v1/usage";
    value.setValue(id);
    const cur = path.value.trim();
    if (!cur || cur === oldDefault) {
      path.setValue(PROVIDERS[id].path);
    }
    if (id === "openrouter") {
      if (!baseUrl.value.trim()) {
        baseUrl.setValue(OPENROUTER_DEFAULT_BASE_URL);
      }
      if (!name.value.trim()) {
        name.setValue("OpenRouter");
      }
    }
  };
  return (
    <Picker
      title="供应商类型"
      value={value.value}
      onChanged={onChanged}
      pickerStyle="menu">
      <Text tag="generic">{PROVIDERS.generic.label}</Text>
      <Text tag="sub2api">{PROVIDERS.sub2api.label}</Text>
      <Text tag="newapi">{PROVIDERS.newapi.label}</Text>
      <Text tag="openrouter">{PROVIDERS.openrouter.label}</Text>
    </Picker>
  );
}

function NameField({ value }: { value: Observable<string> }) {
  return (
    <TextField
      title={"供应商名字"}
      prompt={"留空自动识别站点名称"}
      value={value}
      autocorrectionDisabled
    />
  );
}

function DetectedNameRow({ name }: { name: string }) {
  return (
    <HStack frame={{ maxWidth: "infinity", minHeight: 32 }}>
      <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
        {name ? `自动识别：${name}` : "未识别到站点名称，可手动填写标题"}
      </Text>
    </HStack>
  );
}

function BaseUrlField({ value }: { value: Observable<string> }) {
  return (
    <TextField
      title={"中转站地址"}
      prompt={"https://api.example.com"}
      value={value}
      keyboardType="URL"
      textContentType="URL"
      autocorrectionDisabled
      textInputAutocapitalization="never"
    />
  );
}

function PathField({ value }: { value: Observable<string> }) {
  return (
    <TextField
      title={"查询路径"}
      prompt={"/v1/usage"}
      value={value}
      autocorrectionDisabled
      textInputAutocapitalization="never"
    />
  );
}

function TokenField({
  value,
  provider,
}: {
  value: Observable<string>;
  provider: ProviderId;
}) {
  let title = "API Key";
  let prompt = "sk-...";
  if (provider === "newapi") {
    title = "访问令牌";
    prompt = "个人中心→令牌";
  } else if (provider === "openrouter") {
    title = "API Key";
    prompt = "sk-or-v1-...";
  }
  return (
    <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
      <SecureField
        title={title}
        prompt={prompt}
        value={value}
        frame={{ maxWidth: "infinity" }}
      />
      <PasteButton onPaste={(text) => value.setValue(text)} />
    </HStack>
  );
}

function PasteButton({ onPaste }: { onPaste: (text: string) => void }) {
  return (
    <Button
      action={async () => {
        try {
          const text = await Pasteboard.getString();
          if (text) onPaste(text);
        } catch {}
      }}
      buttonStyle="plain">
      <Image
        systemName="doc.on.clipboard.fill"
        accessibilityHidden={true}
        foregroundStyle="accentColor"
        frame={{ width: 18, height: 18 }}
      />
    </Button>
  );
}

function UserIdField({ value }: { value: Observable<string> }) {
  return (
    <TextField
      title={"用户 ID"}
      prompt={"个人中心名称下方的 ID"}
      value={value}
      keyboardType="numberPad"
      autocorrectionDisabled
    />
  );
}

interface BalanceState {
  loading: boolean;
  data: BalanceResult | null;
  error: string;
}

function BalanceSection({
  id,
  provider,
  baseUrl,
  token,
  path,
  userId,
  refreshTick,
}: {
  id: string;
  provider: Observable<ProviderId>;
  baseUrl: Observable<string>;
  token: Observable<string>;
  path: Observable<string>;
  userId: Observable<string>;
  refreshTick: number;
}) {
  const state = useObservable<BalanceState>({
    loading: true,
    data: null,
    error: "",
  });

  const refresh = async () => {
    const isOR = provider.value === "openrouter";
    const effectiveBase = isOR
      ? (String(baseUrl.value || "").trim() || OPENROUTER_DEFAULT_BASE_URL)
      : String(baseUrl.value || "").trim();
    const effectivePath = isOR
      ? (String(path.value || "").trim() || PROVIDERS.openrouter.path)
      : String(path.value || "").trim();
    const tokenVal = String(token.value || "").trim();

    if (!tokenVal) {
      state.setValue({
        loading: false,
        data: null,
        error: isOR ? "请先填写 API Key" : "请先填写中转站地址和 API Key",
      });
      return;
    }
    if (!effectiveBase) {
      state.setValue({
        loading: false,
        data: null,
        error: "请先填写中转站地址",
      });
      return;
    }
    const cfg: ProviderConfig = {
      id,
      provider: provider.value,
      baseUrl: effectiveBase,
      token: tokenVal,
      path: effectivePath,
      title: "",
      siteName: "",
      userId: String(userId.value || "").trim(),
      name: "",
      logoVersion: 0,
    };
    state.setValue({ loading: true, data: null, error: "" });
    try {
      const data = await api.getBalance(cfg);
      state.setValue({ loading: false, data, error: "" });
      saveBalanceCache(id, data);
    } catch (e) {
      state.setValue({
        loading: false,
        data: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // 挂载 + 头部“刷新余额”按钮：立即查询
  useEffect(() => {
    refresh();
  }, [refreshTick]);

  // 配置变化后防抖自动查询
  useEffect(() => {
    const timer = setTimeout(() => {
      refresh();
    }, 500);
    return () => clearTimeout(timer);
  }, [id, provider.value, baseUrl.value, token.value, path.value, userId.value]);

  if (state.value.loading) {
    return (
      <HStack frame={{ maxWidth: "infinity", minHeight: 44 }}>
        <Spacer />
        <ProgressView />
        <Spacer />
      </HStack>
    );
  }

  if (state.value.error) {
    return (
      <>
        <HStack spacing={12} frame={{ maxWidth: "infinity", minHeight: 44 }}>
          <Image
            systemName="exclamationmark.triangle.fill"
            accessibilityHidden={true}
            foregroundStyle="systemRed"
          />
          <Text foregroundStyle="secondaryLabel" lineLimit={2}>
            {state.value.error}
          </Text>
          <Spacer />
          <Button title="重试" action={refresh} />
        </HStack>
        <RefreshRow onRefresh={refresh} />
      </>
    );
  }

  const d = state.value.data!;
  return (
    <>
      <StatusRow isValid={d.isValid} />
      <BalanceRow label={"剩余额度"} value={formatRemaining(d)} />
      {d.used != null && (
        <BalanceRow label={"已用额度"} value={formatAmount(d.used, d.unit)} />
      )}
      {d.total != null && (
        <BalanceRow label={"总额度"} value={formatAmount(d.total, d.unit)} />
      )}
      {d.planName ? <BalanceRow label={"类型"} value={d.planName} /> : null}
      {d.extra ? <BalanceRow label={"说明"} value={d.extra} /> : null}
      <RefreshRow onRefresh={refresh} />
    </>
  );
}

function StatusRow({ isValid }: { isValid: boolean }) {
  return (
    <HStack frame={{ maxWidth: "infinity", minHeight: 44 }}>
      <Text foregroundStyle="label">账户状态</Text>
      <Spacer />
      <Image
        systemName={
          isValid ? "checkmark.circle.fill" : "exclamationmark.circle.fill"
        }
        accessibilityHidden={true}
        foregroundStyle={isValid ? "systemGreen" : "systemOrange"}
      />
      <Text foregroundStyle="label">{isValid ? "正常" : "不可用"}</Text>
    </HStack>
  );
}

function BalanceRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack frame={{ maxWidth: "infinity", minHeight: 44 }}>
      <Text foregroundStyle="label">{label}</Text>
      <Spacer />
      <Text foregroundStyle="label" monospacedDigit={true} lineLimit={1}>
        {value}
      </Text>
    </HStack>
  );
}

function RefreshRow({ onRefresh }: { onRefresh: () => void }) {
  return (
    <Button title="刷新余额" systemImage="arrow.clockwise" action={onRefresh} />
  );
}

/** 压缩图片：最长边缩到 maxEdge（默认 256px），保持宽高比，输出 PNG */
function compressLogoImage(image: UIImage, maxEdge = 256): Data | null {
  const w = image.width;
  const h = image.height;
  if (w <= 0 || h <= 0) return image.toPNGData();
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const thumb = image.preparingThumbnail({ width: tw, height: th });
  if (!thumb) return image.toPNGData();
  return thumb.toPNGData();
}

function formatRemaining(d: BalanceResult): string {
  if (d.remaining != null) return formatAmount(d.remaining, d.unit);
  if (d.used == null && d.total == null) return "∞";
  return "--";
}