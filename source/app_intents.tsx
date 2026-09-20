import { AppIntentManager, AppIntentProtocol, Script, Widget } from "scripting";

export const ReloadIntent = AppIntentManager.register({
  name: "AIRelayUsageReloadIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    // 点击小组件刷新：强制系统时间线重载
    Widget.reloadUserWidgets();
  },
});
