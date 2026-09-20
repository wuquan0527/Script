import { Text } from "scripting";
import {
  checkinLabel,
  formatAmountCompact,
  formatRemaining,
  formatRequests,
  WidgetData,
} from "./small";

/** 锁屏内联 / 矩形：余额 · 已用 · 请求次数 · 签到状态 */
export function View(props: WidgetData) {
  const parts: string[] = [`余额 ${formatRemaining(props)}`];
  if (props.used != null) {
    parts.push(`已用 ${formatAmountCompact(props.used, props.unit)}`);
  }
  if (props.requests != null) {
    parts.push(`${formatRequests(props.requests)} 次`);
  }
  const checkin = checkinLabel(props.checkin);
  if (checkin != null) {
    parts.push(props.checkin?.checkedToday ? "已签到" : "未签到");
  }
  return (
    <Text
      font={"subheadline"}
      fontWeight={"semibold"}
      monospacedDigit={true}
      lineLimit={1}>
      {parts.join(" · ")}
    </Text>
  );
}
