/**
 * Modified for Surge Only
 * Feature: Removed ENV, Removed Event, Optimized Detection Logic
 */

// 简易 Surge API 封装，替代原 ENV 类
const $ = {
  isSurge: () => true,
  isStash: () => typeof $environment !== 'undefined' && $environment['stash-version'],
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
  getjson: (key, defaultValue) => {
    try {
      const val = $persistentStore.read(key);
      return val ? JSON.parse(val) : defaultValue;
    } catch { return defaultValue; }
  },
  http: {
    get: (opts) => new Promise((resolve, reject) => {
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
    Proxy: 'Proxy', // 默认策略
    ...arg
};

$.log(`配置参数: ${JSON.stringify(arg)}`);

// 主逻辑
(async () => {
  let result = {};
  let title = '';
  let content = '';
  let proxy_policy = '';

  // 1. 获取基础网络信息 (SSID, LAN)
  let SSID = '';
  let LAN = '';
  let LAN_IPv4 = '';
  let LAN_IPv6 = '';

  if (typeof $network !== 'undefined') {
    const v4 = $.lodash_get($network, 'v4.primaryAddress');
    const v6 = $.lodash_get($network, 'v6.primaryAddress');
    if ($.lodash_get(arg, 'SSID') == 1) {
      SSID = $.lodash_get($network, 'wifi.ssid');
    }
    if (v4 && $.lodash_get(arg, 'LAN') == 1) {
      LAN_IPv4 = v4;
    }
    if (v6 && $.lodash_get(arg, 'LAN') == 1 && $.lodash_get(arg, 'IPv6') == 1) {
      LAN_IPv6 = v6;
    }
  }

  if (LAN_IPv4 || LAN_IPv6) {
    LAN = ['LAN:', LAN_IPv4, maskIP(LAN_IPv6)].filter(i => i).join(' ');
  }
  if (LAN) LAN = `${LAN}\n\n`;
  if (SSID) SSID = `SSID: ${SSID}\n\n`; else SSID = '';

  // 2. 获取代理组信息 (用于判断策略)
  let { PROXIES = [] } = await getProxies();

  // 3. 并行查询信息
  // 注意：这里移除了 Event 相关的逻辑
  let [
    { CN_IP = '', CN_INFO = '', CN_POLICY = '' } = {},
    { PROXY_IP = '', PROXY_INFO = '', PROXY_PRIVACY = '', PROXY_POLICY = '', ENTRANCE_IP = '' } = {},
    { CN_IPv6 = '' } = {},
    { PROXY_IPv6 = '' } = {},
  ] = await Promise.all(
    $.lodash_get(arg, 'IPv6') == 1
      ? [getDirectRequestInfo({ PROXIES }), getProxyRequestInfo({ PROXIES }), getDirectInfoIPv6(), getProxyInfoIPv6()]
      : [getDirectRequestInfo({ PROXIES }), getProxyRequestInfo({ PROXIES })]
  );

  // 4. 处理入口IP逻辑 (如果落地检测到了入口IP)
  let ENTRANCE = '';
  if (ENTRANCE_IP && ENTRANCE_IP !== PROXY_IP) {
     // 简化的入口显示逻辑，不再进行复杂的二次查询以防超时，直接显示IP
     ENTRANCE = `入口 IP: ${maskIP(ENTRANCE_IP)}\n`;
  }
  if (ENTRANCE) ENTRANCE = `${ENTRANCE}\n`;

  // 5. 格式化 IPv6
  if (CN_IPv6 && isIPv6(CN_IPv6) && $.lodash_get(arg, 'IPv6') == 1) {
    CN_IPv6 = `\n${maskIP(CN_IPv6)}`;
  } else {
    CN_IPv6 = '';
  }
  if (PROXY_IPv6 && isIPv6(PROXY_IPv6) && $.lodash_get(arg, 'IPv6') == 1) {
    PROXY_IPv6 = `\n${maskIP(PROXY_IPv6)}`;
  } else {
    PROXY_IPv6 = '';
  }

  // 6. 格式化国内策略显示
  if (CN_POLICY === 'DIRECT') {
    CN_POLICY = ``;
  } else if (CN_POLICY) {
    CN_POLICY = `策略: ${maskAddr(CN_POLICY) || '-'}\n`;
  }

  if (CN_INFO) CN_INFO = `\n${CN_INFO}`;

  // 7. 格式化国外策略显示
  const policy_prefix = '代理策略: ';
  if (PROXY_POLICY === 'DIRECT') {
    PROXY_POLICY = `${policy_prefix}直连`;
  } else if (PROXY_POLICY) {
    PROXY_POLICY = `${policy_prefix}${maskAddr(PROXY_POLICY) || '-'}`;
  } else {
    PROXY_POLICY = '';
  }
  
  // 如果通过 recent requests 没找到策略名，尝试使用传入的 Proxy 参数
  if (!PROXY_POLICY && $.lodash_get(arg, 'Proxy')) {
      PROXY_POLICY = `${policy_prefix}${$.lodash_get(arg, 'Proxy')}`;
  }

  if (PROXY_POLICY) proxy_policy = PROXY_POLICY; else proxy_policy = '';

  if (PROXY_INFO) PROXY_INFO = `\n${PROXY_INFO}`;
  if (PROXY_PRIVACY) PROXY_PRIVACY = `\n${PROXY_PRIVACY}`;

  // 8. 组装最终内容
  title = `${PROXY_POLICY}`;
  content = `${SSID}${LAN}${CN_POLICY}IP: ${maskIP(CN_IP) || '-'}${CN_IPv6}${maskAddr(CN_INFO)}\n\n${ENTRANCE}落地 IP: ${maskIP(PROXY_IP) || '-'}${PROXY_IPv6}${maskAddr(PROXY_INFO)}${PROXY_PRIVACY}`;

  // 9. 输出
  if (!isInteraction()) {
    content = `${content}\n执行时间: ${new Date().toTimeString().split(' ')[0]}`;
  }
  title = title || '网络信息 𝕏';

  if (isRequest()) {
      // 网页模式输出
      result = {
          response: {
              status: 200,
              body: JSON.stringify({ title, content }, null, 2),
              headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          },
      };
      $.done(result);
  } else {
      // 面板模式输出
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
// 功能函数区
// ===========================================

async function getDirectRequestInfo({ PROXIES = [] } = {}) {
    // 优先检测本地 IP
    const { CN_IP, CN_INFO } = await getDirectInfo();
    // 获取最近请求的策略 (保留原逻辑用于显示策略名)
    const { POLICY } = await getRequestInfo(/api\.live\.bilibili\.com|api\.bilibili\.com|ipservice\.ws\.126\.net/, PROXIES);
    return { CN_IP, CN_INFO, CN_POLICY: POLICY };
}

async function getProxyRequestInfo({ PROXIES = [] } = {}) {
    // 1. 获取 Risk 信息 (IPPure) - 并行执行
    const riskPromise = getRiskInfo();
    
    // 2. 获取落地 IP 信息 (IP-API)
    const proxyInfoPromise = getProxyInfo(undefined, 'ipapi'); // 默认强制首选 ipapi
    
    const [riskData, proxyData] = await Promise.all([riskPromise, proxyInfoPromise]);
    
    let { PROXY_IP, PROXY_INFO } = proxyData;
    let PROXY_PRIVACY = riskData;

    // 获取策略名
    let { POLICY, IP: REQ_IP } = await getRequestInfo(/ip-api\.com|ippure\.com|ipinfo\.io/, PROXIES);
    
    // 如果 API 没返回 IP，尝试从请求记录获取
    if (!PROXY_IP && REQ_IP) PROXY_IP = REQ_IP;

    return {
        PROXY_IP,
        PROXY_INFO,
        PROXY_PRIVACY,
        PROXY_POLICY: POLICY,
        ENTRANCE_IP: '' 
    };
}

// -------------------------------------------
// 本地 IP 检测 (更新逻辑)
// -------------------------------------------
async function getDirectInfo() {
    let CN_IP, CN_INFO, isCN;
    
    // 1. 优先: Bilibili Live
    try {
        const res = await http({ 
            url: `https://api.live.bilibili.com/xlive/web-room/v1/index/getIpInfo`,
            headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com/" }
        });
        const body = JSON.parse(res.body);
        if (body.code === 0 && body.data) {
             const data = body.data;
             CN_IP = data.addr;
             CN_INFO = [
                 ['位置:', getflag('CN'), data.country, data.province, data.city].filter(i=>i).join(' '),
                 ['运营商:', data.isp].filter(i=>i).join(' ')
             ].join('\n');
             return { CN_IP, CN_INFO: simplifyAddr(CN_INFO), isCN: true };
        }
    } catch(e) {}

    // 2. 备选: Bilibili Zone
    try {
         const res = await http({ 
            url: `https://api.bilibili.com/x/web-interface/zone`,
            headers: { "User-Agent": "Mozilla/5.0" }
         });
         const body = JSON.parse(res.body);
         if (body.code === 0 && body.data) {
             const data = body.data;
             CN_IP = data.addr;
             CN_INFO = [
                 ['位置:', getflag('CN'), data.country, data.province, data.city].filter(i=>i).join(' '),
                 ['运营商:', data.isp].filter(i=>i).join(' ')
             ].join('\n');
             return { CN_IP, CN_INFO: simplifyAddr(CN_INFO), isCN: true };
         }
    } catch(e) {}

    // 3. 备选: 网易 (126)
    try {
        const res = await http({ url: `https://ipservice.ws.126.net/locate/api/getLocByIp` });
        const body = JSON.parse(res.body);
        const data = body.result;
        CN_IP = data.ip;
        CN_INFO = [
             ['位置:', getflag('CN'), data.country, data.province, data.city].filter(i=>i).join(' '),
             ['运营商:', data.company].filter(i=>i).join(' ')
        ].join('\n');
        return { CN_IP, CN_INFO: simplifyAddr(CN_INFO), isCN: true };
    } catch(e) {}

    // 4. 兜底: 使用原有参数定义的接口 (Logic from original script)
    return await getDirectInfoLegacy(undefined, $.lodash_get(arg, 'DOMESTIC_IPv4'));
}

// -------------------------------------------
// 落地 IP 检测 (更新逻辑: 首选 ip-api)
// -------------------------------------------
async function getProxyInfo(ip, provider) {
    let PROXY_IP, PROXY_INFO;

    // 1. 首选: IP-API
    try {
        const res = await http({ 
            url: `http://ip-api.com/json/${ip || ''}?lang=zh-CN`,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const body = JSON.parse(res.body);
        if (body.status === 'success') {
             PROXY_IP = body.query;
             PROXY_INFO = [
                ['位置:', getflag(body.countryCode), body.country, body.regionName, body.city].filter(i=>i).join(' '),
                ['运营商:', body.isp || body.org].filter(i=>i).join(' '),
                $.lodash_get(arg, 'ASN') == 1 ? ['ASN:', body.as].filter(i=>i).join(' ') : undefined
             ].filter(i=>i).join('\n');
             return { PROXY_IP, PROXY_INFO: simplifyAddr(PROXY_INFO) };
        }
    } catch(e) { $.log("IP-API failed, trying backup..."); }

    // 2. 备选: 走原有逻辑 (ipinfo, ipsb 等)
    // 如果 ip-api 失败，回退到原有逻辑，这里为了简化，直接调用 legacy
    return await getProxyInfoLegacy(ip, $.lodash_get(arg, 'LANDING_IPv4'));
}

// -------------------------------------------
// 纯净度 & 原生检测 (IPPure)
// -------------------------------------------
async function getRiskInfo() {
    try {
        const res = await http({
            url: `https://my.ippure.com/v1/info`,
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://ippure.com/",
                "Accept": "application/json"
            }
        });
        const body = JSON.parse(res.body);
        
        // 风险等级
        let riskLabel = "";
        const fraudScore = body.fraudScore;
        if (typeof fraudScore !== "undefined") {
            const risk = parseInt(fraudScore);
            if (risk >= 76) riskLabel = `🛑极高风险(${risk})`;
            else if (risk >= 51) riskLabel = `⚠️高风险(${risk})`;
            else if (risk >= 26) riskLabel = `🔶中风险(${risk})`;
            else riskLabel = `✅低风险(${risk})`;
        }

        // 原生/数据中心
        let nativeText = "";
        const isResidential = body.isResidential;
        const org = body.asOrganization || "";
        if (typeof isResidential === "boolean") {
            nativeText = isResidential ? "✅原生" : "🏢数据中心";
        } else if (/Cloudflare|Google|Amazon|Aliyun|Tencent/i.test(org)) {
            nativeText = "🏢数据中心(推测)";
        }

        return `纯净度: ${riskLabel}  ${nativeText}`;
    } catch(e) {
        return "";
    }
}


// ===========================================
// 原有/辅助函数保留 (Legacy)
// ===========================================

async function getRequestInfo(regexp, PROXIES = []) {
  let POLICY = '';
  let IP = '';
  try {
      const { requests } = await httpAPI('/v1/requests/recent', 'GET');
      const request = requests.slice(0, 20).find(i => regexp.test(i.URL));
      if (request) {
          POLICY = request.policyName;
          if (/\(Proxy\)/.test(request.remoteAddress)) {
            IP = request.remoteAddress.replace(/\s*\(Proxy\)\s*/, '');
          }
      }
  } catch (e) { $.logErr(e); }
  return { POLICY, IP };
}

async function httpAPI(path, method, body) {
  return new Promise((resolve) => {
    $httpAPI(method, path, body, (result) => resolve(result));
  });
}

// Legacy Direct Info (Only triggered if new methods fail)
async function getDirectInfoLegacy(ip, provider) {
   // 简化保留原脚本中最稳定的几种
   if (provider === 'ipip') {
       // ... ipip logic ... (略，为节省长度直接使用通用请求)
       try {
           const res = await http({url: 'https://myip.ipip.net/json'});
           const body = JSON.parse(res.body);
           const data = body.data;
           return { 
               CN_IP: data.ip, 
               CN_INFO: `位置: ${getflag('CN')} ${data.location.join(' ')}\n运营商: ${data.location[4] || ''}`,
               isCN: true 
           };
       } catch(e){}
   }
   // Fallback Generic
   try {
       const res = await http({url: 'https://api-v3.speedtest.cn/ip'});
       const body = JSON.parse(res.body);
       const data = body.data;
       return {
           CN_IP: data.ip,
           CN_INFO: `位置: ${getflag(data.countryCode)} ${data.province} ${data.city}\n运营商: ${data.isp}`,
           isCN: (data.countryCode === 'CN')
       };
   } catch(e){}
   return {};
}

// Legacy Proxy Info (Fallback)
async function getProxyInfoLegacy(ip, provider) {
    // 简化的 fallback，使用 ipinfo
    try {
        const res = await http({ url: `https://ipinfo.io/json` });
        const body = JSON.parse(res.body);
        return {
            PROXY_IP: body.ip,
            PROXY_INFO: `位置: ${getflag(body.country)} ${body.city} ${body.region}\n运营商: ${body.org}`
        };
    } catch(e) { return {}; }
}

async function getDirectInfoIPv6() {
  try {
    const res = await http({ url: `https://ipv6.ddnspod.com` });
    return { CN_IPv6: res.body.trim() };
  } catch (e) { return {}; }
}

async function getProxyInfoIPv6() {
  try {
    const res = await http({ url: `https://api-ipv6.ip.sb/ip` });
    return { PROXY_IPv6: res.body.trim() };
  } catch (e) { return {}; }
}

async function getProxies() {
    // Surge 专用，不需要复杂的 stash 判断
    return { PROXIES: [] }; 
}

// 工具函数
function simplifyAddr(addr) {
  if (!addr) return '';
  return addr.split(/\n/).map(i => Array.from(new Set(i.split(/\ +/))).join(' ')).join('\n');
}
function maskAddr(addr) {
  if (!addr || $.lodash_get(arg, 'MASK') != 1) return addr;
  const parts = addr.split(' ');
  if (parts.length >= 3) return [parts[0], '*', parts[parts.length - 1]].join(' ');
  const third = Math.floor(addr.length / 3);
  return addr.substring(0, third) + '*'.repeat(third) + addr.substring(2 * third);
}
function maskIP(ip) {
  if (!ip || $.lodash_get(arg, 'MASK') != 1) return ip;
  if (ip.includes('.')) {
    let parts = ip.split('.');
    return [...parts.slice(0, 2), '*', '*'].join('.');
  } else {
    let parts = ip.split(':');
    return [...parts.slice(0, 4), '*', '*', '*', '*'].join(':');
  }
}
function getflag(code) {
  if ($.lodash_get(arg, 'FLAG', 1) != 1 || !code) return '';
  if (code.toUpperCase() === 'TW') return '🇼🇸'; // 原脚本逻辑
  const t = code.toUpperCase().split('').map(e => 127397 + e.charCodeAt());
  return String.fromCodePoint(...t);
}
function isIPv6(ip) { return /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/.test(ip); }
function isRequest() { return typeof $request !== 'undefined'; }
function isPanel() { return typeof $input !== 'undefined' && $input.purpose === 'panel'; }
function isInteraction() { return false; } // 简化 Surge 判定
async function http(opt) {
  const TIMEOUT = parseFloat($.lodash_get(arg, 'TIMEOUT') || 5);
  return new Promise((resolve, reject) => {
      $httpClient.get({...opt, timeout: TIMEOUT}, (err, resp, body) => {
          if(err) reject(err);
          else resolve({status: resp.status, body});
      });
  });
}
