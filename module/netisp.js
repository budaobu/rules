/**
 * Surge Network Info - Entrance API Restored + IPPure Enhanced
 * Update: Enhanced IPPure detection headers, regex, and fallback logic.
 */

const $ = {
  isSurge: () => true,
  lodash_get: (obj, path, defaultValue) => {
    const travel = regexp =>
      String.prototype.split
        .call(path, regexp)
        .filter(Boolean)
        .reduce((res, key) => (res !== null && res !== undefined ? res[key] : res), obj);
    const result = travel(/[,[\]]+?/) || travel(/[,[\].]+?/);
    return result === undefined || result === null ? defaultValue : result;
  },
  log: (...args) => console.log(args.join(' ')),
  logErr: (err) => console.log(`❗️Error: ${err}`),
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  done: (val) => $done(val),
  // 封装 Surge HTTP 请求
  http: {
    get: (opts) => new Promise((resolve, reject) => {
      // 允许 opts.timeout 覆盖全局设置 (Surge timeout 单位为秒)
      $httpClient.get(opts, (err, resp, body) => {
        if (err) reject(err);
        else resolve({ status: resp.status, headers: resp.headers, body });
      });
    })
  }
};

let arg;
if (typeof $argument != 'undefined') {
  arg = Object.fromEntries($argument.split('&').map(item => item.split('=')));
} else {
  arg = {};
}

// 默认参数
arg = {
    TIMEOUT: 5,
    RETRIES: 1,
    RETRY_DELAY: 1,
    Proxy: 'Proxy', 
    ...arg
};

