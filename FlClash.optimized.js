/*
 * FlClash / Mihomo — Perfect-Rules 覆写脚本（优化版）
 *
 * 与原版同架构，面板顺序：
 *   兜底分流 → 机场基础组(默认丢弃) → 服务组 → 地区组 → 国内直连
 *
 * 相对原版的改动见 FlClash.diff.md。核心是「单一数据源」：
 * 新增/删除一个服务或地区，只改 SERVICES / REGIONS 一处，
 * 图标表、管理组表、regionNodes、proxy-groups、rules 全部自动同步。
 */

// ============================================================
// 0. 可调参数（想回退到原版行为，改这里即可）
// ============================================================

const OPTIONS = {
  // 规则集下载出口。默认 DIRECT；若 jsdelivr 被拦，可改为 "兜底分流"
  // 注意：改成策略组时，首次启动（组尚未就绪）可能拉不到规则集。
  RULE_PROVIDER_PROXY: "DIRECT",

  // 兜底（MATCH）策略组名。规则末行与面板主卡片都用它。
  FALLBACK_GROUP: "兜底分流",

  // 直连域名 / 节点域名用国内 UDP 解析，避免「用需解析的 DoH 域名去解析节点域名」
  // 置 false 则回到原版的 DoH 写法。
  BOOTSTRAP_UDP: true,

  // DNS 监听地址：allow-lan=false 时无需 0.0.0.0
  DNS_LISTEN: "127.0.0.1:53",

  // TUN DNS 劫持：官方推荐 any:53，覆盖任意目标地址
  DNS_HIJACK: ["any:53"],

  // fake-ip 段。原版 172.19.0.1/16 与 tun inet4-address 172.19.0.1/30 重叠，
  // 改用 mihomo 默认段 198.18.0.1/16，彻底隔离。
  FAKE_IP_RANGE: "198.18.0.1/16",

  // 是否保留机场自带的基础组（自动选择 / 故障转移 / 全部节点）。
  // Perfect-Rules 已自建地区 url-test 组 + 服务组 + 兜底分流，
  // 规则里没有任何一条引用机场基础组，默认全部丢弃，面板只留本体系。
  // 置 true 则恢复原版的「保留机场基础组」行为。
  KEEP_AIRPORT_BASIC_GROUPS: false,

  // 精确丢弃名单（在 KEEP_AIRPORT_BASIC_GROUPS=true 时同样生效）。
  // 订阅品牌名的总选择器之类；置 [] 则不额外丢弃。
  DROP_GROUPS: ["极速机场"],

  // ---- 省流节点（订阅里带 x0.1 / | 0.1 / 【0.1】 等低倍率标记的节点）----
  // 拆分方式：
  //   "per-region" 每个国家各建一个「XX·省流」组，紧跟在该国家组后面（默认）
  //   "global"     汇总成一个「省流节点」组
  //   "off"        不拆分，全部混在地区组里（回到原行为）
  LOW_RATIO_MODE: "per-region",
  // 倍率 <= 该值才算省流。改成 0.99 可把 x0.5 / x0.8 也一并纳入。
  LOW_RATIO_MAX: 0.1,
  // per-region 组名模板，{region} 替换为地区名
  LOW_RATIO_NAME: "{region}·省流",
  // global 模式下的组名
  LOW_RATIO_GLOBAL_NAME: "省流节点",

  HEALTH: {
    url: "https://www.gstatic.com/generate_204",
    interval: 300,
    timeout: 5000,
    tolerance: 50,
    lazy: true,
    "max-failed-times": 3,
    // mihomo 要求字符串，原版写成数字 204 会被解析成 int
    "expected-status": "204"
  }
};

const ICON_BASE =
  "https://cdn.jsdelivr.net/gh/n0de-sudo/Perfect-Rules@main/Clash/icons/";
const RULE_BASE =
  "https://cdn.jsdelivr.net/gh/n0de-sudo/Perfect-Rules@main/Clash/rules/";

