// @timestamp 2025-12-20 23:30:00
// NetISP 面板 - Final Ordered (IPIP Last + Auto Fix)

let e = "globe.asia.australia",
    t = "#6699FF",
    s = !0,
    o = 3000,
    c = 8000,
    a = {};

if ("undefined" != typeof $argument && "" !== $argument) {
    const n = l("$argument");
    e = n.icon || e, t = n.icolor || t, s = 0 != n.hideIP, o = parseInt(n.cnTimeout || 3000), c = parseInt(n.usTimeout || 8000)
}

function l() {
    return Object.fromEntries($argument.split("&").map((e => e.split("="))).map((([e, t]) => [e, decodeURIComponent(t)])))
}

function u(e) {
    if (!e) return "";
    return e.replace(/(\w{1,4})(\.|\:)(\w{1,4}|\*)$/, ((e, t, n, i) => `${"*".repeat(t.length)}.${"*".repeat(i.length)}`))
}

// 获取最近请求
async function g(e = "/v1/requests/recent", t = "GET", n = null) {
    return new Promise(((i, s) => {
        $httpAPI(t, e, n, (e => {
            i(e)
        }))
    }))
}

// 获取策略组 (用于递归查找 Auto 真实节点)
async function getGroups() {
    return new Promise((resolve) => {
        $httpAPI("GET", "/v1/policy_groups", null, (res) => {
            try {
                resolve(JSON.parse(res));
            } catch (e) {
                resolve({});
            }
        })
    });
}

