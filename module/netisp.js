// 2025-12-15 14:00:00
// 修改说明: 
// 1. [新增] 入口 IP 详情增加 ipapi.co 作为备用接口
// 2. [保持] 本地公网 IP 4 个源 (IPIP/Bili/BiliZone/NetEase)
// 3. [保持] GPT 检测逻辑不变
// 4. [保持] 落地 IP 5 个源

let e = "globe.asia.australia",
    t = "#6699FF",
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

// 核心请求函数
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
    
    // ============================================
    // 1. 获取落地信息 (Landing IP)
    // ============================================
    const ua = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1" };
    let P = await m("http://ip-api.com/json/?lang=zh-CN", c, ua);
    let landingFound = false;

    // Source A: IP-API
    if (P && P.status === 'success') {
        let { country: e, countryCode: t, query: o, city: ci, isp: lp, as: as, tk: g } = P;
        n = o; if (s) o = u(o); if (e === ci) ci = "";
        p = " \t" + (d(t) + e + " " + ci) + "\n落地IP: \t" + o + ": " + g + "ms\n落地ISP: \t" + lp + "\n落地ASN: \t" + as;
        landingFound = true;
    }

    // Source B: IPInfo.io
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

    // Source C: WTFIsMyIP
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

    // Source D: IP.SB
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

    // Source E: Ipify
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
    // 2. 检测 GPT & Warp (保持不变)
    // ============================================
    if (i) {
        const gptData = await m("http://chat.openai.com/cdn-cgi/trace", c);
        const blockedCountries = ["CN", "TW", "HK", "IR", "KP", "RU", "VE", "BY"];

        if (typeof gptData !== "string") {
            let { loc, tk, warp, ip } = gptData;
            
            if (loc) {
                let status = "";
                status = blockedCountries.indexOf(loc) === -1 ? `GPT: ${loc} ✔️` : `GPT: ${loc} ✖️`;
                
                if (warp === "plus") {
                    warp = "Plus";
                }
                
                l = `${status}       ➟     Priv: ${warp}   ${tk}ms`;
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
        let k = reqs.requests.slice(0, 8).filter((e => /ip-api\.com|ipinfo\.io|wtfismyip\.com|ipify\.org|ip\.sb/.test(e.URL)));
        if (k.length > 0) {
            const e = k[0];
            y = ": " + e.policyName, /\(Proxy\)/.test(e.remoteAddress) ? (h = e.remoteAddress.replace(" (Proxy)", ""), r = "") : (h = "Noip", w = "代理链地区:")
        } else h = "Noip";
    } catch(err) { h = "Noip"; }

    // ============================================
    // 4. 入口 IP 详情 (新增 ipapi.co)
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
        // Source B: ip-api.com
        if ((!N || isv6) && !cn && f === "") {
            const e = await m(`http://ip-api.com/json/${h}?lang=zh-CN`, c);
            if (e && e.country) {
                let { countryCode: t, country: n, city: i, isp: c } = e;
                s && (h = u(h));
                let a = n + " " + i;
                f = "入口国家: \t" + d(t) + a + "\n入口IP: \t" + h + ": " + e.tk + "ms\n入口ISP: \t" + c + r + "\n---------------------\n"
            }
        }
        // Source C: ipapi.co [新增]
        if ((!N || isv6) && !cn && f === "") {
            try {
                const e = await m(`https://ipapi.co/${h}/json`, c, ua);
                if (e && e.ip) {
                    let { country_code: t, country_name: n, city: i, org: c_isp, region: reg } = e;
                    s && (h = u(h));
                    let loc = n + " " + (reg||"") + " " + i;
                    f = "入口国家: \t" + d(t) + loc + "\n入口IP: \t" + h + ": " + e.tk + "ms\n入口ISP: \t" + c_isp + r + "\n---------------------\n";
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
    const bilibiliHeaders = { "User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com/" };

    // Source A: IPIP.net
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

    // Source B: Bilibili Live
    if (!localPub) {
        try {
            const res = await m("https://api.live.bilibili.com/xlive/web-room/v1/index/getIpInfo", o, bilibiliHeaders);
            if (res && res.code === 0 && res.data) {
                let { addr, country, province, city, isp } = res.data;
                if (s) addr = u(addr);
                let locStr = [country, province, city, isp].filter(Boolean).join(" ");
                localPub = "🏠 " + addr + " (" + locStr + ")\n";
            }
        } catch(e) {}
    }

    // Source C: Bilibili Zone
    if (!localPub) {
        try {
            const res = await m("https://api.bilibili.com/x/web-interface/zone", o, bilibiliHeaders);
            if (res && res.code === 0 && res.data) {
                let { addr, country, province, city, isp } = res.data;
                if (s) addr = u(addr);
                let locStr = [country, province, city, isp].filter(Boolean).join(" ");
                localPub = "🏠 " + addr + " (" + locStr + ")\n";
            }
        } catch(e) {}
    }
    
    // Source D: NetEase (126.net)
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
        "icon-color": t
    }
})().catch((e => console.log(e.message))).finally((() => $done(a)));