// ============================================================
// 1. 单一数据源：服务组（面板显示顺序）
//    provider 缺省时等于 name
// ============================================================

const SERVICES = [
  { name: "AI",        file: "ai.yaml",           icon: "AI.png" },
  { name: "YouTube",   file: "youtube.yaml",      icon: "YouTube.png" },
  { name: "Google",    file: "google.yaml",       icon: "Google.png" },
  { name: "GitHub",    file: "github.yaml",       icon: "GitHub.png" },
  { name: "Spotify",   file: "spotify.yaml",      icon: "Spotify.png" },
  { name: "Telegram",  file: "telegram.yaml",     icon: "Telegram.png" },
  { name: "TikTok",    file: "tiktok.yaml",       icon: "TikTok.png" },
  { name: "Apple",     file: "apple.yaml",        icon: "Apple.png" },
  { name: "Microsoft", file: "microsoft.yaml",    icon: "Microsoft.png" }
];

// RULE-SET 顺序。YouTube 必须在 Google 之前。
// 用不到的服务直接从 SERVICES 删掉即可，这里跟着删（或由脚本自动取交集）。
const RULE_ORDER = [
  "AI", "YouTube", "Google", "GitHub",
  "Spotify", "Telegram", "TikTok", "Apple", "Microsoft"
];

// ============================================================
// 2. 单一数据源：地区组（含图标 + 识别正则，末项为兜底）
// ============================================================

const REGIONS = [
  { name: "香港", icon: "Hong_Kong.png", patterns: [
    /香港/i, /\bHK\b/i, /HKG/i, /Hong\s*Kong/i ] },
  { name: "台湾", icon: "Taiwan.png", patterns: [
    /台湾|台灣/i, /\bTW\b/i, /TPE|KHH|TSA/i, /Taiwan|Taipei/i ] },
  { name: "日本", icon: "Japan.png", patterns: [
    /日本/i, /\bJP\b/i, /NRT|HND|KIX|CTS|FUK/i, /Japan|Tokyo|Osaka/i ] },
  { name: "新加坡", icon: "Singapore.png", patterns: [
    /新加坡/i, /\bSG\b/i, /SIN|XSP/i, /Singapore/i ] },
  { name: "韩国", icon: "Korea.png", patterns: [
    /韩国|韓國/i, /\bKR\b/i, /ICN|GMP|PUS/i, /Korea|Seoul/i ] },
  { name: "美国", icon: "United_States.png", patterns: [
    /美国/i, /\bUS\b|\bUSA\b/i, /LAX|SFO|JFK|SJC/i,
    /United\s*States|America|Los\s*Angeles|San\s*Jose|New\s*York/i ] },
  { name: "加拿大", icon: "Other.png", patterns: [
    /加拿大/i, /Canada|Toronto|Vancouver|Montreal/i ] },
  { name: "英国", icon: "Other.png", patterns: [
    /英国/i, /\bUK\b/i, /United\s*Kingdom|England|London|Manchester/i ] },
  { name: "其他地区", icon: "Other.png", patterns: [] }
];

const REGION_NAME_SET = Object.create(null);
REGIONS.forEach(function (r) { REGION_NAME_SET[r.name] = true; });

const TOP_GROUPS = [
  { name: OPTIONS.FALLBACK_GROUP, icon: "Proxy.png" },
  { name: "国内直连", icon: "China.png" }
];

// 由数据源自动生成，杜绝三处手工枚举不一致
const ICON_MAP = {};
const MANAGED = Object.create(null);
SERVICES.concat(REGIONS, TOP_GROUPS).forEach(function (g) {
  ICON_MAP[g.name] = ICON_BASE + g.icon;
  MANAGED[g.name] = true;
});

function iconOf(name) {
  return ICON_MAP[name];
}

// ============================================================
// 3. 常量表 / 判定函数
// ============================================================

const BUILTIN = Object.create(null);
["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL"]
  .forEach(function (t) { BUILTIN[t] = true; });

