/*
 * ChatGPT Panel
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

            // 4. 判定逻辑
            const blockedCountries = ["CN", "HK", "IR", "KP", "RU", "VE", "BY"];
            const isRegionBlocked = blockedCountries.includes(loc);
            
            // 最终可用性
            let isAvailable = !isRegionBlocked && isLive;

            // 5. 格式化输出
            let iconStr = isAvailable ? "✅" : "❌";
            
            let warpText = "Off";
            if (warp === "on") warpText = "On";
            if (warp === "plus") warpText = "Plus";

            let latencyStr = tk ? `${tk}ms` : "0ms";

            panel.title = `ChatGPT ${latencyStr}`;

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
