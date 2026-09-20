import { Gauge, Text } from "scripting";
import { Logo } from "./comp/header";
import {
  formatAmountCompact,
  ratioColor,
  usedRatio,
  WidgetData,
} from "./small";

/** 圆形：有总额可推导时显示「已用占比」环形进度，否则退化为已用金额 */
export function View(props: WidgetData) {
  const ratio = usedRatio(props);

  if (ratio != null) {
    const percent = Math.round(ratio * 100);
    return (
      <Gauge
        gaugeStyle={"accessoryCircular"}
        min={0}
        max={100}
        value={percent}
        tint={ratioColor(ratio)}
        label={
          <Logo
            size={10}
            provider={props.provider}
            providerId={props.providerId}
            logoVersion={props.logoVersion}
          />
        }
        currentValueLabel={<Text>{`${percent}%`}</Text>}
      />
    );
  }

  const text =
    props.used != null
      ? formatAmountCompact(props.used, props.unit)
      : props.remaining != null
        ? formatAmountCompact(props.remaining, props.unit)
        : "∞";
  return <Text font={"headline"}>{text}</Text>;
}