// 丢弃名单（来自 OPTIONS.DROP_GROUPS），同时用于清理其他组对它的引用
const DROP_SET = Object.create(null);
(Array.isArray(OPTIONS.DROP_GROUPS) ? OPTIONS.DROP_GROUPS : [])
  .forEach(function (n) { if (n) DROP_SET[n] = true; });

// 用单词边界，避免 /ai/i 误伤 Thailand、/UK/i 误伤 Ukraine
// 只用于识别「机场自带的业务组」，避免删服务后仍把它的同名组误判
const BUSINESS_PATTERNS = [
  /\bai\b|\bopenai\b|\bchatgpt\b|\bclaude\b|\bgemini\b/i,
  /youtube|google|github/i,
  /spotify|tiktok|telegram/i,
  /twitter|\bx\.com\b|facebook|instagram/i,
  /流媒体|媒体|影音|视频/i,
  /游戏|游戏专用/i,
  /机场专用|节点分流/i,
  /apple|microsoft/i
];

function isBusinessGroupName(name) {
  if (!name) return false;
  const text = String(name);
  return BUSINESS_PATTERNS.some(function (re) { return re.test(text); });
}

function isAutoSelectGroup(name) {
  if (!name) return false;
  return /自动选择|auto[\s_-]*select|auto[\s_-]*test|测速/i.test(String(name));
}

function isFailoverGroup(name) {
  if (!name) return false;
  return /故障转移|failover|fallback/i.test(String(name));
}

function isAllNodeName(name) {
  if (!name) return false;
  return /全部节点|所有节点|全部|all[\s_-]*nodes?|all[\s_-]*proxies?/i.test(String(name));
}

function detectRegion(proxyName) {
  const text = String(proxyName);
  for (let i = 0; i < REGIONS.length; i++) {
    const r = REGIONS[i];
    if (r.patterns.some(function (re) { return re.test(text); })) {
      return r.name;
    }
  }
  return REGIONS[REGIONS.length - 1].name; // 其他地区
}

// ============================================================
// 3.5 省流节点识别（低倍率标记）
//
// 覆盖机场常见写法：
//   美国洛杉矶1号 | x0.1      ← 截图里的格式
//   x0.1 / X0.1 / ×0.1 / x 0.1
//   0.1x / 0.1倍 / 0.1倍率 / 倍率:0.1
//   | 0.1 / ｜0.1 / 【0.1】 / [0.1] / (0.1)
//   省流 / 低倍率 / 低倍（中文语义兜底）
//
// 只认「带倍率语义」的片段，节点序号（如「洛杉矶1号」）、
// 延迟数字（194 ms）、IP 里的 0.1 都不会误判。
// ============================================================

const LOW_RATIO_PATTERNS = [
  /(?:^|[^A-Za-z0-9])[xX×]\s*(\d+(?:\.\d+)?)\b/, // x0.1 / ×0.1 / | x0.1
  /\b(\d+(?:\.\d+)?)\s*[xX×]\b/,              // 0.1x
  /\b(\d+(?:\.\d+)?)\s*倍(?:率)?/,            // 0.1倍 / 0.1倍率
  /倍率?\s*[:：]?\s*(\d+(?:\.\d+)?)/,         // 倍率:0.1 / 倍 0.1
  /[|｜]\s*(\d+(?:\.\d+)?)\s*(?=[|｜]|$|\s)/, // | 0.1 / |0.1|
  /[\[【(（]\s*(\d+(?:\.\d+)?)\s*[\]】)）]/   // 【0.1】 [0.1] (0.1)
];

const LOW_RATIO_KEYWORDS = /省流|低倍率|低倍/i;

function isLowRatioNode(name) {
  const text = String(name || "");
  for (let i = 0; i < LOW_RATIO_PATTERNS.length; i++) {
    const m = LOW_RATIO_PATTERNS[i].exec(text);
    if (m && parseFloat(m[1]) <= OPTIONS.LOW_RATIO_MAX) return true;
  }
  return LOW_RATIO_KEYWORDS.test(text);
}

