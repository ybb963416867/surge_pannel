// ┌──────────────────────────────────────────────────────────────┐
// │  完整版 AI 节点监测面板 v3.0                                  │
// └──────────────────────────────────────────────────────────────┘

!(async () => {
  const POLICY_GPT    = "ChatGPT";
  const POLICY_GEMINI = "Gemini";
  const POLICY_CLAUDE = "Claude";
  const TIMEOUT       = 8000;

  const targets = [
    { name: "ChatGPT", icon: "🤖", policy: POLICY_GPT, testUrl: "https://chatgpt.com/cdn-cgi/trace" },
    { name: "Gemini",  icon: "✨", policy: POLICY_GEMINI, testUrl: "https://gemini.google.com/" },
    { name: "Claude",  icon: "🔮", policy: POLICY_CLAUDE, testUrl: "https://claude.ai/api/auth/current-user" },
  ];

  function getFlag(cc) {
    if (!cc || cc.length !== 2) return "";
    return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) + " ";
  }

  // 正则合并为一行，防止语法错误
  const DC_RE = /google|aws|amazon|azure|microsoft|cloudflare|alibaba|tencent|digitalocean|linode|vultr|oracle|ovh|hetzner|contabo|leaseweb|serverius|choopa|psychz|multacom|zenlayer|cogent|lumen|hurricane|he\.net|buyvm|frantech|quadranet|reliablesite|sharktech|steadfast|nexeon|hostwinds|datacamp|m247|servers\.com/i;

  function detectType(d) {
    const str = (d.isp || "") + " " + (d.org || "");
    if (d.mobile) return { label: "📱 移动网络", key: "mobile" };
    if (d.proxy)  return { label: "🔀 代理/VPN", key: "proxy"  };
    if (d.hosting || DC_RE.test(str)) return { label: "🏢 数据中心", key: "dc" };
    return { label: "🏠 住宅宽带", key: "res" };
  }

  const RISK_MAP = { res: { risk: "低 ✅", score: 95 }, mobile: { risk: "低 ✅", score: 85 }, proxy: { risk: "中 ⚡", score: 50 }, dc: { risk: "高 ⚠️", score: 25 } };

  async function checkOne(t) {
    let reachable = false;
    try {
      const r = await $.http.get({ url: t.testUrl, timeout: TIMEOUT, headers: { "User-Agent": "Mozilla/5.0" } });
      reachable = (r.status >= 200 && r.status < 500);
    } catch (_) {}

    let d = null;
    try {
      const res = await $.http.get({ url: "http://ip-api.com/json/?lang=zh-CN&fields=61439", timeout: TIMEOUT, headers: { "X-Surge-Policy": t.policy } });
      const j = JSON.parse(res.body);
      if (j && j.status !== "fail") d = j;
    } catch (_) {}

    if (!d) return { name: t.name, icon: t.icon, reachable, ok: false };

    const { label: typeLabel, key } = detectType(d);
    const { risk, score } = RISK_MAP[key] || { risk: "未知", score: 0 };
    const flag = getFlag(d.countryCode || "");
    const loc = [flag + (d.country || ""), d.city || ""].filter(Boolean).join(" ");

    return { name: t.name, icon: t.icon, reachable, ok: true, ip: d.query || "—", loc, isp: (d.isp || "—").slice(0, 26), type: typeLabel, risk, score };
  }

  const results = await Promise.all(targets.map(t => checkOne(t)));
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
      lines.push(`  IP 获取失败`);
    }
    if (i < results.length - 1) lines.push("┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄");
  });

  $.done({ title: "🌐 AI 节点监测", content: lines.join("\n") });
})();

// 基础 Env 框架，用于 Surge 环境适配
function Env(t,s){class e{constructor(t){this.env=t}send(t,s="GET"){t="string"==typeof t?{url:t}:t;let e=this.get;return"POST"===s&&(e=this.post),new Promise((s,i)=>{e.call(this,t,(t,e,r)=>{t?i(t):s(e)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,s){this.name=t,this.http=new e(this)}done(t={}){return $done(t)}}(t,s)}
const $ = new Env('Ai-Check');