(async () => {
  let title = '';
  let content = '';
  let proxy_policy = '';

  // 1. 获取基础网络信息 (SSID, LAN)
  let SSID = '';
  let LAN = '';
  if (typeof $network !== 'undefined') {
    if ($.lodash_get(arg, 'SSID') == 1) SSID = $.lodash_get($network, 'wifi.ssid');
    const v4 = $.lodash_get($network, 'v4.primaryAddress');
    const v6 = $.lodash_get($network, 'v6.primaryAddress');
    if (v4 && $.lodash_get(arg, 'LAN') == 1) LAN += `🅻: ${v4} `;
    if (v6 && $.lodash_get(arg, 'LAN') == 1 && $.lodash_get(arg, 'IPv6') == 1) LAN += `${maskIP(v6)}`;
  }
  if (LAN) LAN = `${LAN.trim()}\n`;
  if (SSID) SSID = `SSID: ${SSID}\n`; else SSID = '';

  // 2. 并行查询：本地公网(Direct) 和 落地(Proxy)
  let [
    { CN_IP = '', CN_INFO = '' } = {},
    { PROXY_IP = '', PROXY_INFO = '', PROXY_PRIVACY = '' } = {},
    { CN_IPv6 = '' } = {},
    { PROXY_IPv6 = '' } = {},
  ] = await Promise.all(
    $.lodash_get(arg, 'IPv6') == 1
      ? [getDirectInfo(), getProxyInfoAndRisk(), getDirectInfoIPv6(), getProxyInfoIPv6()]
      : [getDirectInfo(), getProxyInfoAndRisk()]
  );

  // 3. --- 获取入口 IP (Node IP) ---
  let ENTRANCE_IP = '';
  let PROXY_POLICY = ''; // 策略名
  
  await $.wait(100); 
  // 查找 ip-api 或 ippure 的请求记录
  const reqInfo = await getRequestInfoFromAPI(/ip-api\.com|ippure\.com|ipinfo\.io/);
  
  if (reqInfo.IP) ENTRANCE_IP = reqInfo.IP;
  if (reqInfo.POLICY) PROXY_POLICY = reqInfo.POLICY;

  // 4. 处理入口显示逻辑
  let ENTRANCE_TEXT = '';
  
  // 如果入口 IP 存在且不等于落地 IP，说明经过了代理
  if (ENTRANCE_IP && ENTRANCE_IP !== PROXY_IP) {
      
      let resolvedEntrance = ENTRANCE_IP;
      if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ENTRANCE_IP) && !/:/.test(ENTRANCE_IP)) {
           // 是域名，尝试解析
           try {
               const dns = await resolveDomain(ENTRANCE_IP);
               if (dns) {
                   resolvedEntrance = `${ENTRANCE_IP} ➟ ${dns}`;
               }
           } catch(e){}
      }

      // 只有当入口IP和本地IP不同时，才去查询入口IP的位置
      let entranceGeo = "";
      if (ENTRANCE_IP !== CN_IP) {
           const entInfo = await getDirectInfo(ENTRANCE_IP);
           if (entInfo.CN_INFO) entranceGeo = `\n${maskAddr(entInfo.CN_INFO)}`;
      }

      ENTRANCE_TEXT = `入口: ${maskIP(resolvedEntrance)}${entranceGeo}\n\n`;
  }

  // 5. 格式化 IPv6
  if (CN_IPv6 && isIPv6(CN_IPv6) && $.lodash_get(arg, 'IPv6') == 1) CN_IPv6 = `\n${maskIP(CN_IPv6)}`; else CN_IPv6 = '';
  if (PROXY_IPv6 && isIPv6(PROXY_IPv6) && $.lodash_get(arg, 'IPv6') == 1) PROXY_IPv6 = `\n${maskIP(PROXY_IPv6)}`; else PROXY_IPv6 = '';

  // 6. 策略名称显示
  const policy_prefix = '代理策略: ';
  if (PROXY_POLICY && PROXY_POLICY !== 'DIRECT') {
    proxy_policy = `${policy_prefix}${maskAddr(PROXY_POLICY)}`;
  } else if ($.lodash_get(arg, 'Proxy')) {
    proxy_policy = `${policy_prefix}${$.lodash_get(arg, 'Proxy')}`;
  }

  // 7. 组装内容
  title = `${proxy_policy}`;
  
  if (PROXY_INFO) PROXY_INFO = `\n${PROXY_INFO}`;
  if (PROXY_PRIVACY) PROXY_PRIVACY = `\n${PROXY_PRIVACY}`;

  const local_part = `IP: ${maskIP(CN_IP) || '-'}${CN_IPv6}${maskAddr(CN_INFO)}\n\n`;
  const landing_part = `落地: ${maskIP(PROXY_IP) || '-'}${PROXY_IPv6}${maskAddr(PROXY_INFO)}${PROXY_PRIVACY}`;

  content = `${SSID}${LAN}${local_part}${ENTRANCE_TEXT}${landing_part}`;

  // 8. 输出
  if (typeof $request === 'undefined') {
    content = `${content}\n执行时间: ${new Date().toTimeString().split(' ')[0]}`;
  }
  
  title = title || '网络信息 𝕏';

  if (typeof $request !== 'undefined') {
      $.done({
          response: {
              status: 200,
              body: JSON.stringify({ title, content }, null, 2),
              headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          },
      });
  } else {
      $.done({
          title,
          content,
          icon: $.lodash_get(arg, 'ICON', 'globe.asia.australia'),
          "icon-color": $.lodash_get(arg, 'ICON-COLOR', '#6699FF')
      });
  }

})().catch(e => {
  $.logErr(e);
  $.done({ title: '❌ 错误', content: e.message || String(e) });
});


// ===========================================
// 核心检测函数
// ===========================================

// --- 1. 获取 Surge 最近请求 (入口检测) ---
async function getRequestInfoFromAPI(regexp) {
  let POLICY = '';
  let IP = '';
  try {
      const result = await new Promise((resolve) => {
          $httpAPI('GET', '/v1/requests/recent', null, (data) => resolve(data));
      });
      const requests = result.requests || [];
      const request = requests.slice(0, 20).find(i => regexp.test(i.URL));
      if (request) {
          POLICY = request.policyName;
          if (/\(Proxy\)/.test(request.remoteAddress)) {
            IP = request.remoteAddress.replace(/\s*\(Proxy\)\s*/, '');
          }
      }
  } catch (e) { $.logErr(`API Error: ${e}`); }
  return { POLICY, IP };
}

