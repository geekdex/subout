# 严格配置校验迁移指南

适用版本：v0.3 及之后启用了「所见即所得」严格校验的版本。

## 背景与影响范围

本版本起，配置生成与保存遵循一条硬规则：**程序只做旧格式到新格式的等价翻译，绝不代替用户做配置决定**。

此前运行时会自动补齐若干字段，导致「保存的配置」和「实际运行的配置」不一致。现在这些隐式注入全部移除，缺失字段会在**保存时报错并指名字段**，由用户自行补齐。

**谁需要迁移**：已保存且**依赖过以下自动补全**的配置。如果你的配置一直显式写好了所有字段，保存时不会出现新错误，无需改动。

快速自查：打开配置编辑器 → 点「保存配置」→ 看是否弹出字段错误。没有错误即已兼容。

---

## 一、已移除的隐式注入

以下行为已删除。表中「报错」即保存时会看到的提示，按「修复方式」改即可。

| 旧行为（已移除） | 现在的报错 | 修复方式 |
| :-- | :-- | :-- |
| 有 TUN 入站时，把缺 `server` 的 `type:"local"` DNS 服务器改写成 `udp` + `223.5.5.5` | `dns.servers[i].type: 使用 TUN 入站时 'local' DNS 会与隧道形成回环` | 改成明确的 upstream：`{"type":"udp","tag":"dns-local","server":"223.5.5.5"}`，或 `https` / `tls` 类型并填 `server` |
| 没有 `route.default_domain_resolver` 时，自动挑一个 DNS 服务器 tag 填进去 | `dns.servers[i].server: 该 DNS 服务器使用域名地址，但未配置 domain_resolver` | 在该 DNS 服务器条目上加 `domain_resolver`，或在 `route` 上加 `default_domain_resolver` |
| DNS 缺 `strategy` 时自动填 `prefer_ipv4` | Schema 不再补默认值 | 需要何种策略就显式写 `dns.strategy`（如 `prefer_ipv4` / `ipv4_only`） |
| fakeip 服务器缺 `inet4_range` / `inet6_range` 时自动补 `198.18.0.0/15` / `fc00::/18` | sing-box 校验：`at least one of inet4_range or inet6_range must be set` | 显式写地址段，例如 `"inet4_range":"198.18.0.0/15"` |
| 普通 DNS 规则引用 fakeip 服务器时自动加 `query_type:["A","AAAA"]` | 不再自动添加（该字段本身在新内核仍合法，只是不应由程序替你决定） | 需要限制查询类型时在规则里自己写 `query_type` |
| `log` 缺 `level` / `timestamp` 时自动填 `info` / `true` | 不再补默认值 | 显式写 `{"level":"info","timestamp":true}` |
| `route` 缺 `auto_detect_interface` 时自动填 `true` | 不再补默认值 | 需要时显式写 `route.auto_detect_interface` |
| Windows 把 `interface_name:"tun0"` 改成 `subout-tun`；macOS 删除非法 `interface_name` | `inbounds[i].interface_name: ...`（见「平台相关」） | 自己填平台正确的值 |

### 示例：local DNS 迁移

迁移前（依赖自动改写）：

```json
{
  "inbounds": [{ "type": "tun", "tag": "tun-in", "address": ["172.19.0.1/30"] }],
  "dns": { "servers": [{ "type": "local", "tag": "local" }] }
}
```

迁移后（显式 upstream）：

```json
{
  "inbounds": [{ "type": "tun", "tag": "tun-in", "address": ["172.19.0.1/30"] }],
  "dns": {
    "servers": [{ "type": "udp", "tag": "local", "server": "223.5.5.5" }]
  }
}
```

### 示例：域名地址的 DNS 服务器补 resolver

迁移前：

```json
{
  "dns": {
    "servers": [{ "type": "https", "tag": "remote", "server": "dns.example.com" }]
  }
}
```

迁移后（二选一）：

```json
{
  "dns": {
    "servers": [{
      "type": "https",
      "tag": "remote",
      "server": "dns.example.com",
      "domain_resolver": { "server": "bootstrap-dns" }
    }]
  }
}
```

或全局默认：

```json
{
  "dns": { "servers": [{ "type": "https", "tag": "remote", "server": "dns.example.com" }] },
  "route": { "default_domain_resolver": { "server": "bootstrap-dns" } }
}
```

