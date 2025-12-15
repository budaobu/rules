// @timestamp thenkey 2025-12-15 10:47:57
// 修改说明: 
// 1. [修复] GPT/Warp 检测逻辑，恢复 Priv: Plus 显示格式
// 2. [保留] 本地 LAN IP 在最前
// 3. [保留] 双重本地公网 IP 源 (IPIP + Taobao)
// 4. [保留] 落地 IP 备用源 (WTFIsMyIP)

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

// 核心请求函数 (已优化 text/plain 自动转对象)
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
                                // 逻辑优化：只要不是明确的 json，都尝试解析 key=value 或 key:value
                                if (type.includes("application/json")) {
                                    try {
                                        let j = JSON.parse(o);
                                        j.tk = e;
                                        t(j);
                                    } catch { t({ tk: e, raw: o }) }
                                } else {
                                    // 通用文本解析 (trace, cip.cc 等)
                                    // 将 "key=value" 或 "key: value" 转换为对象
                                    let obj = { tk: e };
                                    let lines = o.split("\n");
                                    lines.forEach(line => {
                                        // 兼容 = 和 : 分隔符
                                        let parts = line.split(/\s*[=:]\s*/);
                                        if (parts.length >= 2) {
                                            obj[parts[0].trim()] = parts.slice(1).join(":").trim();
                                        }
                                    });
                                    // 如果解析没弄出什么属性，就把原始文本存进去
                                    if (Object.keys(obj).length === 1) obj.raw = o;
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
    let n = "",
        l = "节点信息查询", // Title
        r = "代理链",
        p = "", // Landing Info
        f = "", // Entry Info
        y = ""; // Policy Name
        
    // ------------------------------------------------
    // 1. 获取落地信息 (Exit Info) - 双重保险
    // ------------------------------------------------
    let P = await m("http://ip-api.com/json/?lang=zh-CN", c);
    
    // 策略A: IP-API
    if (P && P.status === 'success') {
        console.log("Landing Source: IP-API");
        let { country: e, countryCode: t, query: o, city: ci, isp: lp, as: as, tk: g } = P;
        n = o; 
        if (s) o = u(o);
        if (e === ci) ci = "";
        p = " \t" + (d(t) + e + " " + ci) + "\n落地IP: \t" + o + ": " + g + "ms\n落地ISP: \t" + lp + "\n落地ASN: \t" + as;
    } else {
        // 策略B: WTFIsMyIP
        console.log("Landing Source: WTFIsMyIP (Fallback)");
        try {
            P = await m("https://wtfismyip.com/json", c);
            if (P && P.YourFuckingIPAddress) {
                let o = P.YourFuckingIPAddress;
                let loc = P.YourFuckingLocation;
                let lp = P.YourFuckingISP;
                let t = P.YourFuckingCountryCode;
                let g = P.tk;
                n = o;
                if (s) o = u(o);
                p = " \t" + (d(t) + " " + loc) + "\n落地IP: \t" + o + ": " + g + "ms\n落地ISP: \t" + lp;
            } else {
                p = " \t" + "落地信息获取失败";
            }
        } catch (err) {
            p = " \t" + "落地信息获取失败";
        }
    }

    // ------------------------------------------------
    // 2. 检测 GPT & Warp (核心修复部分)
    // ------------------------------------------------
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

    // ------------------------------------------------
    // 3. 分析历史请求 (入口链分析)
    // ------------------------------------------------
    let h, w = "";
    try {
        let reqs = await g();
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
    // 5. 获取本地内网 IP (LAN_IP) - 双栈版
    // ------------------------------------------------
    let lan = "";
    try {
        if (typeof $network !== "undefined") {
            // 获取 IPv4
            if ($network.v4 && $network.v4.primaryAddress) {
                lan += "🅻 " + $network.v4.primaryAddress + "\n";
            }
            // 获取 IPv6 (新增)
            if ($network.v6 && $network.v6.primaryAddress) {
                // 考虑到面板空间，IPv6 可能太长，这里做简单的压缩或仅显示前缀可根据需求调整
                // 这里原样显示，并应用打码逻辑(如果开启的话)
                let v6 = $network.v6.primaryAddress;
                if (s) v6 = u(v6); // 复用打码函数
                lan += "🅻 " + v6 + "\n";
            }
        }
    } catch(err) {}

    // ------------------------------------------------
    // 6. 获取本机公网 IP (CN_IP/Direct IP)
    // ------------------------------------------------
    let localPub = "";
    try {
        // Source A: ipip.net
        const ipipRes = await m("http://myip.ipip.net", o, { "User-Agent": "Mozilla/5.0" });
        // m 函数现在可能返回对象(被通用文本解析处理了)，我们需要取出原始值或按 key 查找
        // ipip 返回格式: "当前 IP：x.x.x.x  来自于：中国..."
        // 解析器会将其转为 {"当前 IP": "x.x.x.x  来自于：中国..."} 或者 raw
        
        let ipipText = ipipRes.raw || (typeof ipipRes === "string" ? ipipRes : "");
        // 假如解析器把 "当前 IP：1.1.1.1" 解析成了 key="当前 IP" value="1.1.1.1..."
        if (!ipipText && ipipRes["当前 IP"]) {
             ipipText = "当前 IP：" + ipipRes["当前 IP"]; // 重组方便正则
        } else if (!ipipText) {
             // 兜底: 遍历对象值
             ipipText = JSON.stringify(ipipRes);
        }

        if (ipipText.includes("当前 IP")) {
            let ipMatch = ipipText.match(/IP：(.*?) /);
            let locMatch = ipipText.match(/来自于：(.*)/);
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
            // tbRes 通常返回 ipCallback({ip:"..."})
            // m 函数可能会把它当纯文本存入 raw
            let tbText = tbRes.raw || (typeof tbRes === "string" ? tbRes : JSON.stringify(tbRes));
            let ipMatch = tbText.match(/"(.*?)"/);
            if (ipMatch) {
                 let dispIp = ipMatch[1];
                 if (s) dispIp = u(dispIp);
                 localPub = "🏠 " + dispIp + " (CN Direct)\n";
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