function d(e) {
    if (!e) return "";
    const t = e.toUpperCase().split("").map((e => 127397 + e.charCodeAt()));
    return String.fromCodePoint(...t)
}

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
    let n = "", l = "网络信息", r = "代理链", p = "", f = "", y = "";
    let finalColor = t; 

    const ua = { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://ippure.com/",
        "Origin": "https://ippure.com",
        "Accept": "application/json, text/plain, */*"
    };

    let landingFound = false;
    let P;

    // ============================================
    // 1. 落地 IP 检测 (IPPure 首选)
    // ============================================
    try {
        P = await m("https://my.ippure.com/v1/info", c, ua);
        
        if (P && P.raw && typeof P.raw === 'string') {
            try {
                const innerData = JSON.parse(P.raw.trim());
                Object.assign(P, innerData);
            } catch(e) {}
        }

        if (P && (P.ip || P.query)) {
            let ipVal = P.ip || P.query;
            let { country: e, countryCode: cc, city: ci, asOrganization: lp, asn: as, tk: g } = P;
            
            n = ipVal; // 保存 IP 用于入口检测
            if (s) ipVal = u(ipVal); 
            if (e === ci) ci = "";
            let locStr = d(cc) + e + " " + (ci || "");

            let riskStr = "";
            let riskLabel = "";
            let nativeText = "";
            let isResidential = P.isResidential;
            let fraudScore = P.fraudScore;

            if (typeof isResidential === "boolean") {
                nativeText = isResidential ? "✅原生" : "🏢数据中心";
            } else {
                const dcRegex = /Akari|DMIT|Misaka|Kirino|Cloudflare|Google|Amazon|Oracle|Aliyun|Tencent|DigitalOcean|Vultr|Linode|M247|Leaseweb/i;
                if (lp && dcRegex.test(lp)) {
                    nativeText = "🏢数据中心(推测)";
                } else {
                    nativeText = "❓类型未知";
                }
            }

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
            p = " \t" + locStr + "\n落地IP: \t" + ipVal + " (" + (g || 0) + "ms)\n落地ISP: \t" + (lp || "N/A") + "\n落地ASN: \tAS" + (as || "N/A") + riskStr;
            landingFound = true;
        } 
    } catch(err) {}

    // 备用落地源: IP-API
    if (!landingFound) {
        try {
            P = await m("http://ip-api.com/json/?lang=zh-CN", c, ua);
            if (P && P.status === 'success') {
                let { country: e, countryCode: t, query: o, city: ci, isp: lp, as: as, tk: g } = P;
                n = o; if (s) o = u(o); if (e === ci) ci = "";
                p = " \t" + (d(t) + e + " " + ci) + "\n落地IP: \t" + o + " (" + g + "ms)\n落地ISP: \t" + lp + "\n落地ASN: \t" + as;
                landingFound = true;
            }
        } catch(e) {}
    }
    
    // 备用落地源: IPInfo
    if (!landingFound) {
        try {
            P = await m("https://ipinfo.io/json", c, ua);
            if (P && P.ip) {
                let o = P.ip; let t = P.country; let loc = (P.city || "") + " " + (P.region || ""); let lp = P.org || ""; let g = P.tk;
                n = o; if (s) o = u(o);
                p = " \t" + (d(t) + " " + loc.trim()) + "\n落地IP: \t" + o + " (" + g + "ms)\n落地ISP: \t" + lp;
                landingFound = true;
            }
        } catch(e) {}
    }

    // 备用落地源: WTFIsMyIP
    if (!landingFound) {
        try {
            P = await m("https://wtfismyip.com/json", c, ua);
            if (P && P.YourFuckingIPAddress) {
                let o = P.YourFuckingIPAddress; let t = P.YourFuckingCountryCode; let loc = P.YourFuckingLocation; let lp = P.YourFuckingISP; let g = P.tk;
                n = o; if (s) o = u(o);
                p = " \t" + (d(t) + " " + loc) + "\n落地IP: \t" + o + " (" + g + "ms)\n落地ISP: \t" + lp;
                landingFound = true;
            }
        } catch(e) {}
    }

    // 备用落地源: IP.SB
    if (!landingFound) {
        try {
            P = await m("https://api-ipv6.ip.sb/ip", c, ua);
            let rawIP = P.raw || (typeof P === "string" ? P : "");
            if (rawIP && rawIP.includes(":")) {
                let o = rawIP.trim(); let g = P.tk || 0;
                n = o; if (s) o = u(o);
                p = " \t(IP.SB IPv6)\n落地IP: \t" + o + " (" + g + "ms)";
                landingFound = true;
            }
        } catch(e) {}
    }

    // 备用落地源: Ipify
    if (!landingFound) {
        try {
            P = await m("https://api64.ipify.org/?format=txt", c, ua);
            let rawIP = P.raw || (typeof P === "string" ? P : "");
            if (rawIP) {
                let o = rawIP.trim(); let g = P.tk || 0;
                n = o; if (s) o = u(o);
                p = " \t(位置未知)\n落地IP: \t" + o + " (" + g + "ms)";
            } else { p = " \t落地信息获取失败"; }
        } catch(e) { p = " \t落地信息获取失败"; }
    }

    // ============================================
    // 2. 入口 IP 检测
    // ============================================
    // 临时获取一个 h 值用于检测，稍后通过历史记录修正
    let h = n; 
    let N = !1, $ = !1;
    let isv6 = false;
    let cn = true;

    if ("Noip" === h) N = !0;
    else if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) $ = !0;
    else if (/^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(h)) isv6 = !0;

    let w = "落地地区:"; 

    // Speedtest (如果成功，f 会被赋值)
    if (!N || $) {
        const e = await m(`https://api-v3.speedtest.cn/ip?ip=${h}`, o);
        if (e && e.data && e.data.country === "中国") {
            let { province: t, isp: n, city: i, countryCode: o } = e.data;
            cn = !0, s && (h = u(h)), 
            f = "入口地区: \t" + d(o) + t + " " + i + "\n入口IP: \t" + h + " (" + e.tk + "ms)\n入口ISP: \t" + n + "\n---------------------\n" // 暂时不加 r
        } else { cn = !1; f = ""; }
    }
    
    // IP-API Check (如果 Speedtest 失败或非国内)
    // 关键点：这里会产生 ip-api 的请求记录，供最后一步提取标题使用
    if ((!N || isv6) && !cn && f === "") {
        const e = await m(`http://ip-api.com/json/${h}?lang=zh-CN`, c);
        if (e && e.country) {
            let { countryCode: t, country: n, city: i, isp: c } = e;
            s && (h = u(h));
            let a = n + " " + i;
            f = "入口地区: \t" + d(t) + a + "\n入口IP: \t" + h + " (" + e.tk + "ms)\n入口ISP: \t" + c + "\n---------------------\n" // 暂时不加 r
        }
    }
    // IPAPI.co Check
    if ((!N || isv6) && !cn && f === "") {
        try {
            const e = await m(`https://ipapi.co/${h}/json`, c, ua);
            if (e && e.ip) {
                let { country_code: t, country_name: n, city: i, org: c_isp, region: reg } = e;
                s && (h = u(h));
                f = "入口地区: \t" + d(t) + n + " " + (reg||"") + " " + i + "\n入口IP: \t" + h + " (" + e.tk + "ms)\n入口ISP: \t" + c_isp + "\n---------------------\n";
            }
        } catch(err) {}
    }

    // ============================================
    // 3. 内网 IP (LAN)
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
    // 4. 本地公网 IP (Local Public) - IPIP 放最后
    // ============================================
    let localPub = "";
    const biliH = { "User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com/" };

    // 1. Bilibili Live
    try {
        const res = await m("https://api.live.bilibili.com/xlive/web-room/v1/index/getIpInfo", o, biliH);
        if (res && res.code === 0 && res.data) {
            let { addr, country, province, city, isp } = res.data;
            if (s) addr = u(addr);
            let locStr = [country, province, city, isp].filter(Boolean).join(" ");
            localPub = "🏠 " + addr + " (" + locStr + ")\n";
        }
    } catch(e) {}
    
    // 2. Bilibili Zone
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
    
    // 3. NetEase
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

    // 4. IPIP.net (Moved to Last)
    if (!localPub) {
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
    }

    // ============================================
    // 5. [最后一步] 历史记录分析 & 标题生成
    // ============================================
    // 此时所有请求都已发出，历史记录里应该有 ippure 和 ip-api (如果有入口检测的话)
    try {
        let reqs = await g();
        // 筛选出我们关心的请求
        let k = reqs.requests.slice(0, 15).filter((e => /ip-api\.com|ippure\.com|ipinfo\.io|wtfismyip\.com|ipify\.org|ip\.sb/.test(e.URL)));
        
        if (k.length > 0) {
            // [关键逻辑] 优先查找 ip-api.com 的记录来定标题，因为它策略名准
            let titleSource = k.find(x => x.URL.includes("ip-api.com"));
            
            // 如果没找到 ip-api，退而求其次用第一条(通常是 ippure)
            if (!titleSource) titleSource = k[0];
            
            // 提取策略名
            let finalName = "";
            if (titleSource.policyPath && Array.isArray(titleSource.policyPath) && titleSource.policyPath.length > 0) {
                finalName = titleSource.policyPath[titleSource.policyPath.length - 1];
            } else {
                finalName = titleSource.policyName;
            }

            // [Auto Fix] 如果依然是 Auto，尝试递归 (最后的防线)
            if (finalName === "Auto") {
                let groups = await getGroups();
                let loop = 0;
                while (groups[finalName] && loop < 10) {
                    let g = groups[finalName];
                    let next = g.select || g.strategy;
                    if (next) finalName = next; else break;
                    loop++;
                }
            }

            // 设置标题
            if (finalName.toLowerCase() === 'direct') {
                l = "代理策略: 直连";
                y = "";
            } else {
                l = "代理策略";
                y = ": " + finalName;
            }

            // 设置 Proxy 标记 (依然用最近的一条来判断是否经过了代理)
            // 补全之前 f 字符串里缺少的 r
            if (/\(Proxy\)/.test(k[0].remoteAddress)) {
                r = ""; // 是代理，清空后缀
            } else {
                r = " (直连)"; 
            }
            // 将 r 补充到 f 中 (如果 f 存在)
            if (f !== "") {
                // f 的格式是 "...入口ISP: xxx\n..."，我们在换行前插入 r
                f = f.replace(/\n-{21}/, r + "\n---------------------");
            } else {
                w = "直连节点:"; // 如果 f 为空，说明是直连或失败，修正 w
            }
        }
    } catch(err) {}

    let sep = "";
    if (f !== "") sep = "---------------------\n";

    a = {
        title: l + y,
        content: lan + localPub + sep + f + w + p,
        icon: e,
        "icon-color": finalColor
    }
})().catch((e => {})).finally((() => $done(a)));
