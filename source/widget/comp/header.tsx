import { HStack, Image, Script, Spacer, SVG, Text } from "scripting";
import { faviconPath, ProviderId } from "../../class/api";

export type LogoPathSource = string | { light: string; dark: string };

const OPENROUTER_SVG = {
  light:
    '<svg width="1024" height="730" viewBox="0 0 1024 730" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M795.893 0C915.776 0 1012.95 97.9963 1012.95 218.88C1012.95 339.764 915.776 437.76 795.893 437.76L1011.2 654.869C1038.55 682.447 1019.18 729.6 980.504 729.6H361.77C161.97 729.6 0 566.273 0 364.8C0 163.327 161.97 0 361.77 0L795.893 0ZM361.77 145.92C241.89 145.92 144.708 243.916 144.708 364.8C144.708 485.684 241.89 583.68 361.77 583.68C481.649 583.68 578.831 485.684 578.831 364.8C578.831 243.916 481.649 145.92 361.77 145.92Z" fill="#7624F4"/></svg>',
  dark:
    '<svg width="1024" height="730" viewBox="0 0 1024 730" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M795.893 0C915.776 0 1012.95 97.9963 1012.95 218.88C1012.95 339.764 915.776 437.76 795.893 437.76L1011.2 654.869C1038.55 682.447 1019.18 729.6 980.504 729.6H361.77C161.97 729.6 0 566.273 0 364.8C0 163.327 161.97 0 361.77 0L795.893 0ZM361.77 145.92C241.89 145.92 144.708 243.916 144.708 364.8C144.708 485.684 241.89 583.68 361.77 583.68C481.649 583.68 578.831 485.684 578.831 364.8C578.831 243.916 481.649 145.92 361.77 145.92Z" fill="#C8FF00"/></svg>',
};

const AG = FileManager.appGroupDocumentsDirectory;

export const OPENROUTER_LOCKUP_PATH = {
  light: Script.directory + "/image/openrouter-lockup-light.png",
  dark: Script.directory + "/image/openrouter-lockup-dark.png",
};

export const PROVIDER_LOGO_PATH: Record<
  Exclude<ProviderId, "generic">,
  LogoPathSource
> = {
  sub2api: AG + "/ai-relay-sub2api.png",
  newapi: AG + "/ai-relay-newapi.png",
  newapi_sub: AG + "/ai-relay-newapi.png",
  openrouter: {
    light: AG + "/ai-relay-openrouter-light.png",
    dark: AG + "/ai-relay-openrouter-dark.png",
  },
};

function hasLogoFile(src?: LogoPathSource): boolean {
  if (!src) return false;
  if (typeof src === "string") {
    if (FileManager.existsSync(src)) return true;
    try {
      const filename = src.split("/").pop()?.replace(/^ai-relay-/, "");
      if (filename) {
        const fallback = Script.directory + "/image/" + filename;
        if (FileManager.existsSync(fallback)) {
          FileManager.copyFileSync(fallback, src);
          return true;
        }
      }
    } catch {}
    return false;
  }
  return hasLogoFile(src.light) || hasLogoFile(src.dark);
}

/**
 * 站点 Logo，fallback 链：
 * 1. 自定义/版本化 favicon（faviconPath(providerId, logoVersion)）
 * 2. 旧版固定路径 favicon（兼容已有数据）
 * 3. 供应商官方 logo（OpenRouter 矢量 / 其他为 App Group 本地 PNG）
 * 4. 通用预设 → wand.and.stars SF Symbol
 */
