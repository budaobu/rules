/*
 * ChatGPT Panel (Whitelist Ver.)
 * 核心逻辑：白名单地区检测 + NetISP m函数双重验证
 */

(async () => {
    // 1. 参数解析
    let args = {};
    if (typeof $argument !== "undefined") {
        $argument.split("&").forEach(item => {
            let [key, value] = item.split("=");
            args[key] = value;
        });
    }

    const cfg = {
        icon: args.icon || "lasso.and.sparkles",
        iconErr: args.iconerr || "xmark.seal.fill",
        color: args['icon-color'] || "#19C3AA",
        colorErr: args['iconerr-color'] || "#D65C51"
    };

    // 2. 核心检测配置
    const traceUrl = "http://chat.openai.com/cdn-cgi/trace";
    const statusUrl = "https://ios.chat.openai.com/public-api/mobile/server_status/v1";

    // 默认面板状态
    let panel = { title: 'ChatGPT', content: '点击刷新...', icon: cfg.icon, 'icon-color': cfg.color };

    try {
        // 并行请求：Trace + Server Status
        const [gptData, statusResp] = await Promise.all([
            m(traceUrl, 3000), 
            m(statusUrl, 3000)
        ]);

        // 3. 数据处理
        if (gptData && typeof gptData === 'object') {
            let { loc, warp, tk } = gptData;
            loc = loc || "XX";
            
            // 解析官方状态
            let isLive = false;
            try {
                let json = statusResp; 
                if (statusResp.raw) {
                    try { json = JSON.parse(statusResp.raw); } catch(e){}
                }
                if (json.status === "normal") isLive = true;
            } catch (e) { isLive = false; }

            // 4. 判定逻辑 (白名单模式)
            // 列表来源：[ChatGPT Supported Countries](https://help.openai.com/en/articles/7947663-chatgpt-supported-countries)
            const allowedCountries = [
                "AL","DZ","AF","AX","AD","AO","AG","AR","AM","AW","AU","AT","AZ","BS","BH","BD","BB","BE","BZ","BM","BJ","BT","BO","BA","BW","BR","BN","BG","BF","BI","CV","KH","CM","CA","KY","CF","TD","CL","CO","KM","CG","CD","CR","CI","HR","CY","CZ","DK","DJ","DM","DO","EC","EG","SV","GQ","ER","EE","SZ","ET","FO","FJ","FI","FR","GF","PF","TF","GA","GM","GE","DE","GH","GR","GD","GL","GT","GP","GN","GW","GY","HT","VA","HN","HU","IS","IN","ID","IQ","IE","IL","IT","JM","JP","JO","KZ","KE","KI","KW","KG","LA","LV","LB","LS","LR","LY","LI","LT","LU","MG","MW","MY","MV","ML","MT","MH","MQ","MR","MU","YT","MX","FM","MD","MC","MN","ME","MA","MZ","MM","NA","NR","NP","NL","NC","NZ","NI","NE","NG","MK","NO","OM","PK","PW","PS","PA","PG","PY","PE","PH","PL","PT","QA","RE","RO","RW","BL","SH","KN","LC","MF","PM","VC","WS","SM","ST","SA","SN","RS","SC","SL","SG","SK","SI","SB","SO","ZA","KR","SS","ES","LK","SR","SE","CH","SD","SJ","TW","TJ","TZ","TH","TL","TG","TO","TT","TN","TR","TM","TV","UG","UA","AE","GB","US","UY","UZ","VU","VN","WF","YE","ZM","ZW"
            ];
            
            // 核心判定：地区在白名单内 且 官方状态为 normal
            const isRegionAllowed = allowedCountries.includes(loc);
            let isAvailable = isRegionAllowed && isLive;

            // 5. 格式化输出
            let iconStr = isAvailable ? "✅" : "❌";
            
            let warpText = "Off";
            if (warp === "on") warpText = "On";
            if (warp === "plus") warpText = "Plus";

            // 延迟字符串
            let latencyStr = tk ? `${tk}ms` : "0ms";

            // 设置 Title：显示 "ChatGPT 延迟"
            panel.title = `ChatGPT ${latencyStr}`;

            // 设置 Content：Method B 格式
            // 如果地区不在白名单，虽然显示❌，但依然显示检测到的地区代码，方便排查
            let contentText = `GPT: ${loc} ${iconStr}       ➟      Warp: ${warpText}`;

            panel.content = contentText;
            
            if (isAvailable) {
                panel.icon = cfg.icon;
                panel['icon-color'] = cfg.color;
            } else {
                panel.icon = cfg.iconErr;
                panel['icon-color'] = cfg.colorErr;
            }
        } else {
            panel.title = "ChatGPT Error";
            panel.content = "数据解析异常";
            panel.icon = "exclamationmark.triangle";
        }

    } catch (error) {
        console.log(error);
        panel.title = "ChatGPT Error";
        panel.content = "检测失败: 网络错误";
        panel.icon = "exclamationmark.triangle";
        panel['icon-color'] = "#FF9500";
    }

    $done(panel);
})();

// ============================================
// 核心函数提取：NetISP m()
// ============================================
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