// --- 2. 落地检测 & 纯净度 (增强版) ---
async function getProxyInfoAndRisk() {
    const opts = { policy: $.lodash_get(arg, 'Proxy') };
    
    // IPPure (Risk) - 增强 Headers 和 逻辑
    const riskPromise = (async () => {
        try {
            const ua = { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://ippure.com/",
                "Origin": "https://ippure.com",
                "Accept": "application/json, text/plain, */*"
            };

            const res = await http({ 
                ...opts, 
                url: `https://my.ippure.com/v1/info`, 
                headers: ua,
                timeout: 8 // 8s 超时
            });
            const body = JSON.parse(res.body);

            // 逻辑定义
            let riskLabel = "";
            let nativeText = "";
            let isResidential = body.isResidential;
            let fraudScore = body.fraudScore;
            // 组合组织名和ISP用于正则匹配
            let lp = body.asOrganization || body.isp || "";

            // 原生/数据中心检测
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

            // 风险值检测
            if (typeof fraudScore !== "undefined" && fraudScore !== null) {
                let risk = parseInt(fraudScore);
                if (risk >= 76) riskLabel = `🛑极高风险(${risk})`;
                else if (risk >= 51) riskLabel = `⚠️高风险(${risk})`;
                else if (risk >= 26) riskLabel = `🔶中风险(${risk})`;
                else riskLabel = `✅低风险(${risk})`;
            } else {
                riskLabel = "⚠️无风控数据";
            }
            
            return `纯净度: ${riskLabel}  ${nativeText}`;
        } catch(e) { 
            return ""; // 检测失败不显示，避免干扰布局
        }
    })();

    // IP-API (Landing Info)
    const infoPromise = (async () => {
        try {
            const res = await http({ ...opts, url: `http://ip-api.com/json/?lang=zh-CN`, headers: {'User-Agent': 'Mozilla/5.0'} });
            const body = JSON.parse(res.body);
            if (body.status === 'success') {
                 let info = [
                    ['位置:', getflag(body.countryCode), body.country, body.regionName, body.city].filter(i=>i).join(' '),
                    ['运营商:', body.isp || body.org].filter(i=>i).join(' '),
                    $.lodash_get(arg, 'ASN') == 1 ? ['ASN:', body.as].filter(i=>i).join(' ') : undefined
                 ].filter(i=>i).join('\n');
                 return { ip: body.query, info: simplifyAddr(info) };
            }
        } catch(e) {}
        // Fallback: ipinfo
        try {
            const res = await http({ ...opts, url: `https://ipinfo.io/json` });
            const body = JSON.parse(res.body);
            let info = `位置: ${getflag(body.country)} ${body.city}\n运营商: ${body.org}`;
            return { ip: body.ip, info };
        } catch(e) {}
        return { ip: '', info: '' };
    })();

    const [risk, infoData] = await Promise.all([riskPromise, infoPromise]);
    return { PROXY_IP: infoData.ip, PROXY_INFO: infoData.info, PROXY_PRIVACY: risk };
}

