import { Navigation, NavigationStack, Script, Tab, TabView } from "scripting";
import { UsagePage } from "./page/UsagePage";
import { SettingsPage } from "./page/SettingsPage";

(async () => {
  await Navigation.present({
    element: (
      <TabView>
        <Tab title="用量" systemImage="chart.bar.fill" value="usage">
          <UsagePage />
        </Tab>
        <Tab title="设置" systemImage="gearshape.fill" value="settings">
          <NavigationStack>
            <SettingsPage />
          </NavigationStack>
        </Tab>
      </TabView>
    ),
    modalPresentationStyle: "fullScreen",
  });
})().finally(Script.exit);