参考：`sing-box-docs/configuration/dns/index.md`、`sing-box-docs/configuration/route/index.md`、`sing-box-docs/migration.zh.md`。

---

## 二、保留的旧格式翻译（这些不会报错）

以下属于**等价格式翻译**，仍会自动处理，并在保存后弹出「旧格式字段已等价转换」提示，仅作告知：

- `dns.independent_cache` 移除（1.14 起废弃，1.16 移除）。
- `experimental.cache_file.store_rdrc: true` → `store_dns: true`。
- legacy 特殊出站 `block` / `dns` → 路由规则 `action`：`reject` / `hijack-dns`。
- `detour:"direct"` 从 DNS 服务器、rule_set、`http_clients` 中移除（指向空 direct 会启动失败）。
- 逻辑 DNS 规则中父级叶子条件移入子规则，保持原意。

这些翻译是「同一个意思换成新写法」，不会新增你没配置的功能或服务器。

---

## 三、新增的语义校验（保存时拦截）

| 报错字段 | 含义 | 修复 |
| :-- | :-- | :-- |
| `dns.servers[i].type` | TUN + local DNS 回环 | 见上文「local DNS 迁移」 |
| `dns.servers[i].server` | 域名地址缺 resolver | 见上文示例 |
| `dns.servers[i].detour` | `detour` 不能为 `direct` | 移除该字段或改为实际出站 tag |
| `outbounds[i].outbounds` | 策略组成员为空 | 至少加一个成员，或删除该组 |
| `http_clients[i].detour` | 同上 | 移除 `detour` |
| `route.rule_set[i].download_detour` | 同上 | 移除该字段 |
| `inbounds[i].auto_redirect` | 仅 Linux 支持 | 非 Linux 平台关闭或移除 |
| `inbounds[i].netns` | 仅 Linux 支持 | 非 Linux 平台移除 |
| 规则中的 `process_name` / `package_name` 等 | 平台专属字段不匹配 | 按平台改用对应字段 |
| 任意 JSON 路径 | `同时匹配 N 个 oneOf 分支，配置有歧义` | 检查互斥字段，只保留一种写法 |
| `log.output` / `experimental.cache_file.path` | 只允许相对路径 | 改成相对路径，去掉 `..` 和盘符 |

---

## 四、平台相关变更

- **Windows**：`interface_name` 不再自动改写。若填了 `tun0`，会报 `inbounds[i].interface_name: Windows 平台 TUN 网卡不能命名为 'tun0'`，请改为 `subout-tun` 或留空由系统分配。
- **macOS**：`interface_name` 不再被静默删除。必须是 `utun` + 数字（如 `utun9`），否则报错；留空由系统分配。
- **Linux / Android**：未改动接口名处理；`auto_redirect`、`netns` 等平台专属字段仍按原规则校验。

---

## 五、推荐迁移步骤

1. **备份**：在配置编辑器里复制完整 JSON，或导出配置文件。
2. **试保存**：点「保存配置」，记录所有报错字段。
3. **逐项修正**：按本文表格定位字段，对照报错补上用户本就该配置的值（不要用「随便填一个」绕过）。
4. **重新校验并保存**：保存前右侧实时 JSON 预览就是最终内容，确认无遗漏。
5. **启动前确认**：保存成功后再启动服务；若 sing-box 仍报错，错误信息会指出具体字段，继续按报错修正。

> 提示：严格校验的目的就是让「你看到的」等于「运行的」。如果某个字段程序替你填了，你就有可能在不知情的情况下用了错误的 DNS、错误的策略组或不存在的出站——这正是本次改动要消除的。

---

## 六、常见问题

**Q：升级后配置打不开 / 保存报错，是不是数据丢了？**
A：不是。配置原文仍在数据库中，只是不再允许把不完整的配置存成「看起来能用」的样子。按报错补字段即可。

**Q：能不能恢复旧的自动补全？**
A：不能也不会。若确实需要某个默认值，请在配置里显式写出来；这是可预览、可审计的。

**Q：旧格式翻译弹窗还要点「我已知晓」吗？**
A：会弹出，但它现在只是告知「哪些旧写法被等价翻译」，不影响配置语义。真正的问题会在保存前被拦截，不会再出现「保存后才发现被改了」。

**Q：我用的是小白模式，会受影响吗？**
A：小白模式由界面生成完整配置，所需字段都已可见配置，通常无需迁移。若你手动改过生成后的 JSON，按本文检查对应字段即可。
