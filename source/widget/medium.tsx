import { Divider, HStack, Spacer, Text, VStack } from "scripting";
import { Header } from "./comp/header";
import {
  CheckinBadge,
  formatAmount,
  formatRemaining,
  formatRequests,
  formatUpdateTime,
  ratioColor,
  UsageProgress,
  usedRatio,
  WidgetData,
} from "./small";

/** 中号：余额 / 已用 / 请求次数 三栏并列 + 三色进度条 + 签到状态 */
export function View(props: WidgetData) {
  const { used, total, planName, unit, provider, isValid, providerId, title, updatedAt } =
    props;
  const ratio = usedRatio(props);
  const hasUsed = used != null && used > 0;

  return (
    <VStack padding={true} alignment={"leading"} spacing={0} frame={{ maxWidth: "infinity" }}>
      <Header
        provider={provider}
        providerId={providerId}
        logoVersion={props.logoVersion}
        title={title}
        status={isValid ? "ok" : "error"}
      />
      <Divider padding={{ top: 4 }} />

      <HStack spacing={10} alignment={"top"} frame={{ maxWidth: "infinity" }} padding={{ top: 6 }}>
        <VStack alignment={"leading"} spacing={1} frame={{ maxWidth: "infinity" }}>
          <Text font={"caption"} foregroundStyle={"secondaryLabel"} lineLimit={1}>
            {"余额"}
          </Text>
          <Text
            font={"title3"}
            fontWeight={"bold"}
            monospacedDigit={true}
            lineLimit={1}
            minScaleFactor={0.5}>
            {formatRemaining(props)}
          </Text>
          <Text
            font={"caption2"}
            foregroundStyle={"secondaryLabel"}
            monospacedDigit={true}
            lineLimit={1}
            minScaleFactor={0.7}>
            {total != null ? `总额 ${formatAmount(total, unit)}` : ""}
          </Text>
        </VStack>

        <VStack alignment={"leading"} spacing={1} frame={{ maxWidth: "infinity" }}>
          <Text font={"caption"} foregroundStyle={"secondaryLabel"} lineLimit={1}>
            {"已用"}
          </Text>
          <Text
            font={"title3"}
            fontWeight={"bold"}
            monospacedDigit={true}
            lineLimit={1}
            minScaleFactor={0.5}
            foregroundStyle={hasUsed ? "systemRed" : "secondaryLabel"}>
            {formatAmount(used, unit)}
          </Text>
          <Text
            font={"caption2"}
            foregroundStyle={ratioColor(ratio)}
            monospacedDigit={true}
            lineLimit={1}
            minScaleFactor={0.7}>
            {ratio != null ? `占比 ${Math.round(ratio * 100)}%` : ""}
          </Text>
        </VStack>

        <VStack alignment={"trailing"} spacing={1} frame={{ maxWidth: "infinity" }}>
          <Text font={"caption"} foregroundStyle={"secondaryLabel"} lineLimit={1}>
            {"请求次数"}
          </Text>
          <Text
            font={"title3"}
            fontWeight={"bold"}
            monospacedDigit={true}
            lineLimit={1}
            minScaleFactor={0.5}>
            {formatRequests(props.requests)}
          </Text>
          {planName && !planName.startsWith("Key:") ? (
            <Text
              font={"caption2"}
              foregroundStyle={"secondaryLabel"}
              lineLimit={1}
              minScaleFactor={0.7}>
              {planName}
            </Text>
          ) : null}
        </VStack>
      </HStack>

      {ratio != null ? (
        <VStack frame={{ maxWidth: "infinity" }} padding={{ top: 7 }}>
          <UsageProgress ratio={ratio} />
        </VStack>
      ) : null}

      <Spacer minLength={4} />
      <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
        <CheckinBadge checkin={props.checkin} />
        <Spacer />
        <Text
          font={"caption2"}
          foregroundStyle={"secondaryLabel"}
          monospacedDigit={true}
          lineLimit={1}
          minScaleFactor={0.7}>
          {`更新于 ${formatUpdateTime(updatedAt)}`}
        </Text>
      </HStack>
    </VStack>
  );
}
