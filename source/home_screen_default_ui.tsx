// AI Relay Usage 首页 Tab UI（Scripting App 设置 → Show Home Tab → 选择本脚本）
// 主页直接展示用量页（无底部 TabBar），设置入口在右上角齿轮按钮。
import { UsagePage } from "./page/UsagePage";

export default function HomeScreenView() {
  return <UsagePage />;
}