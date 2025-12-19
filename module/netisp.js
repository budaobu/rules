// @timestamp 2025-12-18 08:58:00
// NetISP 面板 - 全链路网络诊断工具 (Robust Mod)

let e = "globe.asia.australia",
    t = "#6699FF", // 默认标题颜色
    i = !1,
    s = !0,
    o = 1500,
    c = 3000,
    a = {};

if ("undefined" != typeof $argument && "" !== $argument) {
    const n = l("$argument");
    e = n.icon || e, t = n.icolor || t, i = 0 != n.GPT, s = 0 != n.hideIP, o = parseInt(n.cnTimeout || 1500), c = parseInt(n.usTimeout || 3000)
}

function l() {
    return Object.fromEntries($argument.split("&").map((e => e.split("="))).map((([e, t]) => [e, decodeURIComponent(t)])))
}

function u(e) {
    if (!e) return "";
    return e.replace(/(\w{1,4})(\.|\:)(\w{1,4}|\*)$/, ((e, t, n, i) => `${"*".repeat(t.length)}.${"*".repeat(i.length)}`))
}

async function g(e = "/v1/requests/recent", t = "GET", n = null) {
    return new Promise(((i, s) => {
        $httpAPI(t, e, n, (e => {
            i(e)
        }))
    }))
}

function d(e) {
    if (!e) return "";
    const t = e.toUpperCase().split("").map((e => 127397 + e.charCodeAt()));
    return String.fromCodePoint(...t).replace(/🇹🇼/g, "🇨🇳")
}

// 通用 HTTP 请求函数
async function m(e, t, headers = {}) {
    let i = 1;
    const s = new Promise(((s, o) => {
        const c = async a => {
            try {
                const i = await Promise.race([new Promise(((t, n) => {
                    let i = Date.now();
                    $httpClient.get({
                        url: e,
                        headers: headers
                    }, ((e, s, o) => {
                        if (e) n(e);
                        else {
                            let e = Date.now() - i;
                            if (s.status === 200) {
                                let type = s.headers["Content-Type"] || "";
                                if (type.includes("application/json")) {
                                    try {
                                        let j = JSON.parse(o);
                                        j.tk = e;
                                        t(j);
                                    } catch { t({ tk: e, raw: o }) }
                                } else {
                                    let obj = { tk: e, raw: o };
                                    let lines = o.split("\n");
                                    lines.forEach(line => {
                                        let parts = line.split("=");
                                        if (parts.length === 2) {
                                            obj[parts[0].trim()] = parts[1].trim();
                                        }
                                    });
                                    t(obj);
                                }
                            } else {
                                t("HTTP " + s.status);
                            }
                        }
                    }))
                })), new Promise(((e, n) => {
                    setTimeout((() => n(new Error("timeout"))), t)
                }))]);
                i ? s(i) : (s("超时"), o(new Error(n.message)))
            } catch (e) {
                a < 1 ? (i++, c(a + 1)) : (s("超时"), o(e))
            }
        };
        c(0)
    }));
    return s
}

