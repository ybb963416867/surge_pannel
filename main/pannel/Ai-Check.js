/**
 * 多 AI 节点环境监测面板 v3.3 (Surge Panel)
 *
 * ChatGPT / Claude:
 *   使用 cdn-cgi/trace 获取真实访问出口 IP
 *
 * Gemini:
 *   仅检测可用性，不检测 IP
 *
 * ── Surge 配置 ───────────────────────────────────────
 * [Script]
 * ai-panel = type=generic,script-path=ai-check.js,timeout=30
 *
 * [Panel]
 * AI-Status = script-name=ai-panel,update-interval=3600,title=AI节点监测
 * ─────────────────────────────────────────────────────
 */

(async () => {
  try {
    const TIMEOUT = 8000;

    const targets = [
      {
        name: "ChatGPT",
        icon: "🤖",
        mode: "trace",
        url: "https://chatgpt.com/cdn-cgi/trace",
      },
      {
        name: "Claude",
        icon: "🔮",
        mode: "trace",
        url: "https://claude.ai/cdn-cgi/trace",
      },
      {
        name: "Gemini",
        icon: "✨",
        mode: "reachable",
        url: "https://gemini.google.com/",
      },
    ];

    function httpGet(options) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("timeout"));
        }, options.timeout || TIMEOUT);

        $httpClient.get(options, (error, response, body) => {
          clearTimeout(timer);

          if (error) {
            reject(error);
            return;
          }

          resolve({
            status: response && (response.status || response.statusCode) || 0,
            headers: response && response.headers || {},
            body: body || "",
          });
        });
      });
    }

    function getFlag(cc) {
      if (!cc || cc.length !== 2) return "";
      return String.fromCodePoint(
          ...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
      ) + " ";
    }

    function parseTrace(body) {
      const data = {};

      if (!body) return data;

      body.split("\n").forEach(line => {
        const index = line.indexOf("=");

        if (index > -1) {
          const key = line.slice(0, index).trim();
          const value = line.slice(index + 1).trim();

          if (key) {
            data[key] = value;
          }
        }
      });

      return data;
    }

    function normalizeWarp(warp) {
      if (!warp) return "未知";

      if (warp === "on") return "on";
      if (warp === "off") return "off";
      if (warp === "plus") return "plus";

      return warp;
    }

    async function checkTraceTarget(t) {
      try {
        const res = await httpGet({
          url: t.url,
          timeout: TIMEOUT,
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
        });

        const status = res.status || 0;
        const reachable = status >= 200 && status < 500;

        const trace = parseTrace(res.body);

        return {
          name: t.name,
          icon: t.icon,
          mode: t.mode,
          reachable,
          ok: Boolean(trace.ip),
          ip: trace.ip || "获取失败",
          loc: trace.loc || "—",
          flag: getFlag(trace.loc || ""),
          colo: trace.colo || "—",
          warp: normalizeWarp(trace.warp),
          http: trace.http || "—",
          tls: trace.tls || "—",
        };
      } catch (_) {
        return {
          name: t.name,
          icon: t.icon,
          mode: t.mode,
          reachable: false,
          ok: false,
          ip: "获取失败",
          loc: "—",
          flag: "",
          colo: "—",
          warp: "—",
          http: "—",
          tls: "—",
        };
      }
    }

    async function checkReachableTarget(t) {
      try {
        const res = await httpGet({
          url: t.url,
          timeout: TIMEOUT,
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
        });

        const status = res.status || 0;

        return {
          name: t.name,
          icon: t.icon,
          mode: t.mode,
          reachable: status >= 200 && status < 500,
          status,
        };
      } catch (_) {
        return {
          name: t.name,
          icon: t.icon,
          mode: t.mode,
          reachable: false,
          status: 0,
        };
      }
    }

    async function checkOne(t) {
      if (t.mode === "trace") {
        return await checkTraceTarget(t);
      }

      return await checkReachableTarget(t);
    }

    const results = [];

    /**
     * 顺序执行，避免并发请求对自动分流判断造成干扰。
     */
    for (const t of targets) {
      const r = await checkOne(t);
      results.push(r);
    }

    const SEP = "-------------------------";
    const lines = [];

    results.forEach((r, i) => {
      lines.push(`${r.icon} ${r.name}   ${r.reachable ? "✅ 可用" : "❌ 不可用"}`);

      if (r.mode === "trace") {
        if (r.ok) {
          lines.push(`IP    : ${r.ip}`);
          lines.push(`地区  : ${r.flag}${r.loc}`);
          lines.push(`机房  : ${r.colo}`);
          lines.push(`WARP  : ${r.warp}`);
          lines.push(`协议  : ${r.http} / ${r.tls}`);
        } else {
          lines.push("IP 信息获取失败");
        }
      }

      if (r.mode === "reachable") {
        lines.push(`检测  : 仅检测可用性`);
        if (r.status) {
          lines.push(`状态码: ${r.status}`);
        }
      }

      if (i < results.length - 1) {
        lines.push(SEP);
      }
    });

    const now = new Date();
    const pad = n => String(n).padStart(2, "0");

    lines.push("");
    lines.push(
        `🕐 ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
    );

    $done({
      title: "🌐 AI 节点监测",
      content: lines.join("\n"),
    });

  } catch (e) {
    $done({
      title: "🌐 AI 节点监测",
      content: `脚本执行异常:\n${String(e && e.message || e)}`,
    });
  }
})();