export function Logo({
  size = 19,
  provider = "generic",
  providerId = "",
  logoVersion = 0,
  forceDefault = false,
}: {
  size?: number;
  provider?: ProviderId;
  providerId?: string;
  logoVersion?: number;
  forceDefault?: boolean;
}) {
  let inner: JSX.Element;
  const isOR = provider === "openrouter";
  const orWidth = size;
  const orHeight = Math.round((size / (1024 / 730)) * 10) / 10;

  if (!forceDefault) {
    const customPath =
      providerId && logoVersion > 0 ? faviconPath(providerId, logoVersion) : "";
    if (customPath && FileManager.existsSync(customPath)) {
      inner = logoImage(size, customPath);
    } else if (providerId && FileManager.existsSync(faviconPath(providerId))) {
      inner = logoImage(size, faviconPath(providerId));
    } else if (provider !== "generic") {
      const path = PROVIDER_LOGO_PATH[provider];
      if (hasLogoFile(path)) {
        inner = logoImage(size, path);
      } else if (isOR) {
        inner = openRouterSvg(orWidth, orHeight);
      } else {
        inner = fallbackSymbol(size);
      }
    } else {
      inner = fallbackSymbol(size);
    }
  } else if (provider !== "generic") {
    const path = PROVIDER_LOGO_PATH[provider];
    if (hasLogoFile(path)) {
      inner = logoImage(size, path);
    } else if (isOR) {
      inner = openRouterSvg(orWidth, orHeight);
    } else {
      inner = fallbackSymbol(size);
    }
  } else {
    inner = fallbackSymbol(size);
  }

  return (
    <HStack
      alignment="center"
      frame={{ width: size, height: size }}>
      {inner}
    </HStack>
  );
}

function openRouterSvg(width: number, height: number) {
  return (
    <SVG
      code={{
        light: OPENROUTER_SVG.light,
        dark: OPENROUTER_SVG.dark,
      }}
      resizable={true}
      scaleToFit={true}
      frame={{ width, height }}
    />
  );
}

/** 本地图片 logo */
function logoImage(size: number, filePath: LogoPathSource) {
  return (
    <Image
      resizable={true}
      scaleToFit={true}
      frame={{ width: size, height: size }}
      filePath={filePath}
    />
  );
}

function fallbackSymbol(size: number) {
  return (
    <Image
      systemName={"wand.and.stars"}
      accessibilityHidden={true}
      foregroundStyle={"secondaryLabel"}
      resizable={true}
      scaleToFit={true}
      frame={{ width: size, height: size }}
    />
  );
}

/** 页面/小组件通用的标题栏：Logo + 标题（靠左）+ 右上角独立状态圆点 */
export function Header({
  provider = "generic",
  status = "ok",
  title = "中转余额",
  providerId = "",
  showStatusDot = true,
  logoVersion = 0,
}: {
  provider?: ProviderId;
  status?: "ok" | "error";
  title?: string;
  providerId?: string;
  showStatusDot?: boolean;
  logoVersion?: number;
}) {
  const isOR = provider === "openrouter";
  if (isOR) {
    // OpenRouter 专属 Lockup：直接展示深浅自适应的完整官方品牌标识，高度 17pt，等比宽约 93pt
    return (
      <HStack spacing={6} alignment={"center"}>
        <Image
          filePath={OPENROUTER_LOCKUP_PATH}
          resizable={true}
          scaleToFit={true}
          frame={{ width: 93, height: 17 }}
        />
        <Spacer />
        {showStatusDot ? <StatusDot status={status} /> : null}
      </HStack>
    );
  }

  const size = 19;
  return (
    <HStack spacing={6} alignment={"center"}>
      <Logo
        size={size}
        provider={provider}
        providerId={providerId}
        logoVersion={logoVersion}
      />
      <Text font={"headline"} lineLimit={1} minScaleFactor={0.6}>
        {title}
      </Text>
      <Spacer />
      {showStatusDot ? <StatusDot status={status} /> : null}
    </HStack>
  );
}

/** 状态圆点：仅绿（正常）与红（异常） */
export function StatusDot({ status }: { status?: "ok" | "error" }) {
  const color = status === "error" ? "systemRed" : "systemGreen";
  return (
    <HStack
      frame={{ width: 6, height: 6 }}
      background={color}
      clipShape={{ type: "capsule", style: "continuous" }}
    />
  );
}