(async () => {
    let n = "", l = "节点信息查询", r = "代理链", p = "", f = "", y = "";
    let finalColor = t; 

    // ============================================
    // [关键修复] UA 伪装配置
    // 为了通过 IPPure 的反爬墙，必须伪装成通用的 PC 浏览器
    // ============================================
    const ua = { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://ippure.com/",
        "Origin": "https://ippure.com",
        "Accept": "application/json, text/plain, */*"
    };

    // ============================================
    // 1. 获取落地信息 (Landing IP)
    // ============================================
    let landingFound = false;
    let P;

    // Source A: IPPure (修复 JSON 套娃问题 + 增强 ISP 识别)
    try {
        // [优化1] 超时改为 5000ms，给后续任务留出时间
        // 如果 5秒都拉不下来，说明网络太差，直接跳过
        P = await m("https://my.ippure.com/v1/info", 5000, ua);
        
        // 调试日志 (可选，如果不调试可以注释掉以节省性能)
        // console.log("IPPure 原始响应: " + JSON.stringify(P));

        // [优化2] 增强型 JSON 解析 (处理俄罗斯套娃 + 换行符清洗)
        if (P && P.raw && typeof P.raw === 'string') {
            try {
                // 清洗可能导致解析错误的特殊字符
                let cleanRaw = P.raw.trim(); 
                const innerData = JSON.parse(cleanRaw);
                Object.assign(P, innerData);
            } catch(e) {
                console.log("JSON二次解析异常: " + e);
            }
        }

        // 只要有 IP 就视为成功
        if (P && (P.ip || P.query)) {
            let ipVal = P.ip || P.query;
            let { country: e, countryCode: cc, city: ci, asOrganization: lp, asn: as, tk: g } = P;
            
            // 提取字段
            let isResidential = P.isResidential;
            let fraudScore = P.fraudScore;

            n = ipVal; 
            if (s) ipVal = u(ipVal); 
            if (e === ci) ci = "";
            let locStr = d(cc) + e + " " + (ci || "");

            // --- 风险/类型逻辑 ---
            let riskStr = "";
            let riskLabel = "";
            let nativeText = "";

            // 类型判断
            if (typeof isResidential === "boolean") {
                nativeText = isResidential ? "✅原生" : "🏢数据中心";
            } else {
                // 正则推测 (包含 Akari, DMIT, Leaseweb 等)
                const dcRegex = /Akari|DMIT|Misaka|Kirino|Cloudflare|Google|Amazon|Oracle|Aliyun|Tencent|DigitalOcean|Vultr|Linode|M247|Leaseweb/i;
                if (lp && dcRegex.test(lp)) {
                    nativeText = "🏢数据中心(推测)";
                } else {
                    nativeText = "❓类型未知";
                }
            }

            // 评分判断
            if (typeof fraudScore !== "undefined" && fraudScore !== null) {
                let risk = parseInt(fraudScore);
                if (risk >= 76) { riskLabel = `🛑极高风险(${risk})`; finalColor = "#FF3B30"; }
                else if (risk >= 51) { riskLabel = `⚠️高风险(${risk})`; finalColor = "#FF9500"; }
                else if (risk >= 26) { riskLabel = `🔶中风险(${risk})`; finalColor = "#FFCC00"; }
                else { riskLabel = `✅低风险(${risk})`; finalColor = "#88A788"; }
            } else {
                riskLabel = "⚠️无风控数据"; 
            }
            
            riskStr = `\nIP纯净: \t${riskLabel}  ${nativeText}`;
            
            p = " \t" + locStr + "\n落地IP: \t" + ipVal + ": " + (g || 0) + "ms\n落地ISP: \t" + (lp || "N/A") + "\n落地ASN: \tAS" + (as || "N/A") + riskStr;
            
            landingFound = true; 
            console.log("IPPure 面板生成完毕");
        } 
    } catch(err) {
        console.log("IPPure 运行跳过: " + err);
    }

    // Source B: IP-API (加强版：当 IPPure 失败时，由它接管类型检测)
    if (!landingFound) {
        console.log("切换到 Source B (IP-API)...");
        try {
            // [关键] 增加 fields 参数，请求 mobile,proxy,hosting 字段用于判断类型
            P = await m("http://ip-api.com/json/?fields=status,message,country,countryCode,city,isp,as,mobile,proxy,hosting,query,lat,lon,timezone,org", c, ua);
            
            if (P && P.status === 'success') {
                let { country: e, countryCode: t, query: o, city: ci, isp: lp, as: as, mobile, proxy, hosting } = P;
                n = o; if (s) o = u(o); if (e === ci) ci = "";
                
                // --- 替补的风险/类型判断逻辑 ---
                let typeStr = "❓未知类型";
                let riskColor = "#FFCC00"; // 默认黄色
                
                if (mobile) {
                    typeStr = "📱移动网络";
                    riskColor = "#88A788"; // 绿色
                } else if (hosting) {
                    typeStr = "🏢数据中心";
                    riskColor = "#FF9500"; // 橙色 (机房IP通常被视为中高风险)
                } else if (proxy) {
                    typeStr = "🛡️代理IP";
                    riskColor = "#FF3B30"; // 红色
                } else {
                    typeStr = "🏠住宅网络"; // 既不是Hosting也不是Mobile，大概率是宽带
                    riskColor = "#88A788"; // 绿色
                }

                // 在面板中明确标注数据来源是 IP-API
                let riskStr = `\nIP类型: \t${typeStr} (IP-API)`;
                
                // 动态调整图标颜色
                finalColor = riskColor;

                p = " \t" + (d(t) + e + " " + ci) + "\n落地IP: \t" + o + "\n落地ISP: \t" + lp + "\n落地ASN: \t" + as + riskStr;
                landingFound = true;
            }
        } catch(e) {
            console.log("Source B (IP-API) 也失败了: " + e);
        }
    }

    // Source C: IPInfo.io
    if (!landingFound) {
        try {
            P = await m("https://ipinfo.io/json", c, ua);
            if (P && P.ip) {
                let o = P.ip; let t = P.country; let loc = (P.city || "") + " " + (P.region || ""); let lp = P.org || ""; let g = P.tk;
                n = o; if (s) o = u(o);
                p = " \t" + (d(t) + " " + loc.trim()) + "\n落地IP: \t" + o + ": " + g + "ms\n落地ISP: \t" + lp;
                landingFound = true;
            }
        } catch(e) {}
    }

    // Source D: WTFIsMyIP
    if (!landingFound) {
        try {
            P = await m("https://wtfismyip.com/json", c, ua);
            if (P && P.YourFuckingIPAddress) {
                let o = P.YourFuckingIPAddress; let t = P.YourFuckingCountryCode; let loc = P.YourFuckingLocation; let lp = P.YourFuckingISP; let g = P.tk;
                n = o; if (s) o = u(o);
                p = " \t" + (d(t) + " " + loc) + "\n落地IP: \t" + o + ": " + g + "ms\n落地ISP: \t" + lp;
                landingFound = true;
            }
        } catch(e) {}
    }

    // Source E: IP.SB
    if (!landingFound) {
        try {
            P = await m("https://api-ipv6.ip.sb/ip", c, ua);
            let rawIP = P.raw || (typeof P === "string" ? P : "");
            if (rawIP && rawIP.includes(":")) {
                let o = rawIP.trim(); let g = P.tk || 0;
                n = o; if (s) o = u(o);
                p = " \t(IP.SB IPv6)\n落地IP: \t" + o + ": " + g + "ms";
                landingFound = true;
            }
        } catch(e) {}
    }
    
    // Source F: Ipify
    if (!landingFound) {
        try {
            P = await m("https://api64.ipify.org/?format=txt", c, ua);
            let rawIP = P.raw || (typeof P === "string" ? P : "");
            if (rawIP) {
                let o = rawIP.trim(); let g = P.tk || 0;
                n = o; if (s) o = u(o);
                p = " \t(位置未知)\n落地IP: \t" + o + ": " + g + "ms";
            } else { p = " \t落地信息获取失败"; }
        } catch(e) { p = " \t落地信息获取失败"; }
    }

    // ============================================
    // 2. 检测 GPT & Warp
    // ============================================
    if (i) {
        const gptData = await m("http://chat.openai.com/cdn-cgi/trace", c);
        const blockedCountries = ["CN", "TW", "HK", "IR", "KP", "RU", "VE", "BY"];

        if (typeof gptData !== "string") {
            let { loc, tk, warp } = gptData;
            if (loc) {
                let status = blockedCountries.indexOf(loc) === -1 ? `GPT: ${loc} ✅` : `GPT: ${loc} ❌`;
                if (warp === "plus") warp = "Plus";
                l = `${status}       ➟      Warp: ${warp}   ${tk}ms`;
            } else {
                l = "ChatGPT: 数据解析异常";
            }
        } else {
            l = "ChatGPT " + gptData;
        }
    }

    // ============================================
    // 3. 历史请求分析
    // ============================================
    let h, w = "";
    try {
        let reqs = await g();
        let k = reqs.requests.slice(0, 8).filter((e => /ip-api\.com|ippure\.com|ipinfo\.io|wtfismyip\.com|ipify\.org|ip\.sb/.test(e.URL)));
        if (k.length > 0) {
            const e = k[0];
            y = ": " + e.policyName, /\(Proxy\)/.test(e.remoteAddress) ? (h = e.remoteAddress.replace(" (Proxy)", ""), r = "") : (h = "Noip", w = "代理链地区:")
        } else h = "Noip";
    } catch(err) { h = "Noip"; }

    // ============================================
    // 4. 入口 IP 详情
    // ============================================
    let N = !1, $ = !1;
    if (isv6 = !1, cn = !0, "Noip" === h ? N = !0 : /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ? $ = !0 : /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(h) && (isv6 = !0), h == n) cn = !1, w = "直连节点:";
    else {
        if ("" === w && (w = "落地地区:"), !N || $) {
            const e = await m(`https://api-v3.speedtest.cn/ip?ip=${h}`, o);
            if (e && e.data && e.data.country === "中国") {
                let { province: t, isp: n, city: i, countryCode: o } = e.data;
                cn = !0, s && (h = u(h)), f = "入口国家: \t" + d(o) + t + " " + i + "\n入口IP: \t" + h + ": " + e.tk + "ms\n入口ISP: \t" + n + r + "\n---------------------\n"
            } else { cn = !1; f = ""; }
        }
        if ((!N || isv6) && !cn && f === "") {
            const e = await m(`http://ip-api.com/json/${h}?lang=zh-CN`, c);
            if (e && e.country) {
                let { countryCode: t, country: n, city: i, isp: c } = e;
                s && (h = u(h));
                let a = n + " " + i;
                f = "入口国家: \t" + d(t) + a + "\n入口IP: \t" + h + ": " + e.tk + "ms\n入口ISP: \t" + c + r + "\n---------------------\n"
            }
        }
        if ((!N || isv6) && !cn && f === "") {
            try {
                const e = await m(`https://ipapi.co/${h}/json`, c, ua);
                if (e && e.ip) {
                    let { country_code: t, country_name: n, city: i, org: c_isp, region: reg } = e;
                    s && (h = u(h));
                    f = "入口国家: \t" + d(t) + n + " " + (reg||"") + " " + i + "\n入口IP: \t" + h + ": " + e.tk + "ms\n入口ISP: \t" + c_isp + r + "\n---------------------\n";
                }
            } catch(err) {}
        }
    }

    // ============================================
    // 5. 内网 IP (LAN)
    // ============================================
    let lan = "";
    try {
        if (typeof $network !== "undefined") {
            if ($network.v4 && $network.v4.primaryAddress) lan += "🅻 " + $network.v4.primaryAddress + "\n";
            if ($network.v6 && $network.v6.primaryAddress) {
                let v6 = $network.v6.primaryAddress;
                if (s) v6 = u(v6);
                lan += "🅻 " + v6 + "\n";
            }
        }
    } catch(err) {}

    // ============================================
    // 6. 本机公网 IP (Local Public)
    // ============================================
    let localPub = "";
    const biliH = { "User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com/" };

    // IPIP
    try {
        const res = await m("http://myip.ipip.net", o, { "User-Agent": "curl/7.29.0" });
        let text = res.raw || (typeof res === "string" ? res : "");
        if (text.includes("当前 IP")) {
            let ip = text.match(/IP：(.*?) /)[1].trim();
            let loc = text.match(/来自于：(.*)/)[1].trim();
            if (s) ip = u(ip);
            localPub = "🏠 " + ip + " (" + loc + ")\n";
        }
    } catch(e) {}
    // Bili Live
    if (!localPub) {
        try {
            const res = await m("https://api.live.bilibili.com/xlive/web-room/v1/index/getIpInfo", o, biliH);
            if (res && res.code === 0 && res.data) {
                let { addr, country, province, city, isp } = res.data;
                if (s) addr = u(addr);
                let locStr = [country, province, city, isp].filter(Boolean).join(" ");
                localPub = "🏠 " + addr + " (" + locStr + ")\n";
            }
        } catch(e) {}
    }
    // Bili Zone
    if (!localPub) {
        try {
            const res = await m("https://api.bilibili.com/x/web-interface/zone", o, biliH);
            if (res && res.code === 0 && res.data) {
                let { addr, country, province, city, isp } = res.data;
                if (s) addr = u(addr);
                let locStr = [country, province, city, isp].filter(Boolean).join(" ");
                localPub = "🏠 " + addr + " (" + locStr + ")\n";
            }
        } catch(e) {}
    }
    // NetEase
    if (!localPub) {
        try {
            const res = await m("https://ipservice.ws.126.net/locate/api/getLocByIp", o, { "User-Agent": "Mozilla/5.0" });
            if (res && res.status === 200 && res.result) {
                let { ip, country, province, city, company } = res.result;
                if (s) ip = u(ip);
                let locStr = [country, province, city, company].filter(Boolean).join(" ");
                localPub = "🏠 " + ip + " (" + locStr + ")\n";
            }
        } catch(e) {}
    }

    let sep = "";
    if (f !== "") sep = "---------------------\n";

    a = {
        title: l + y,
        content: lan + localPub + sep + f + w + p,
        icon: e,
        "icon-color": finalColor
    }
})().catch((e => console.log(e.message))).finally((() => $done(a)));
