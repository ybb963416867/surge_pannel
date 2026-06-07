!(async () => {

  const TIMEOUT = 8000;

  const targets = [
    { name: "ChatGPT", icon: "🤖", testUrl: "https://chatgpt.com/cdn-cgi/trace" },
    { name: "Gemini",  icon: "✨", testUrl: "https://gemini.google.com/" },
    { name: "Claude",  icon: "🔮", testUrl: "https://claude.ai/api/auth/current-user" },
  ];

  function getFlag(cc) {
    if (!cc || cc.length !== 2) return "";
    return String.fromCodePoint(
        ...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
    ) + " ";
  }

  const DC_RE = /google|aws|amazon|azure|microsoft|cloudflare|alibaba|tencent|digitalocean|linode|vultr|oracle|ovh|hetzner|contabo|leaseweb|serverius|choopa|psychz|multacom|zenlayer|cogent|lumen|hurricane|he\.net|buyvm|frantech|quadranet|reliablesite|sharktech|steadfast|nexeon|hostwinds|datacamp|m247|servers\.com/i;

  function detectType(d) {
    const str = (d.isp || "") + " " + (d.org || "");
    if (d.mobile)  return { label: "📱 移动网络", key: "mobile" };
    if (d.proxy)   return { label: "🔀 代理/VPN", key: "proxy" };
    if (d.hosting || DC_RE.test(str)) return { label: "🏢 数据中心", key: "dc" };
    return { label: "🏠 住宅宽带", key: "res" };
  }

  const RISK_MAP = {
    res:    { risk: "低 ✅",  score: 95 },
    mobile: { risk: "低 ✅",  score: 85 },
    proxy:  { risk: "中 ⚡", score: 50 },
    dc:     { risk: "高 ⚠️", score: 25 },
  };

  async function checkOne(t) {
    // 1. 可达性检测
    let reachable = false;
    try {
      const r = await $.http.get({
        url: t.testUrl, timeout: TIMEOUT,
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const s = r.status || 0;
      reachable = s >= 200 && s < 500;
    } catch (_) {}

    // 2. 先触发分流，再查 IP
    let d = null;
    try {
      await $.http.get({ url: t.testUrl, timeout: TIMEOUT }).catch(() => {});
      const res = await $.http.get({
        url: "http://ip-api.com/json/?lang=zh-CN&fields=61439",
        timeout: TIMEOUT,
      });
      const j = JSON.parse(res.body);
      if (j && j.status !== "fail") d = j;
    } catch (_) {}

    if (!d) {
      return {
        name: t.name, icon: t.icon, reachable, ok: false,
        ip: "获取失败", loc: "—", isp: "—", type: "—", risk: "—", score: 0,
      };
    }

    const { label: typeLabel, key } = detectType(d);
    const { risk, score } = RISK_MAP[key] || { risk: "未知", score: 0 };
    const flag = getFlag(d.countryCode || "");
    const country = d.country || "";
    const region = d.regionName || "";
    const city = d.city || "";
    const loc = [flag + country, region !== city ? region : "", city]
        .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    let isp = d.isp || d.org || "—";
    if (isp.length > 28) isp = isp.slice(0, 26) + "…";

    return { name: t.name, icon: t.icon, reachable, ok: true, ip: d.query || "—", loc, isp, type: typeLabel, risk, score };
  }

  const results = await Promise.all(targets.map(t => checkOne(t)));

  const SEP = "┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄";
  const lines = [];
  results.forEach((r, i) => {
    lines.push(`${r.icon} ${r.name} ${r.reachable ? "✅ 可用" : "❌ 不可用"}`);
    if (r.ok) {
      lines.push(` IP : ${r.ip}`);
      lines.push(` 归属 : ${r.loc}`);
      lines.push(` 运营商: ${r.isp}`);
      lines.push(` 类型 : ${r.type}`);
      lines.push(` 风险 : ${r.risk} 纯净度: ${r.score}/100`);
    } else {
      lines.push(` IP 信息获取失败`);
    }
    if (i < results.length - 1) lines.push(SEP);
  });

  const now = new Date();
  const pad = n => String(n).padStart(2, "0");
  lines.push("");
  lines.push(`🕐 ${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`);

  $.done({ title: "🌐 AI 节点监测", content: lines.join("\n") });

})();