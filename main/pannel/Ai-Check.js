!(async () => {
  // 1. 配置区
  const POLICY_MAP = {
    "ChatGPT": "https://chatgpt.com/cdn-cgi/trace",
    "Gemini":  "https://gemini.google.com/",
    "Claude":  "https://claude.ai/api/auth/current-user"
  };

  // 辅助：获取国旗
  function getFlag(cc) {
    if (!cc || cc.length !== 2) return "";
    return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) + " ";
  }

  // 核心：检测单个 AI
  async function checkOne(name, testUrl) {
    $.log(`开始检测: ${name}`);
    try {
      // 先尝试探测连通性
      const r = await $.http.get({ url: testUrl, timeout: 5000 });
      const reachable = (r.status >= 200 && r.status < 500);

      // 获取 IP 信息 (移除 X-Surge-Policy 强制绑定，改为默认分流，避免死锁)
      const res = await $.http.get({ url: "https://api.myip.la/json?json", timeout: 5000 });
      const d = JSON.parse(res.body);

      // 简单逻辑判断
      const isDC = /Google|AWS|Cloudflare|Amazon/i.test(d.isp || "");
      const risk = isDC ? "高 ⚠️" : "低 ✅";
      const score = isDC ? 30 : 90;

      return { name, reachable, ip: d.ip || "—", isp: (d.isp || "—").slice(0, 15), risk, score };
    } catch (e) {
      $.log(`检测失败 [${name}]: ${e}`);
      return { name, reachable: false, error: true };
    }
  }

  // 2. 并行执行 (使用 Promise.allSettled 防止单个失败导致整体中断)
  const entries = Object.entries(POLICY_MAP);
  const results = await Promise.all(entries.map(([name, url]) => checkOne(name, url)));

  // 3. 组装内容
  let content = "";
  results.forEach((r, i) => {
    if (r.error) {
      content += `${r.name}: 检测异常\n`;
    } else {
      content += `${r.name}: ${r.reachable ? "✅" : "❌"}\n`;
      content += `IP: ${r.ip} (${r.isp})\n`;
      content += `风险: ${r.risk} | 纯净度: ${r.score}/100\n`;
    }
    if (i < results.length - 1) content += "┄┄┄┄┄┄┄aaaa┄┄┄┄┄┄┄┄\n";
  });

  $.done({ title: "🌐 AI 状态监控", content: content });
})();

// 基础 Env 框架
function Env(t){return new class{constructor(t){this.name=t;this.http={get:function(t){return new Promise((s,i)=>{$httpClient.get(t,(t,e,r)=>{t?i(t):s({status:e.status,body:r})})})}}}done(t){$done(t)}}(t)}
const $ = new Env('Ai-Check');