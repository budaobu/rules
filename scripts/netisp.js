// @timestamp thenkey 2025-10-15 13:54:57
// 修改说明: 
// 1. [落地IP] 增加备用源: wtfismyip.com (当 ip-api 失败时自动调用)
// 2. [本机IP] 保持双源策略: ipip.net + taobao
// 3. 保持 LAN IP 在最前显示

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
                                    } catch { t(o) }
                                } else {
                                    t(o);
                                }
                            } else {
                                t("error");
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
    let n = "",
        l = "节点信息查询",
        r = "代理链",
        p = "",
        f = "",
        y = "";
        
    // ------------------------------------------------
    // 1. 获取落地信息 (Exit Info) - 双重保险
    // ------------------------------------------------
    let P = await m("http://ip-api.com/json/?lang=zh-CN", c);
    
    // 策略A: IP-API (主)
    if (typeof P === 'object' && P.status === 'success') {
        console.log("Landing Source: IP-API");
        let { country: e, countryCode: t, query: o, city: ci, isp: lp, as: as, tk: g } = P;
        n = o; 
        if (s) o = u(o);
        if (e === ci) ci = "";
        p = " \t" + (d(t) + e + " " + ci) + "\n落地IP: \t" + o + ": " + g + "ms\n落地ISP: \t" + lp + "\n落地ASN: \t" + as;
    } else {
        // 策略B: WTFIsMyIP (备)
        console.log("Landing Source: WTFIsMyIP (Fallback)");
        try {
            P = await m("https://wtfismyip.com/json", c);
            if (P && P.YourFuckingIPAddress) {
                let o = P.YourFuckingIPAddress;
                let loc = P.YourFuckingLocation; // 格式通常为: "City, State, Country"
                let lp = P.YourFuckingISP;
                let t = P.YourFuckingCountryCode;
                let g = P.tk;
                
                n = o;
                if (s) o = u(o);
                
                // 尝试简化 location 字符串
                let locShort = loc; 
                
                p = " \t" + (d(t) + " " + locShort) + "\n落地IP: \t" + o + ": " + g + "ms\n落地ISP: \t" + lp;
            } else {
                p = " \t" + "落地信息获取失败";
            }
        } catch (err) {
            console.log("Fallback failed: " + err);
            p = " \t" + "落地信息获取失败";
        }
    }

    // ------------------------------------------------
    // 2. 检测 GPT
    // ------------------------------------------------
    if (i) {
        const e = await m("http://chat.openai.com/cdn-cgi/trace", c),
            t = ["CN", "TW", "HK", "IR", "KP", "RU", "VE", "BY"];
        if ("string" != typeof e) {
            let { loc: n, tk: i, warp: s, ip: o } = e, c = "";
            try {
                let lines = e.split("\n");
                let data = {};
                lines.forEach(line => {
                    let parts = line.split("=");
                    if(parts.length===2) data[parts[0]] = parts[1];
                });
                n = data.loc;
            } catch(err){}
            c = -1 == t.indexOf(n) ? "GPT: " + n + " ✓" : "GPT: " + n + " ×";
            l = c;
        } else l = "ChatGPT: -" 
    }

    // ------------------------------------------------
    // 3. 分析历史请求 (入口链分析)
    // ------------------------------------------------
    let h, w = "";
    try {
        let reqs = await g();
        // 尝试匹配 ip-api 或者 wtfismyip 的请求
        let k = reqs.requests.slice(0, 8).filter((e => /ip-api\.com|wtfismyip\.com/.test(e.URL)));
        if (k.length > 0) {
            const e = k[0];
            y = ": " + e.policyName, /\(Proxy\)/.test(e.remoteAddress) ? (h = e.remoteAddress.replace(" (Proxy)", ""), r = "") : (h = "Noip", w = "代理链地区:")
        } else h = "Noip";
    } catch(err) { h = "Noip"; }

    // ------------------------------------------------
    // 4. 获取入口IP详情 (Entry Info)
    // ------------------------------------------------
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
    }

    // ------------------------------------------------
    // 5. 获取本地内网 IP (LAN_IP)
    // ------------------------------------------------
    let lan = "";
    try {
        if (typeof $network !== "undefined" && $network.v4 && $network.v4.primaryAddress) {
            lan = "🅻 " + $network.v4.primaryAddress + "\n";
        }
    } catch(err) {}

    // ------------------------------------------------
    // 6. 获取本机公网 IP (CN_IP/Direct IP)
    // ------------------------------------------------
    let localPub = "";
    try {
        // Source A: ipip.net
        const ipipRes = await m("http://myip.ipip.net", o, { "User-Agent": "Mozilla/5.0" });
        if (typeof ipipRes === "string" && ipipRes.includes("当前 IP")) {
            let ipMatch = ipipRes.match(/IP：(.*?) /);
            let locMatch = ipipRes.match(/来自于：(.*)/);
            if (ipMatch) {
                let dispIp = ipMatch[1].trim();
                let locStr = locMatch ? locMatch[1].trim() : "";
                if (s) dispIp = u(dispIp);
                localPub = "🏠 " + dispIp + " (" + locStr + ")\n";
            }
        }
    } catch (e) {}

    if (!localPub) {
        try {
            // Source B: Taobao
            const tbRes = await m("https://www.taobao.com/help/getip.php", o);
            if (typeof tbRes === "string") {
                 let ipMatch = tbRes.match(/"(.*?)"/);
                 if (ipMatch) {
                     let dispIp = ipMatch[1];
                     if (s) dispIp = u(dispIp);
                     localPub = "🏠 " + dispIp + " (CN Direct)\n";
                 }
            }
        } catch (e) {}
    }

    // 7. 分割线
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
