// 2025-12-15 12:10:00

let e = "globe.asia.australia",
    t = "#6699FF",
    i = !1,
    s = !0,
    o = 1500, // 国内超时
    c = 3000, // 国外超时
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
    return e.replace(/(\w{1,4})(\.|\:)(\w{1,4}|\*)$/, ((e, t, n, i) => `${"∗".repeat(t.length)}.${"∗".repeat(i.length)}`))
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

// 通用请求函数
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
                                    // 尝试解析文本或 key=value
                                    let obj = { tk: e, raw: o };
                                    t(obj);
                                }
                            } else {
                                t({ error: "http_err", status: s.status });
                            }
                        }
                    }))
                })), new Promise(((e, n) => {
                    setTimeout((() => n(new Error("timeout"))), t)
                }))]);
                i ? s(i) : (s("超时"), o(new Error(n.message)))
            } catch (e) {
                a < 1 ? (i++, c(a + 1)) : (s("检测失败"), o(e))
            }
        };
        c(0)
    }));
    return s
}

(async () => {
    let n = "", l = "节点信息查询", r = "代理链", p = "", f = "", y = "";
    
    // ============================================
    // 1. 获取落地信息 (Landing IP) - 多源自动切换
    // ============================================
    // 默认请求 headers
    const ua = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1" };
    
    let P = await m("http://ip-api.com/json/?lang=zh-CN", c, ua);
    let landingFound = false;

    // Source A: IP-API (首选，信息最全)
    if (P && P.status === 'success') {
        console.log("Landing: IP-API");
        let { country: e, countryCode: t, query: o, city: ci, isp: lp, as: as, tk: g } = P;
        n = o; 
        if (s) o = u(o);
        if (e === ci) ci = "";
        p = " \t" + (d(t) + e + " " + ci) + "\n落地IP: \t" + o + ": " + g + "ms\n落地ISP: \t" + lp + "\n落地ASN: \t" + as;
        landingFound = true;
    }

    // Source B: IPInfo.io (备选，精准)
    if (!landingFound) {
        try {
            console.log("Landing: IPInfo (Backup)");
            P = await m("https://ipinfo.io/json", c, ua);
            if (P && P.ip) {
                let o = P.ip;
                let t = P.country; // US
                let loc = (P.city || "") + " " + (P.region || "");
                let lp = P.org || ""; // AS123 Google
                let g = P.tk;
                n = o;
                if (s) o = u(o);
                p = " \t" + (d(t) + " " + loc.trim()) + "\n落地IP: \t" + o + ": " + g + "ms\n落地ISP: \t" + lp;
                landingFound = true;
            }
        } catch(e) {}
    }

    // Source C: WTFIsMyIP (备选)
    if (!landingFound) {
        try {
            console.log("Landing: WTFIsMyIP (Backup)");
            P = await m("https://wtfismyip.com/json", c, ua);
            if (P && P.YourFuckingIPAddress) {
                let o = P.YourFuckingIPAddress;
                let t = P.YourFuckingCountryCode;
                let loc = P.YourFuckingLocation;
                let lp = P.YourFuckingISP;
                let g = P.tk;
                n = o;
                if (s) o = u(o);
                p = " \t" + (d(t) + " " + loc) + "\n落地IP: \t" + o + ": " + g + "ms\n落地ISP: \t" + lp;
                landingFound = true;
            }
        } catch(e) {}
    }

    // Source D: IP.SB (IPv6 专用备用，纯文本)
    if (!landingFound) {
        try {
            console.log("Landing: IP.SB (IPv6 Backup)");
            P = await m("https://api-ipv6.ip.sb/ip", c, ua);
            // P 可能直接是对象{raw: "..."}，也可能 m 函数直接返回了字符串(如果 content-type 没被识别)
            let rawIP = P.raw || (typeof P === "string" ? P : "");
            if (rawIP && rawIP.includes(":")) { // 简单校验是否含冒号(IPv6特征)
                let o = rawIP.trim();
                let g = P.tk || 0;
                n = o;
                if (s) o = u(o);
                p = " \t(IP.SB IPv6)\n落地IP: \t" + o + ": " + g + "ms";
                landingFound = true;
            }
        } catch(e) {}
    }

    // Source E: Ipify (最后兜底，仅IP)
    if (!landingFound) {
        try {
            console.log("Landing: Ipify (Last Resort)");
            P = await m("https://api64.ipify.org/?format=txt", c, ua);
            let rawIP = P.raw || (typeof P === "string" ? P : "");
            if (rawIP) {
                let o = rawIP.trim();
                let g = P.tk || 0;
                n = o;
                if (s) o = u(o);
                p = " \t(位置未知)\n落地IP: \t" + o + ": " + g + "ms";
            } else {
                p = " \t落地信息获取失败";
            }
        } catch(e) { p = " \t落地信息获取失败"; }
    }

    // ============================================
    // 2. 检测 GPT & Warp
    // ============================================
    if (i) {
        // m 函数现在会返回一个对象，包含 loc, warp, ip, tk 等属性
        const gptData = await m("http://chat.openai.com/cdn-cgi/trace", c);
        
        // 确保获取到了 loc 字段，说明解析成功
        if (gptData && gptData.loc) {
            let { loc, tk, warp, ip } = gptData;
            
            const blockedCountries = ["CN", "TW", "HK", "IR", "KP", "RU", "VE", "BY"];
            
            // 判断 GPT 状态 (不在封锁列表中即为支持)
            let status = blockedCountries.indexOf(loc) === -1 ? "✓" : "×";
            let gptStatusStr = `GPT: ${loc} ${status}`;
            
            // 判断 Warp 状态 (还原您提供的逻辑)
            let warpStatus = "";
            if (warp) {
                if (warp === "plus") warp = "Plus";
                if (warp === "on") warp = "On";
                if (warp === "off") warp = "Off";
                warpStatus = ` ➟ Priv: ${warp}`;
            }
            
            // 组合 Title: GPT: US ✓ ➟ Priv: Plus 120ms
            l = `${gptStatusStr}${warpStatus}   ${tk}ms`;
            
        } else {
            l = "ChatGPT: 检测失败";
        }
    }

    // ============================================
    // 3. 历史请求分析 (入口判定)
    // ============================================
    let h, w = "";
    try {
        let reqs = await g();
        // [修改] 增加 ip.sb 到正则匹配中
        let k = reqs.requests.slice(0, 8).filter((e => /ip-api\.com|ipinfo\.io|wtfismyip\.com|ipify\.org|ip\.sb/.test(e.URL)));
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
            // Speedtest 中国优化
            const e = await m(`https://api-v3.speedtest.cn/ip?ip=${h}`, o);
            if (e && e.data && e.data.country === "中国") {
                let { province: t, isp: n, city: i, countryCode: o } = e.data;
                cn = !0, s && (h = u(h)), f = "入口国家: \t" + d(o) + t + " " + i + "\n入口IP: \t" + h + ": " + e.tk + "ms\n入口ISP: \t" + n + r + "\n---------------------\n"
            } else { cn = !1; f = ""; }
        }
        // 通用查询
        if ((!N || isv6) && !cn && f === "") {
            const e = await m(`http://ip-api.com/json/${h}?lang=zh-CN`, c);
            if (e && e.country) {
                let { countryCode: t, country: n, city: i, isp: c } = e;
                s && (h = u(h));
                let a = n + " " + i;
                f = "入口国家: \t" + d(t) + a + "\n入口IP: \t" + h + ": " + e.tk + "ms\n入口ISP: \t" + c + r + "\n---------------------\n"
            }
        }
    }

    // ============================================
    // 5. 内网 IP (LAN) - 双栈支持
    // ============================================
    let lan = "";
    try {
        if (typeof $network !== "undefined") {
            // IPv4
            if ($network.v4 && $network.v4.primaryAddress) {
                lan += "🅻 " + $network.v4.primaryAddress + "\n";
            }
            // IPv6
            if ($network.v6 && $network.v6.primaryAddress) {
                let v6 = $network.v6.primaryAddress;
                if (s) v6 = u(v6);
                lan += "🅻 " + v6 + "\n";
            }
        }
    } catch(err) {}

    // ============================================
    // 6. 本机公网 IP (Local Public) - IPIP + Bilibili
    // ============================================
    let localPub = "";
    const bilibiliHeaders = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36",
        "Referer": "https://www.bilibili.com/"
    };

    // Source A: IPIP.net
    try {
        console.log("Local: Fetching IPIP...");
        const res = await m("http://myip.ipip.net", o, { "User-Agent": "curl/7.29.0" });
        let text = res.raw || (typeof res === "string" ? res : "");
        if (text.includes("当前 IP")) {
            let ip = text.match(/IP：(.*?) /)[1].trim();
            let loc = text.match(/来自于：(.*)/)[1].trim();
            if (s) ip = u(ip);
            localPub = "🏠 " + ip + " (" + loc + ")\n";
        }
    } catch(e) {}

    // Source B: Bilibili Live
    if (!localPub) {
        try {
            console.log("Local: Fetching Bilibili Live...");
            const res = await m("https://api.live.bilibili.com/xlive/web-room/v1/index/getIpInfo", o, bilibiliHeaders);
            if (res && res.code === 0 && res.data) {
                let { addr, country, province, city, isp } = res.data;
                if (s) addr = u(addr);
                let locStr = [country, province, city, isp].filter(Boolean).join(" ");
                localPub = "🏠 " + addr + " (" + locStr + ")\n";
            }
        } catch(e) {}
    }

    // Source C: Bilibili Main
    if (!localPub) {
        try {
            console.log("Local: Fetching Bilibili Zone...");
            const res = await m("https://api.bilibili.com/x/web-interface/zone", o, bilibiliHeaders);
            if (res && res.code === 0 && res.data) {
                let { addr, country, province, city, isp } = res.data;
                if (s) addr = u(addr);
                let locStr = [country, province, city, isp].filter(Boolean).join(" ");
                localPub = "🏠 " + addr + " (" + locStr + ")\n";
            }
        } catch(e) {}
    }

    // ============================================
    // 7. 组装输出
    // ============================================
    let sep = "";
    if (f !== "") {
        sep = "---------------------\n";
    }

    a = {
        title: l + y,
        content: lan + localPub + sep + f + w + p,
        icon: e,
        "icon-color": t
    }
})().catch((e => console.log(e.message))).finally((() => $done(a)));