function lowRatioName(region) {
  return String(OPTIONS.LOW_RATIO_NAME).replace("{region}", region);
}

function lowRatioEnabled() {
  return OPTIONS.LOW_RATIO_MODE === "per-region" ||
         OPTIONS.LOW_RATIO_MODE === "global";
}

// ============================================================
// 4. 主函数
// ============================================================

const main = (config) => {

  config = config || {};

  // ---------- 4.1 基础配置 ----------
  config["mixed-port"] = 7890;
  config["mode"] = "rule";
  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;
  config["log-level"] = "error";
  config["ipv6"] = false;                 // 防止 IPv4/IPv6 出口不一致
  config["allow-lan"] = false;
  config["find-process-mode"] = "always";
  config["keep-alive-interval"] = 30;
  config["keep-alive-idle"] = 30;
  config["disable-keep-alive"] = false;
  config["profile"] = {
    "store-selected": true,
    "store-fake-ip": true
  };

  // ---------- 4.2 DNS ----------
  const bootstrap = OPTIONS.BOOTSTRAP_UDP
    ? ["223.5.5.5", "119.29.29.29"]
    : ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"];

  config["dns"] = {
    "enable": true,
    "listen": OPTIONS.DNS_LISTEN,
    "prefer-h3": false,
    "ipv6": false,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": OPTIONS.FAKE_IP_RANGE,
    "fake-ip-filter": [
      "+.lan", "+.local", "+.localhost", "+.home.arpa",
      "time.*.com", "time.*.gov", "pool.ntp.org",
      "+.push.apple.com",
      "mesu.apple.com", "swscan.apple.com", "captive.apple.com",
      "connectivitycheck.gstatic.com",
      "connectivitycheck.android.com",
      "www.msftconnecttest.com", "www.msftncsi.com"
    ],
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
    "nameserver": [
      "https://dns.alidns.com/dns-query",
      "https://doh.pub/dns-query"
    ],
    "nameserver-policy": {
      // 原版漏了 geosite: 前缀，这条策略永远不生效
      "geosite:cn": [
        "https://dns.alidns.com/dns-query",
        "https://doh.pub/dns-query"
      ],
      "geosite:private": [
        "https://dns.alidns.com/dns-query",
        "https://doh.pub/dns-query"
      ],
      "geosite:geolocation-!cn": [
        "https://cloudflare-dns.com/dns-query",
        "https://dns.google/dns-query"
      ]
    },
    "proxy-server-nameserver": bootstrap.slice(),
    "direct-nameserver": bootstrap.slice(),
    "fallback": [
      "https://cloudflare-dns.com/dns-query",
      "https://dns.google/dns-query"
    ],
    "fallback-filter": {
      "geoip": true,
      "geoip-code": "CN",
      "geosite": ["gfw"],
      "domain": [
        "+.google.com", "+.googleapis.com", "+.googlevideo.com",
        "+.youtube.com", "+.github.com", "+.openai.com",
        "+.chatgpt.com", "+.anthropic.com", "+.claude.ai"
      ]
    }
  };

  // ---------- 4.3 TUN ----------
  config["tun"] = {
    "enable": true,
    "device": "FlClash",
    "stack": "gvisor",
    "dns-hijack": OPTIONS.DNS_HIJACK.slice(),
    "auto-route": true,
    "auto-detect-interface": false,
    "strict-route": true,
    "mtu": 1280,
    "inet4-address": ["172.19.0.1/30"],
    "auto-redirect": false,
    "disable-icmp-forwarding": true
  };

  // ---------- 4.4 Sniffer / NTP ----------
  config["sniffer"] = {
    "enable": true,
    "parse-pure-ip": true,
    "force-dns-mapping": true,
    "override-destination": true,
    "sniff": {
      "HTTP": { "ports": [80, "8080-8880"] },
      "TLS":  { "ports": [443, 8443] },
      "QUIC": { "ports": [443, 8443] }
    },
    "skip-domain": ["+.push.apple.com", "+.mijia.cloud"]
  };

  config["ntp"] = {
    "enable": true,
    "write-to-system": false,
    "server": "time.apple.com",
    "port": 123,
    "interval": 30
  };

  // ---------- 4.5 读取机场原始数据 ----------
  const originalProxies = Array.isArray(config["proxies"])
    ? config["proxies"] : [];
  const originalGroups = Array.isArray(config["proxy-groups"])
    ? config["proxy-groups"] : [];

  // 去重，避免订阅里重复节点名进入 url-test
  const proxyNames = [];
  const proxyNameSet = Object.create(null);
  originalProxies.forEach(function (p) {
    if (p && p.name && !proxyNameSet[p.name]) {
      proxyNameSet[p.name] = true;
      proxyNames.push(p.name);
    }
  });

  const originalGroupNames = Object.create(null);
  originalGroups.forEach(function (g) {
    if (g && g.name) originalGroupNames[g.name] = true;
  });

  // ---------- 4.6 组构成分析（判断机场「全部节点」组） ----------
  function composition(group) {
    const r = { total: 0, nodes: 0, groups: 0, builtin: 0, unknown: 0 };
    if (!group || !Array.isArray(group.proxies)) return r;
    r.total = group.proxies.length;
    group.proxies.forEach(function (item) {
      if (!item) return;
      if (proxyNameSet[item]) { r.nodes++; }
      else if (BUILTIN[item]) { r.builtin++; }
      else if (originalGroupNames[item]) { r.groups++; }
      else { r.unknown++; }
    });
    return r;
  }

  function isAllNodesGroup(group) {
    if (!group || !group.name) return false;
    const name = String(group.name);
    if (isAllNodeName(name)) return true;
    if (isBusinessGroupName(name)) return false;

    const c = composition(group);
    if (c.total === 0 || c.nodes < 2) return false;
    if (c.nodes / c.total < 0.3) return false;
    if (c.groups > 0) return c.nodes >= 5;
    return true;
  }

  // ---------- 4.6.5 地区节点分组（提前算，供 4.7 校验引用用） ----------
  // 每个地区拆成两份：普通节点 / 省流节点（低倍率标记）。
  // 用 4.5 去重后的 proxyNames 遍历，顺带避免重复节点进入 url-test。
  const regionNodes = {};
  const lowRegionNodes = {};
  REGIONS.forEach(function (r) {
    regionNodes[r.name] = [];
    lowRegionNodes[r.name] = [];
  });
  proxyNames.forEach(function (name) {
    const region = detectRegion(name);
    if (lowRatioEnabled() && isLowRatioNode(name)) {
      lowRegionNodes[region].push(name);
    } else {
      regionNodes[region].push(name);
    }
  });

  // 会生成的「普通地区组」名（普通节点非空才建组）
  const generatedRegionNames = REGIONS
    .filter(function (r) { return regionNodes[r.name].length > 0; })
    .map(function (r) { return r.name; });

  // 会生成的「省流组」名
  const generatedLowGroupNames = [];
  if (OPTIONS.LOW_RATIO_MODE === "per-region") {
    REGIONS.forEach(function (r) {
      if (lowRegionNodes[r.name].length > 0) {
        generatedLowGroupNames.push(lowRatioName(r.name));
      }
    });
  } else if (OPTIONS.LOW_RATIO_MODE === "global") {
    const total = REGIONS.reduce(function (n, r) {
      return n + lowRegionNodes[r.name].length;
    }, 0);
    if (total > 0) generatedLowGroupNames.push(OPTIONS.LOW_RATIO_GLOBAL_NAME);
  }

  // ---------- 4.7 保留机场基础组（自动选择 / 故障转移 / 全部节点） ----------
  const preservedGroups = [];
  const preservedNames = Object.create(null);

  if (OPTIONS.KEEP_AIRPORT_BASIC_GROUPS) {
    originalGroups.forEach(function (group) {
      if (!group || !group.name || MANAGED[group.name] || DROP_SET[group.name]) return;
      const isBasic = isAutoSelectGroup(group.name) ||
                      isFailoverGroup(group.name) ||
                      isAllNodesGroup(group);
      if (!isBasic || preservedNames[group.name]) return;

      preservedNames[group.name] = true;
      preservedGroups.push(group);
    });
  }

  // 所有「未保留」的机场原始组（含被 DROP_GROUPS 命中、被 KEEP=false
  // 整体丢弃、以及本来就非基础组的「XX 专用」之类），成员记录下来
  // 供递归展开引用，避免「删掉品牌总选择组 → 引用它的组只剩 DIRECT」。
  const droppedMembers = Object.create(null);
  const originalGroupMap = Object.create(null);
  originalGroups.forEach(function (g) {
    if (g && g.name) originalGroupMap[g.name] = g;
  });
  Object.keys(originalGroupMap).forEach(function (n) {
    const g = originalGroupMap[n];
    if (!preservedNames[n] && Array.isArray(g.proxies)) {
      droppedMembers[n] = g.proxies.slice();
    }
  });

  // 所有最终会存在的组名，用于清理机场组里的悬空引用。
  // 注意：地区组只有「有节点」才生成，不能把 REGIONS 全名当合法目标。
  const validGroupNames = Object.create(null);
  Object.keys(MANAGED).forEach(function (n) {
    if (!REGION_NAME_SET[n] || generatedRegionNames.indexOf(n) !== -1) {
      validGroupNames[n] = true;
    }
  });
  generatedLowGroupNames.forEach(function (n) { validGroupNames[n] = true; });
  Object.keys(preservedNames).forEach(function (n) { validGroupNames[n] = true; });

  // 递归展开：指向被丢弃组 → 展开成它原本的成员（可能又是另一个被丢弃组，
  // 用 seen 防循环 + 去重）；指向节点/内置目标/最终组名 → 保留；其余 → 删除。
  function expand(items, seen) {
    const out = [];
    items.forEach(function (item) {
      if (!item || seen[item]) return;
      if (droppedMembers[item]) {
        seen[item] = true;
        expand(droppedMembers[item], seen).forEach(function (p) { out.push(p); });
      } else if (proxyNameSet[item] || BUILTIN[item] || validGroupNames[item]) {
        seen[item] = true;
        out.push(item);
      }
    });
    return out;
  }

  function sanitize(group) {
    // 深拷贝，避免任何嵌套字段反向污染机场原始配置
    const copy = JSON.parse(JSON.stringify(group));

    if (Array.isArray(copy.proxies)) {
      copy.proxies = expand(copy.proxies, Object.create(null));
      if (copy.proxies.length === 0) copy.proxies = ["DIRECT"];
    }

    delete copy["hidden"]; // 保留机场组可见
    return copy;
  }

  const cleanPreserved = preservedGroups.map(sanitize);

  // 自动选择组统一转 url-test（原版第 17 步；此处顺带合并冗余的二次过滤）
  cleanPreserved.forEach(function (group) {
    if (!isAutoSelectGroup(group.name)) return;
    group.type = "url-test";
    group.proxies = proxyNames.length ? proxyNames.slice() : ["DIRECT"];
    Object.keys(OPTIONS.HEALTH).forEach(function (k) {
      group[k] = OPTIONS.HEALTH[k];
    });
    delete group["disable-udp"];
    delete group["strategy"];
  });

  // ---------- 4.8 远程规则集 ----------
  config["rule-providers"] = {};
  SERVICES.forEach(function (s) {
    const provider = s.provider || s.name;
    config["rule-providers"][provider] = {
      "type": "http",
      "behavior": "classical",
      "format": "yaml",
      "url": RULE_BASE + s.file,
      "path": "./rules/" + s.file,
      "interval": 86400,
      "proxy": OPTIONS.RULE_PROVIDER_PROXY
    };
  });

  // ---------- 4.9 地区节点分组 + 省流组（节点清单已在 4.6.5 生成） ----------
  function urlTestGroup(name, nodes, icon) {
    const group = {
      "name": name,
      "type": "url-test",
      "proxies": nodes
    };
    if (icon) group["icon"] = icon;
    Object.keys(OPTIONS.HEALTH).forEach(function (k) {
      group[k] = OPTIONS.HEALTH[k];
    });
    return group;
  }

  // 面板顺序：普通地区组 → 紧跟该地区的「省流」组 → 下一个地区
  const regionGroups = [];
  REGIONS.forEach(function (r) {
    const normal = regionNodes[r.name];
    if (normal.length > 0) {
      regionGroups.push(urlTestGroup(r.name, normal, iconOf(r.name)));
    }
    const low = lowRegionNodes[r.name];
    if (low.length > 0 && OPTIONS.LOW_RATIO_MODE === "per-region") {
      regionGroups.push(urlTestGroup(lowRatioName(r.name), low, iconOf(r.name)));
    }
  });

  // global 模式：汇总所有省流节点成一个组，放在地区组之后
  if (OPTIONS.LOW_RATIO_MODE === "global") {
    const allLow = [];
    REGIONS.forEach(function (r) {
      lowRegionNodes[r.name].forEach(function (n) { allLow.push(n); });
    });
    if (allLow.length > 0) {
      regionGroups.push(urlTestGroup(OPTIONS.LOW_RATIO_GLOBAL_NAME, allLow));
    }
  }

  const availableRegions = regionGroups.map(function (g) { return g.name; });

  // ---------- 4.10 顶层组 / 服务组 ----------
  function selector(name, proxies) {
    const g = { "name": name, "type": "select", "proxies": proxies };
    const icon = iconOf(name);
    if (icon) g["icon"] = icon;
    return g;
  }

  const targets = availableRegions.concat(["国内直连"]);
  const domesticDirectGroup = selector("国内直连", ["DIRECT"]);
  const fallbackGroup = selector(OPTIONS.FALLBACK_GROUP, targets.concat());
  const businessGroups = SERVICES.map(function (s) {
    return selector(s.name, targets.concat());
  });

  // 兜底分流放面板第一位；其余保持原顺序
  config["proxy-groups"] = [fallbackGroup]
    .concat(cleanPreserved)
    .concat(businessGroups)
    .concat(regionGroups)
    .concat([domesticDirectGroup]);

  // ---------- 4.11 路由规则 ----------
  const serviceByName = {};
  SERVICES.forEach(function (s) { serviceByName[s.name] = s; });

  const rules = [
    "DOMAIN-SUFFIX,lan,DIRECT",
    "DOMAIN-SUFFIX,local,DIRECT",
    "DOMAIN-SUFFIX,localhost,DIRECT",
    "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
    "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve"
  ];

  RULE_ORDER.forEach(function (name) {
    const s = serviceByName[name];
    if (s) rules.push("RULE-SET," + (s.provider || s.name) + "," + name);
  });

  config["rules"] = rules.concat([
    "GEOSITE,private,国内直连",
    "GEOIP,private,国内直连,no-resolve",
    "GEOSITE,cn,国内直连",
    "GEOIP,cn,国内直连,no-resolve",
    "MATCH," + OPTIONS.FALLBACK_GROUP
  ]);

  return config;
};

// FlClash 里 module 未定义；仅在 Node/CommonJS 下导出，便于离线验证
// 注意：这行留在最末尾，FlClash 只取 main，不受影响
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    main: main,
    __debug: {
      isBusinessGroupName: isBusinessGroupName,
      isLowRatioNode: isLowRatioNode,
      detectRegion: detectRegion,
      SERVICES: SERVICES,
      REGIONS: REGIONS,
      OPTIONS: OPTIONS
    }
  };
}
