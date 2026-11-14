/*
 * FlClash / Mihomo — Perfect-Rules 覆写脚本（优化版）
 *
 * 与原版 100% 同架构：
 *   机场基础组 → Perfect-Rules 服务组 → 地区组 → 国内直连 → 一键代理
 *
 * 相对原版的改动见 FlClash.diff.md。核心是「单一数据源」：
 * 新增/删除一个服务或地区，只改 SERVICES / REGIONS 一处，
 * 图标表、管理组表、regionNodes、proxy-groups、rules 全部自动同步。
 */

// ============================================================
// 0. 可调参数（想回退到原版行为，改这里即可）
// ============================================================

const OPTIONS = {
  // 规则集下载出口。默认 DIRECT；若 jsdelivr 被拦，可改为 "一键代理"
  // 注意：改成策略组时，首次启动（组尚未就绪）可能拉不到规则集。
  RULE_PROVIDER_PROXY: "DIRECT",

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
  { name: "Netflix",   file: "netflix.yaml",      icon: "Netflix.png" },
  { name: "Spotify",   file: "spotify.yaml",      icon: "Spotify.png" },
  { name: "Steam",     file: "steam.yaml",        icon: "Steam.png" },
  { name: "Telegram",  file: "telegram.yaml",     icon: "Telegram.png" },
  { name: "TikTok",    file: "tiktok.yaml",       icon: "TikTok.png" },
  { name: "Apple",     file: "apple.yaml",        icon: "Apple.png" },
  { name: "Microsoft", file: "microsoft.yaml",    icon: "Microsoft.png" },
  { name: "网络检测",   file: "network-test.yaml", icon: "Network-test.png", provider: "NetworkTest" }
];

// RULE-SET 顺序。NetworkTest 置顶、YouTube 必须在 Google 之前。
const RULE_ORDER = [
  "网络检测", "AI", "YouTube", "Google", "GitHub", "Netflix",
  "Spotify", "Steam", "Telegram", "TikTok", "Apple", "Microsoft"
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
  { name: "一键代理", icon: "Proxy.png" },
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

// 用单词边界，避免 /ai/i 误伤 Thailand、/UK/i 误伤 Ukraine
const BUSINESS_PATTERNS = [
  /\bai\b|\bopenai\b|\bchatgpt\b|\bclaude\b|\bgemini\b/i,
  /netflix|disney|disney\+/i,
  /youtube|google|github/i,
  /spotify|steam|tiktok|telegram/i,
  /twitter|\bx\.com\b|facebook|instagram/i,
  /流媒体|媒体|影音|视频/i,
  /游戏|游戏专用/i,
  /机场专用|节点分流/i
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
  const regionNodes = {};
  REGIONS.forEach(function (r) { regionNodes[r.name] = []; });
  originalProxies.forEach(function (p) {
    if (p && p.name) regionNodes[detectRegion(p.name)].push(p.name);
  });
  // 只有实际存在节点的地区才会建组
  const generatedRegionNames = REGIONS
    .filter(function (r) { return regionNodes[r.name].length > 0; })
    .map(function (r) { return r.name; });

  // ---------- 4.7 保留机场基础组（自动选择 / 故障转移 / 全部节点） ----------
  const preservedGroups = [];
  const preservedNames = Object.create(null);

  originalGroups.forEach(function (group) {
    if (!group || !group.name || MANAGED[group.name]) return;
    const isBasic = isAutoSelectGroup(group.name) ||
                    isFailoverGroup(group.name) ||
                    isAllNodesGroup(group);
    if (!isBasic || preservedNames[group.name]) return;

    preservedNames[group.name] = true;
    preservedGroups.push(group);
  });

  // 所有最终会存在的组名，用于清理机场组里的悬空引用。
  // 注意：地区组只有「有节点」才生成，不能把 REGIONS 全名当合法目标。
  const validGroupNames = Object.create(null);
  Object.keys(MANAGED).forEach(function (n) {
    if (!REGION_NAME_SET[n] || generatedRegionNames.indexOf(n) !== -1) {
      validGroupNames[n] = true;
    }
  });
  Object.keys(preservedNames).forEach(function (n) { validGroupNames[n] = true; });

  function sanitize(group) {
    // 深拷贝，避免任何嵌套字段反向污染机场原始配置
    const copy = JSON.parse(JSON.stringify(group));

    // 悬空引用：指向既不是节点、不是内置目标、也不是最终组名的项 → 删除
    if (Array.isArray(copy.proxies)) {
      copy.proxies = copy.proxies.filter(function (item) {
        return item && (proxyNameSet[item] || BUILTIN[item] || validGroupNames[item]);
      });
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

  // ---------- 4.9 地区节点分组（节点清单已在 4.6.5 生成） ----------
  const regionGroups = [];
  REGIONS.forEach(function (r) {
    const nodes = regionNodes[r.name];
    if (!nodes || nodes.length === 0) return;   // 空地区不建组
    const group = {
      "name": r.name,
      "type": "url-test",
      "proxies": nodes,
      "icon": iconOf(r.name)
    };
    Object.keys(OPTIONS.HEALTH).forEach(function (k) {
      group[k] = OPTIONS.HEALTH[k];
    });
    regionGroups.push(group);
  });

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
  const mainSelector = selector("一键代理", targets.concat());
  const businessGroups = SERVICES.map(function (s) {
    return selector(s.name, targets.concat());
  });

  config["proxy-groups"] = cleanPreserved
    .concat(businessGroups)
    .concat(regionGroups)
    .concat([domesticDirectGroup, mainSelector]);

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
    "MATCH,一键代理"
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
      detectRegion: detectRegion,
      SERVICES: SERVICES,
      REGIONS: REGIONS,
      OPTIONS: OPTIONS
    }
  };
}
