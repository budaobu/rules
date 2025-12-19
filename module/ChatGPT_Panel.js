/*
 * ChatGPT Panel 
 * 功能：双重验证 (Trace + Server Status)
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

    // 2. 核心检测逻辑
    const traceUrl = "http://chat.openai.com/cdn-cgi/trace";
    const statusUrl = "https://ios.chat.openai.com/public-api/mobile/server_status/v1";

    let panel = { title: 'ChatGPT', content: '检测中...', icon: cfg.icon, 'icon-color': cfg.color };

    try {
        // 并行请求：Method B 的精髓，利用 m 函数自动解析数据并计算 tk (延迟)
        const [gptData, statusResp] = await Promise.all([
            m(traceUrl, 3000), 
            m(statusUrl, 3000)
        ]);

        // 3. 数据处理
        if (gptData && typeof gptData === 'object') {
            let { loc, warp, tk } = gptData; // 直接获取 m 函数计算的 tk
            loc = loc || "XX";
            
            // 解析官方状态 (Server Status)
            let isLive = false;
            try {
                // statusResp 可能是解析后的 JSON 或包含 raw 的对象
                let json = statusResp; 
                if (statusResp.raw) {
                    try { json = JSON.parse(statusResp.raw); } catch(e){}
                }
                
                if (json.status === "normal") isLive = true;
            } catch (e) { isLive = false; }

            // 4. 判定逻辑
            // 黑名单
            const blockedCountries = ["CN", "HK", "IR", "KP", "RU", "VE", "BY"];
            const isRegionBlocked = blockedCountries.includes(loc);
            
            // 最终可用性：不在黑名单 且 官方状态正常
            let isAvailable = !isRegionBlocked && isLive;

            // 5. 格式化输出
            let iconStr = isAvailable ? "✅" : "❌";
            
            let warpText = "Off";
            if (warp === "on") warpText = "On";
            if (warp === "plus") warpText = "Plus";

            // 直接使用 gptData.tk 作为延迟数据
            let latencyStr = tk ? `${tk}ms` : "0ms";

            // 核心文本构造
            let contentText = `GPT: ${loc} ${iconStr}       ➟      Warp: ${warpText}   ${latencyStr}`;

            panel.content = contentText;
            if (isAvailable) {
                panel.icon = cfg.icon;
                panel['icon-color'] = cfg.color;
            } else {
                panel.icon = cfg.iconErr;
                panel['icon-color'] = cfg.colorErr;
            }
        } else {
            // 数据异常回退
            panel.content = "ChatGPT: 数据解析异常";
            panel.icon = "exclamationmark.triangle";
        }

    } catch (error) {
        console.log(error);
        panel.content = "检测失败: 网络错误";
        panel.icon = "exclamationmark.triangle";
        panel['icon-color'] = "#FF9500";
    }

    $done(panel);
})();

// ============================================
// 核心函数提取： m()
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
