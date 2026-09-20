import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  Picker,
  Script,
  Section,
  Spacer,
  Text,
  useState,
  Widget,
} from "scripting";
import { api } from "../class/api";
import {
  balanceCacheCount,
  clearBalanceCache,
} from "../services/cache";
import {
  APP_VERSION,
  getAppDisplaySettings,
  RELOAD_OPTIONS,
  setAppReloadMinutes,
} from "../services/settings";

export function SettingsPage() {
  const isHomeScreen = Script.env === "home_screen";
  const dismiss = (() => {
    try {
      return Navigation.useDismiss();
    } catch {
      return () => {};
    }
  })();
  const [reloadMinutes, setReloadMinutes] = useState(
    getAppDisplaySettings().reloadMinutes,
  );

  const changeReloadMinutes = (minutes: number) => {
    setReloadMinutes(minutes);
    setAppReloadMinutes(minutes);
  };

  const reloadWidgets = async () => {
    Widget.reloadUserWidgets();
    Dialog.alert({
      title: "已请求刷新",
      message:
        "已请求重新加载所有 Scripting 小组件，实际显示更新时间由 iOS 决定。",
      buttonLabel: "关闭",
    });
  };

  const previewWidget = async () => {
    const options: Record<string, string> = {};
    let def = "";
    for (const p of api.providers) {
      const label = p.title.trim() || p.baseUrl.trim() || `供应商 ${p.id}`;
      options[label] = JSON.stringify({ id: p.id });
      if (p.id === api.activeId) def = label;
    }
    if (Object.keys(options).length === 0) return;
    try {
      await Widget.preview({
        family: "systemSmall",
        parameters: { options, default: def || Object.keys(options)[0] },
      });
    } catch (e) {
      Dialog.alert({ title: "预览失败", message: String(e) });
    }
  };

  const clearCache = async () => {
    const count = balanceCacheCount();
    clearBalanceCache();
    Dialog.alert({
      title: "已清理缓存",
      message: count > 0 ? `已删除 ${count} 条余额缓存。` : "当前没有缓存。",
      buttonLabel: "关闭",
    });
  };

  return (
    <List
      navigationTitle={"设置"}
      navigationBarTitleDisplayMode={"inline"}
      toolbar={{
        ...(isHomeScreen
          ? {}
          : {
              cancellationAction: [
                <Button
                  title={"关闭"}
                  systemImage={"xmark"}
                  action={dismiss}
                />,
              ],
            }),
      }}>
        <Section
          header={<Text>小组件</Text>}
          footer={
            <Text foregroundStyle="secondaryLabel">
              {"刷新间隔决定小组件自动更新的频率；修改后建议点击“立即刷新小组件”生效。"}
            </Text>
          }>
          <Picker
            title="刷新间隔"
            systemImage="arrow.clockwise"
            value={reloadMinutes}
            onChanged={changeReloadMinutes}
            pickerStyle="navigationLink">
            {RELOAD_OPTIONS.map((o) => (
              <Text key={o.minutes} tag={o.minutes}>
                {o.label}
              </Text>
            ))}
          </Picker>
          <Button
            title="预览小组件"
            systemImage="rectangle.3.group"
            action={previewWidget}
          />
          <Button
            title="立即刷新小组件"
            systemImage="arrow.clockwise.circle"
            action={reloadWidgets}
          />
        </Section>
        <Section
          header={<Text>数据</Text>}
          footer={
            <Text foregroundStyle="secondaryLabel">
              {"余额缓存用于离线/快速展示上次查询结果，最多保留 50 条，刷新后自动更新。"}
            </Text>
          }>
          <Button
            title="清理余额缓存"
            systemImage="trash"
            action={clearCache}
          />
        </Section>
        <Section
          header={<Text>关于</Text>}
          footer={
            <Text foregroundStyle="secondaryLabel">
              {"多供应商余额面板：通用 / sub2api / new-api，支持多个 Scripting 小组件按“参数”绑定不同供应商。"}
            </Text>
          }>
          <InfoRow label={"版本"} value={APP_VERSION} />
          <InfoRow label={"脚本"} value={"AI Relay Usage"} />
        </Section>
      </List>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack frame={{ maxWidth: "infinity", minHeight: 44 }}>
      <Text foregroundStyle="label">{label}</Text>
      <Spacer />
      <Text foregroundStyle="secondaryLabel" monospacedDigit={true}>
        {value}
      </Text>
    </HStack>
  );
}
