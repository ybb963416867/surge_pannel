/**
 * 多 AI 节点环境监测面板 v3.0 (Surge Panel)
 * 支持：ChatGPT / Gemini / Claude
 * 检测：IP · 归属地 · 运营商 · 类型 · 风险 · 纯净度
 *
 * ── Surge 配置 ────────────────────────────────────────
 * [Script]
 * ai-panel = type=generic,script-path=ai-check.js,timeout=30
 *
 * [Panel]
 * AI-Status = script-name=ai-panel,update-interval=3600,title=AI节点监测
 * ─────────────────────────────────────────────────────
 *
 * ── 工作原理 ──────────────────────────────────────────
 * 原脚本三个 AI 共用一条 ip-api 请求，IP 永远相同。
 * 本脚本通过 X-Surge-Policy 请求头，把每条 ip-api 请求
 * 分别绑定到对应 AI 的策略组，精准获取各自出口 IP。
 * 若策略组不存在，自动回退到"先触发分流再查IP"模式。
 * ─────────────────────────────────────────────────────
 */

!(async () => {

  // ┌──────────────────────────────────────────────────┐
  // │  ★ 配置区：把策略组名改成你 Surge 里实际的名称    │
  // └──────────────────────────────────────────────────┘
  const POLICY_GPT    = "ChatGPT";  // ChatGPT 策略组
  const POLICY_GEMINI = "Gemini";   // Gemini  策略组
  const POLICY_CLAUDE = "Claude";   // Claude  策略组
  const TIMEOUT       = 8000;       // 超时（毫秒）

  // ── 检测目标 ───────────────────────────────────────
  const targets = [
    {
      name:    "ChatGPT",
      icon:    "🤖",
      policy:  POLICY_GPT,
      // cdn-cgi/trace 返回 Cloudflare 边缘信息，HTTP 200 即可达
      testUrl: "https://chatgpt.com/cdn-cgi/trace",
    },
    {
      name:    "Gemini",
      icon:    "✨",
      policy:  POLICY_GEMINI,
      testUrl: "https://gemini.google.com/",
    },
    {
      name:    "Claude",
      icon:    "🔮",
      policy:  POLICY_CLAUDE,
      // 未登录返回 401，但流量已到达服务器，视为可达
      testUrl: "https://claude.ai/api/auth/current-user",
    },
  ];

  // ── 国旗 Emoji（ISO 3166-1 alpha-2 → Regional Indicator）──
  function getFlag(cc) {
    if (!cc || cc.length !== 2) return "";
    return String.fromCodePoint(
        ...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
    ) + " ";
  }  // ← 修复1：原版此处缺少 }

  // ── 数据中心关键词（覆盖 30+ 主流云厂商/机房）────────
  const DC_RE = /google|aws|amazon|azure|microsoft|cloudflare|alibaba|tencent|digitalocean|linode|vultr|oracle|ovh|hetzner|contabo|leaseweb|serverius|choopa|psychz|multacom|zenlayer|cogent|lumen|hurricane|he\.net|buyvm|frantech|quadranet|reliablesite|sharktech|steadfast|nexeon|hostwinds|datacamp|m247|servers\.com/i;

  // ── IP 类型识别 ────────────────────────────────────
  // 优先使用 ip-api 的 hosting / proxy / mobile 布尔字段
  // 再用 ISP 关键词兜底判断数据中心
  function detectType(d) {
    const str = (d.isp || "") + " " + (d.org || "");
    if (d.mobile)                        return { label: "📱 移动网络", key: "mobile" };
    if (d.proxy)                         return { label: "🔀 代理/VPN", key: "proxy"  };
    if (d.hosting || DC_RE.test(str))    return { label: "🏢 数据中心", key: "dc"     };
    return                                      { label: "🏠 住宅宽带", key: "res"    };
  }  // ← 修复2：原版此处缺少 }

  // ── 风险 & 纯净度评分 ──────────────────────────────
  const RISK_MAP = {
    res:    { risk: "低 ✅",  score: 95 },
    mobile: { risk: "低 ✅",  score: 85 },
    proxy:  { risk: "中 ⚡", score: 50 },
    dc:     { risk: "高 ⚠️", score: 25 },
  };

  // ── 核心：检测单个 AI ──────────────────────────────
  async function checkOne(t) {

    // 1. 可达性检测
    let reachable = false;
    try {
      const r = await $.http.get({
        url:     t.testUrl,
        timeout: TIMEOUT,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const s = r.status || 0;
      reachable = s >= 200 && s < 500;  // 200~499 均视为可达
    } catch (_) {}

    // 2. 主方案：X-Surge-Policy 精准绑定策略组查 IP
    let d = null;
    try {
      const res = await $.http.get({
        url:     "http://ip-api.com/json/?lang=zh-CN&fields=61439",
        timeout: TIMEOUT,
        headers: { "X-Surge-Policy": t.policy },
      });
      const j = JSON.parse(res.body);
      if (j && j.status !== "fail") d = j;
    } catch (_) {}

    // 3. 回退方案：先触发分流域名，再立即查 IP
    if (!d) {
      try {
        await $.http.get({ url: t.testUrl, timeout: TIMEOUT }).catch(() => {});
        const res = await $.http.get({
          url:     "http://ip-api.com/json/?lang=zh-CN&fields=61439",
          timeout: TIMEOUT,
        });
        const j = JSON.parse(res.body);
        if (j && j.status !== "fail") d = j;
      } catch (_) {}
    }  // ← 修复3：原版此处缺少 }（回退 if 块未闭合）

    // 4. IP 信息获取失败
    if (!d) {
      return {
        name: t.name, icon: t.icon, reachable, ok: false,
        ip: "获取失败", loc: "—", isp: "—",
        type: "—", risk: "—", score: 0,
      };
    }  // ← 修复4：原版此处缺少 }

    // 5. 整理字段
    const { label: typeLabel, key } = detectType(d);
    const { risk, score } = RISK_MAP[key] || { risk: "未知", score: 0 };

    // 归属地（省市相同时自动去重）
    const flag    = getFlag(d.countryCode || "");
    const country = d.country    || "";
    const region  = d.regionName || "";
    const city    = d.city       || "";
    const loc = [flag + country, region !== city ? region : "", city]
        .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    // ISP 超长截断（面板宽度有限）
    let isp = d.isp || d.org || "—";
    if (isp.length > 28) isp = isp.slice(0, 26) + "…";

    return {
      name: t.name, icon: t.icon, reachable, ok: true,
      ip: d.query || "—", loc, isp, type: typeLabel, risk, score,
    };

  }  // ← 修复5：原版 checkOne 函数末尾缺少 }

  // ── 三个 AI 并行检测 ───────────────────────────────
  const results = await Promise.all(targets.map(t => checkOne(t)));

  // ── 组装面板内容 ───────────────────────────────────
  const SEP   = "┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄";
  const lines = [];

  results.forEach((r, i) => {
    lines.push(`${r.icon} ${r.name}   ${r.reachable ? "✅ 可用" : "❌ 不可用"}`);
    if (r.ok) {
      lines.push(`  IP    : ${r.ip}`);
      lines.push(`  归属  : ${r.loc}`);
      lines.push(`  运营商: ${r.isp}`);
      lines.push(`  类型  : ${r.type}`);
      lines.push(`  风险  : ${r.risk}   纯净度: ${r.score}/100`);
    } else {
      lines.push(`  IP 信息获取失败`);
    }  // ← 修复6：原版 else 块缺少 }
    if (i < results.length - 1) lines.push(SEP);
  });

  // 更新时间戳
  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  lines.push("");
  lines.push(`🕐 ${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`);

  $.done({ title: "🌐 AI 节点监测", content: lines.join("\n") });

})();