// --- 3. 本地 ISP 检测 ---
async function getDirectInfo(ip) {
    let CN_IP, CN_INFO;
    // 如果传入了 ip，就不指定策略，否则强制 DIRECT 直连
    const opts = ip ? {} : { policy: 'DIRECT' }; 

    // ========= 修改开始：处理指定 IP 查询 =========
    if (ip) {
        // 优先级 1: speedtest.cn (新增首选)
        try {
            const res = await http({ 
                ...opts, 
                url: `https://api-v3.speedtest.cn/ip?ip=${ip}`, 
                headers: {'User-Agent': 'Mozilla/5.0'} 
            });
            const body = JSON.parse(res.body);
            if (body.code === 0 && body.data) {
                const data = body.data;
                // 组装信息: 图标 + 国家 + 省份 + 城市
                // 注意: speedtest.cn 返回的 countryCode 是 "CN" 这种格式，可以直接用于 getflag
                const location = [
                    getflag(data.countryCode), 
                    data.country, 
                    data.province, 
                    data.city, 
                    data.district
                ].filter(Boolean).join(' '); // filter(Boolean) 去除空字符串

                CN_INFO = `位置: ${location}\n运营商: ${data.isp}`;
                
                // 返回结果
                return { CN_IP: ip, CN_INFO: simplifyAddr(CN_INFO) };
            }
        } catch (e) {
            // speedtest 失败，静默失败，继续向下执行 ip-api
            // $.log(`Speedtest API failed: ${e}`); // 调试用
        }

        // 优先级 2: ip-api.com (原有逻辑，作为备选)
        try {
            const res = await http({ ...opts, url: `http://ip-api.com/json/${ip}?lang=zh-CN`, headers: {'User-Agent': 'Mozilla/5.0'} });
            const body = JSON.parse(res.body);
            if (body.status === 'success') {
                 CN_INFO = `位置: ${getflag(body.countryCode)} ${body.country} ${body.city}\n运营商: ${body.isp}`;
                 return { CN_IP: ip, CN_INFO: simplifyAddr(CN_INFO) };
            }
        } catch(e) {}
        
        // 都失败了返回空
        return {};
    }

    try {
        const res = await http({ ...opts, url: `https://api.live.bilibili.com/xlive/web-room/v1/index/getIpInfo`, headers: {"User-Agent": "Mozilla/5.0"} });
        const body = JSON.parse(res.body);
        if (body.code === 0 && body.data) {
             const data = body.data;
             CN_IP = data.addr;
             CN_INFO = `位置: ${getflag('CN')} ${data.country} ${data.province} ${data.city}\n运营商: ${data.isp}`;
             return { CN_IP, CN_INFO: simplifyAddr(CN_INFO) };
        }
    } catch(e) {}

    try {
        const res = await http({ ...opts, url: `https://ipservice.ws.126.net/locate/api/getLocByIp` });
        const body = JSON.parse(res.body);
        const data = body.result;
        CN_IP = data.ip;
        CN_INFO = `位置: ${getflag('CN')} ${data.country} ${data.province} ${data.city}\n运营商: ${data.company}`;
        return { CN_IP, CN_INFO: simplifyAddr(CN_INFO) };
    } catch(e) {}
    return {};
}

// 域名解析
async function resolveDomain(domain) {
    return new Promise((resolve) => {
        $httpClient.dns(domain, (error, data) => {
            if (data && data.address) resolve(data.address);
            else resolve(null);
        });
    });
}

async function getDirectInfoIPv6() {
  try { return { CN_IPv6: (await http({ url: `https://ipv6.ddnspod.com` })).body.trim() }; } catch (e) { return {}; }
}
async function getProxyInfoIPv6() {
  try { return { PROXY_IPv6: (await http({ url: `https://api-ipv6.ip.sb/ip`, policy: $.lodash_get(arg, 'Proxy') })).body.trim() }; } catch (e) { return {}; }
}

// 辅助函数
function simplifyAddr(addr) { if (!addr) return ''; return addr.split(/\n/).map(i => Array.from(new Set(i.split(/\ +/))).join(' ')).join('\n'); }
function maskAddr(addr) { if (!addr || $.lodash_get(arg, 'MASK') != 1) return addr; const parts = addr.split(' '); if (parts.length >= 3) return [parts[0], '*', parts[parts.length - 1]].join(' '); const third = Math.floor(addr.length / 3); return addr.substring(0, third) + '*'.repeat(third) + addr.substring(2 * third); }
function maskIP(ip) { if (!ip || $.lodash_get(arg, 'MASK') != 1) return ip; if (ip.includes('.')) { let parts = ip.split('.'); return [...parts.slice(0, 2), '*', '*'].join('.'); } else { let parts = ip.split(':'); return [...parts.slice(0, 4), '*', '*', '*', '*'].join(':'); } }
function getflag(code) { if ($.lodash_get(arg, 'FLAG', 1) != 1 || !code) return ''; if (code.toUpperCase() === 'TW') return '🇼🇸'; const t = code.toUpperCase().split('').map(e => 127397 + e.charCodeAt()); return String.fromCodePoint(...t); }
function isIPv6(ip) { return /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/.test(ip); }
async function http(opt) {
  const TIMEOUT = parseFloat(opt.timeout || $.lodash_get(arg, 'TIMEOUT') || 5);
  return new Promise((resolve, reject) => {
      $httpClient.get({...opt, timeout: TIMEOUT}, (err, resp, body) => {
          if(err) reject(err);
          else resolve({status: resp.status, body});
      });
  });
}
