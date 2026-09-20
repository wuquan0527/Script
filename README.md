# AI Relay Usage（中转站用量小组件 · 增强版）

基于 [hsingyin/Script](https://github.com/hsingyin/Script) 的 `AI Relay Usage.scripting` 改造：
在原有「余额」基础上，小组件直接显示中转站的**已用金额**、**请求次数**与**今日签到状态**。

> 改造思路参考了 [StarYunLee/Scripting · AI Usage](https://github.com/StarYunLee/Scripting/tree/main/AI%20Usage) 的三色预警进度条观感（该项目只覆盖 Codex / Claude / Cursor 等订阅平台，不含中转站接口逻辑）。

当前版本：`1.2.0`

## 功能

- **余额 / 已用金额 / 请求次数 / 今日签到** 一屏展示
- **已用占比进度条**：≥85% 红、≥60% 橙、其余绿
- **签到徽标**：已签到绿色实心印章，未签到橙色空心印章
- 支持 Small / Medium / 圆形 / 锁屏内联 全部尺寸
- App 内用量卡片同步显示已用金额、请求次数、今日与本月签到、进度条
- 保留原版的缓存回退、2.5 秒超时降级、自定义站点 Logo 等机制

## 数据来源

| 指标 | 接口 | 字段 |
|---|---|---|
| 余额 | `GET /api/user/self` | `data.quota` ÷ 500000 |
| 已用金额 | `GET /api/user/self` | `data.used_quota` ÷ 500000 |
| 请求次数 | `GET /api/user/self` | `data.request_count` |
| 请求次数（回退） | `GET /api/log/self?p=1&page_size=1` | `data.total` |
| 今日签到（new-api） | `GET /api/user/checkin?month=YYYY-MM` | `data.stats.checked_in_today` |
| 今日签到（Veloera） | `GET /api/user/check_in_status` | `data.can_check_in`（`false` 表示已签到） |

- 额度单位：New API / one-api 谱系 `500000` 额度 = `1` 美元。
- 旧版 one-api 无 `request_count` 字段，自动回退到日志分页条数；两者都不可用时显示 `--`。
- 签到按 new-api → Veloera 顺序探测，两者都没有（或站点未启用签到）时该行自动隐藏，不影响其余展示。
- 已用占比：有总额时用 `used / total`；只有「余额 + 已用」时用 `used / (used + remaining)` 推导总充值额度。

## 安装

1. 下载 [`Scripting/AI Relay Usage.scripting`](Scripting/AI%20Relay%20Usage.scripting)。
2. 用 Scripting App 打开导入。
3. 运行一次脚本刷新缓存（旧缓存无次数字段，会先显示 `--`）。
4. 重新添加主屏幕小组件，使其套用新版时间线。

## 小组件排版

```
[logo] 站点名                  ●
──────────────────────────────
余额
$ 12.34
▓▓▓▓▓▓░░░░░░░░░░░░           ← 已用占比三色进度条
已用 $3.21        请求 128 次
✔ 今日已签到      更新于 09/20 17:00
```

- **Medium**：余额（含总额）/ 已用（含占比）/ 请求次数 三栏 + 进度条 + 底部签到徽标
- **圆形**：环形「已用占比」（无总额时退化为已用金额）
- **锁屏内联**：`余额 $x · 已用 $y · N 次 · 已签到`

## 自己重新打包

源码在 `source/`，改完在仓库根目录执行：

```sh
sh source/build.sh   # 产物输出到 dist/
```

打包脚本用 `python3 zipfile` 生成 `.scripting`（`.scripting` 本质就是 zip 包）。

## 注意

- 本包已**移除** `script.json` 中的 `remoteResource` 字段，避免被上游仓库按小时自动更新覆盖回旧版。
  如需自动更新，请把该字段指向本仓库的 raw 地址并填入正确 hash。
- 小组件为拿到签到状态会额外发起 1 次请求（与余额请求并发，不显著增加耗时）。
- OpenRouter 的 `/api/v1/key` 不返回请求次数与签到信息，对应项显示 `--` / 隐藏。
- 旧版 one-api 若关闭日志查询权限，请求次数同样显示 `--`。

## 已知限制

- 上次刷新失败时展示本地缓存，金额、次数与签到状态为上一次成功值。
- 仅适配 Scripting App 支持的小组件尺寸。
