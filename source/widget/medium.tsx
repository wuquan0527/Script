import { Divider, HStack, Spacer, Text, VStack } from "scripting";
import { Header } from "./comp/header";
import {
  formatAmount,
  formatRemaining,
  formatRequests,
  formatUpdateTime,
  ratioColor,
  UsageProgress,
  usedRatio,
  WidgetData,
} from "./small";

/** 中号：余额 / 已用 / 请求次数 三栏并列 + 三色进度条 */
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
        </VStack>
      </HStack>

      {ratio != null ? (
        <VStack frame={{ maxWidth: "infinity" }} padding={{ top: 7 }}>
          <UsageProgress ratio={ratio} />
        </VStack>
      ) : null}

      <Spacer minLength={4} />
      <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
        <Text
          font={"caption2"}
          foregroundStyle={"secondaryLabel"}
          monospacedDigit={true}
          lineLimit={1}>
          {`更新于 ${formatUpdateTime(updatedAt)}`}
        </Text>
        <Spacer />
        <Text
          font={"caption2"}
          foregroundStyle={ratioColor(ratio)}
          monospacedDigit={true}
          lineLimit={1}
          minScaleFactor={0.7}>
          {ratio != null ? `已用 ${Math.round(ratio * 100)}%` : ""}
        </Text>
        <Text
          font={"caption2"}
          foregroundStyle={"secondaryLabel"}
          lineLimit={1}
          minScaleFactor={0.7}>
          {total != null
            ? `总额 ${formatAmount(total, unit)}`
            : planName && !planName.startsWith("Key:")
              ? planName
              : ""}
        </Text>
      </HStack>
    </VStack>
  );
}
