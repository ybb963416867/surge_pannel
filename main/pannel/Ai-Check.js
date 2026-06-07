/**
 * 多 AI 节点环境监测面板 v3.4 (Surge Panel)
 *
 * ChatGPT / Claude:
 *   1. 使用 cdn-cgi/trace 获取真实访问出口 IP
 *   2. 使用 ip-api.com/json/{ip} 查询该 IP 的归属地 / 运营商 / 类型 / 风险 / 纯净度
 *
 * Gemini:
 *   仅检测可用性，不检测 IP
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

    function shorten(text, max) {
      if (!text) return "—";
      const s = String(text);
      if (s.length <= max) return s;
      return s.slice(0, max - 1) + "…";
    }

    function buildLocation(d, fallbackLoc) {
      const countryCode = d && d.countryCode ? d.countryCode : fallbackLoc;
      const flag = getFlag(countryCode || "");
      const country = d && d.country ? d.country : fallbackLoc || "";
      const region = d && d.regionName ? d.regionName : "";
      const city = d && d.city ? d.city : "";

      return [flag + country, region !== city ? region : "", city]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim() || "—";
    }

    const DC_RE = new RegExp(
        [
          "google",
          "aws",
          "amazon",
          "azure",
          "microsoft",
          "cloudflare",
          "alibaba",
          "tencent",
          "digitalocean",
          "linode",
          "vultr",
          "oracle",
          "ovh",
          "hetzner",
          "contabo",
          "leaseweb",
          "serverius",
          "choopa",
          "psychz",
          "multacom",
          "zenlayer",
          "cogent",
          "lumen",
          "hurricane",
          "he\\.net",
          "buyvm",
          "frantech",
          "quadranet",
          "reliablesite",
          "sharktech",
          "steadfast",
          "nexeon",
          "hostwinds",
          "datacamp",
          "m247",
          "servers\\.com",
        ].join("|"),
        "i"
    );

    function detectIpQuality(d) {
      const text = `${d.isp || ""} ${d.org || ""} ${d.as || ""}`;

      if (d.mobile) {
        return {
          type: "📱 移动网络",
          risk: "低 ✅",
          score: 85,
        };
      }

      if (d.proxy) {
        return {
          type: "🔀 代理/VPN",
          risk: "中 ⚡",
          score: 50,
        };
      }

      if (d.hosting || DC_RE.test(text)) {
        return {
          type: "🏢 数据中心",
          risk: "高 ⚠️",
          score: 25,
        };
      }

      return {
        type: "🏠 住宅宽带",
        risk: "低 ✅",
        score: 95,
      };
    }

    async function queryIpQuality(ip) {
      if (!ip) {
        throw new Error("empty ip");
      }

      const fields = [
        "status",
        "message",
        "query",
        "country",
        "countryCode",
        "regionName",
        "city",
        "isp",
        "org",
        "as",
        "proxy",
        "hosting",
        "mobile",
      ].join(",");

      const res = await httpGet({
        url: `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=${fields}`,
        timeout: TIMEOUT,
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });

      const d = JSON.parse(res.body || "{}");

      if (!d || d.status === "fail") {
        throw new Error(d.message || "ip-api fail");
      }

      return d;
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
        const ip = trace.ip || "";

        let quality = null;
        let qualityResult = null;
        let qualityOk = false;

        if (ip) {
          try {
            quality = await queryIpQuality(ip);
            qualityResult = detectIpQuality(quality);
            qualityOk = true;
          } catch (_) {}
        }

        return {
          name: t.name,
          icon: t.icon,
          mode: t.mode,
          reachable,
          ok: Boolean(ip),
          ip: ip || "获取失败",

          traceLoc: trace.loc || "—",
          traceFlag: getFlag(trace.loc || ""),
          colo: trace.colo || "—",
          warp: normalizeWarp(trace.warp),
          http: trace.http || "—",
          tls: trace.tls || "—",

          qualityOk,
          loc: qualityOk ? buildLocation(quality, trace.loc) : `${getFlag(trace.loc || "")}${trace.loc || "—"}`,
          isp: qualityOk ? shorten(quality.isp || quality.org || "—", 28) : "—",
          org: qualityOk ? shorten(quality.org || "—", 28) : "—",
          as: qualityOk ? shorten(quality.as || "—", 32) : "—",
          type: qualityResult ? qualityResult.type : "—",
          risk: qualityResult ? qualityResult.risk : "—",
          score: qualityResult ? qualityResult.score : 0,
        };
      } catch (_) {
        return {
          name: t.name,
          icon: t.icon,
          mode: t.mode,
          reachable: false,
          ok: false,
          ip: "获取失败",
          traceLoc: "—",
          traceFlag: "",
          colo: "—",
          warp: "—",
          http: "—",
          tls: "—",
          qualityOk: false,
          loc: "—",
          isp: "—",
          org: "—",
          as: "—",
          type: "—",
          risk: "—",
          score: 0,
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

    for (const t of targets) {
      const r = await checkOne(t);
      results.push(r);
    }

    const SEP = "────────────";
    const lines = [];

    results.forEach((r, i) => {
      lines.push(`${r.icon} ${r.name}   ${r.reachable ? "✅ 可用" : "❌ 不可用"}`);

      if (r.mode === "trace") {
        if (r.ok) {
          lines.push(`IP    : ${r.ip}`);
          lines.push(`归属  : ${r.loc}`);

          if (r.qualityOk) {
            lines.push(`运营商: ${r.isp}`);
            lines.push(`类型  : ${r.type}`);
            lines.push(`风险  : ${r.risk}   纯净度: ${r.score}/100`);
          } else {
            lines.push(`纯净度: 查询失败`);
          }

          lines.push(`机房  : ${r.colo}`);
          lines.push(`WARP  : ${r.warp}`);
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