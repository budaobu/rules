/**
 * Surge 网络信息面板 (逻辑修正版)
 * @description 并行请求 IP-API(基础信息) 和 IPPure(风险信息)，结果合并显示。
 */

// ================================
// 1. 初始化
// ================================
let arg = {};
if (typeof $argument !== 'undefined') {
  arg = Object.fromEntries($argument.split('&').map(item => item.split('=')));
}
const stored = JSON.parse($persistentStore.read('network-info') || '{}');
arg = { ...arg, ...stored };
if (typeof $request !== 'undefined') {
  arg = { ...arg, ...parseQueryString($request.url) };
}

// 策略组 & 配置
const PROXY_POLICY_NAME = arg.Proxy || 'Proxy';
const HTTP_OPTS_PROXY = { policy: PROXY_POLICY_NAME }; 
const HTTP_OPTS_DIRECT = { policy: 'DIRECT' };

let title = `策略: ${PROXY_POLICY_NAME}`;
let content = '';
let icon = arg.icon || 'globe.asia.australia';
let iconColor = arg['icon-color'] || '#6699FF';

// ================================
// 2. 主逻辑
// ================================
(async () => {
  try {
    // 定义并行任务
    const tasks = [
      getNetworkBasicInfo(), // 0. LAN & SSID
      getEntranceIPv4(),     // 1. 入口 IPv4
      getLandingCombined(),  // 2. 落地 (IP-API + IPPure 并行)
    ];

    // IPv6 任务
    if (arg.IPv6 == 1) {
      tasks.push(getLandingIPv6());
    } else {
      tasks.push(Promise.resolve(null));
    }

    const [localInfo, entranceInfo, landingV4, landingV6] = await Promise.all(tasks);

    // --- 1. 本地网络 ---
    let localStr = '';
    if (localInfo.ssid) localStr += `SSID: ${localInfo.ssid}\n`;
    if (localInfo.lanv4) localStr += `LAN: ${localInfo.lanv4}`;
    if (localInfo.lanv6) localStr += ` ${maskIP(localInfo.lanv6)}`;
    if (localStr) localStr += '\n';

    // --- 2. 入口信息 ---
    let entranceStr = '';
    if (entranceInfo) {
      const ip = maskIP(entranceInfo.ip);
      const loc = maskAddr(entranceInfo.location);
      entranceStr = `入口: ${ip}\n${loc}\n`;
    } else {
      entranceStr = `入口: 获取失败\n`;
    }

    // --- 3. 落地信息 (基础 + 风险) ---
    let landingStr = '';
    let riskStr = '';

    if (landingV4) {
      const ip = maskIP(landingV4.ip);
      const loc = maskAddr(landingV4.location);
      const isp = landingV4.isp ? `\n运营商: ${landingV4.isp}` : '';
      const asn = (arg.ASN == 1 && landingV4.asn) ? `\nASN: ${landingV4.asn}` : '';
      
      landingStr = `\n落地: ${ip}`;
      // IPv6 紧跟在 IPv4 后面 (如果开启且存在)
      if (arg.IPv6 == 1 && landingV6 && landingV6.ip) {
          landingStr += `  🅿 ${maskIP(landingV6.ip)}`;
      }
      
      landingStr += `\n${loc}${isp}${asn}`;

      // 提取风险信息
      if (landingV4.risk) {
        riskStr = landingV4.risk.text;
        if (landingV4.risk.color) iconColor = landingV4.risk.color;
      } else {
        riskStr = '\n\nIP纯净: ⚠️获取失败';
      }
    } else {
      // IPv4 完全失败，只看 v6
      if (arg.IPv6 == 1 && landingV6 && landingV6.ip) {
          landingStr = `\n落地: 🅿 ${maskIP(landingV6.ip)}`;
      } else {
          landingStr = `\n落地: 获取失败`;
      }
    }

    // --- 4. 组合输出 ---
    content = `${localStr}${entranceStr}${landingStr}${riskStr}`.trim();
    content = content.replace(/\n{3,}/g, '\n\n');

  } catch (err) {
    content = `运行错误: ${err.message}`;
    console.log(err);
  } finally {
    done();
  }
})();

// ================================
// 3. 核心获取逻辑
// ================================

// > 组合落地信息 (IP-API + IPPure)
async function getLandingCombined() {
    // 定义两个请求 Promise
    const p1 = httpGet('http://ip-api.com/json?lang=zh-CN', { timeout: 5, ...HTTP_OPTS_PROXY });
    
    const uaPure = { "User-Agent": "Mozilla/5.0", "Referer": "https://ippure.com/", "Accept": "application/json" };
    const p2 = httpGet('https://my.ippure.com/v1/info', { headers: uaPure, timeout: 8, ...HTTP_OPTS_PROXY });

    // 并行等待结果 (AllSettled 不会因为一个失败而炸掉)
    const [resApi, resPure] = await Promise.allSettled([p1, p2]);

    let basicInfo = null; // 存放 IP, Location, ISP
    let riskInfo = null;  // 存放 Risk data

    // 处理 IP-API 结果 (首选基础信息)
    if (resApi.status === 'fulfilled') {
        try {
            const data = JSON.parse(resApi.value.body);
            if (data.status === 'success') {
                basicInfo = {
                    ip: data.query,
                    location: [getFlag(data.countryCode), data.country, data.city].filter(Boolean).join(' '),
                    isp: data.isp,
                    asn: data.as
                };
            }
        } catch(e) {}
    }

    // 处理 IPPure 结果 (风险信息来源 + 备用基础信息)
    if (resPure.status === 'fulfilled') {
        try {
            let data;
            try { data = JSON.parse(resPure.value.body); } catch(e) { data = JSON.parse(resPure.value.body.trim()); }
            
            if (data && (data.ip || data.query)) {
                // 1. 提取风险数据 (这是必须的)
                riskInfo = parseIPPureRisk(data);

                // 2. 如果 ip-api 失败了，用 ippure 的数据填补基础信息
                if (!basicInfo) {
                    const ip = data.ip || data.query;
                    let country = data.country || '';
                    const city = data.city || '';
                    if (country === city) country = ''; // 去重
                    
                    basicInfo = {
                        ip: ip,
                        location: [getFlag(data.countryCode), country, city].filter(Boolean).join(' '),
                        isp: data.asOrganization || data.isp,
                        asn: data.asn ? `AS${data.asn}` : ''
                    };
                }
            }
        } catch(e) {}
    }

    // 整合返回
    if (basicInfo) {
        basicInfo.risk = riskInfo; // 附加风险信息
        return basicInfo;
    }
    
    return null; // 两个都挂了
}

// > 入口 IP (本地公网) - 顺序降级
async function getEntranceIPv4() {
  const providers = [
    async () => { // Bilibili
      const res = await httpGet('https://api.live.bilibili.com/xlive/web-room/v1/index/getIpInfo', { headers: { 'Referer': 'https://www.bilibili.com/' }, ...HTTP_OPTS_DIRECT });
      const body = JSON.parse(res.body);
      if (body.code === 0 && body.data) return { ip: body.data.addr, location: [body.data.country, body.data.province, body.data.city, body.data.isp].filter(Boolean).join(' ') };
    },
    async () => { // NetEase
      const res = await httpGet('https://ipservice.ws.126.net/locate/api/getLocByIp', { ...HTTP_OPTS_DIRECT });
      const body = JSON.parse(res.body);
      if (body.result) return { ip: body.result.ip, location: [body.result.country, body.result.province, body.result.city, body.result.company].filter(Boolean).join(' ') };
    },
    async () => { // Amap
       const res = await httpGet('https://LBS.amap.com/IPLocator/IPV4', { ...HTTP_OPTS_DIRECT });
       const body = JSON.parse(res.body);
       if (body && body.data) return { ip: body.data.ip, location: [body.data.country, body.data.province, body.data.city, body.data.provider].filter(Boolean).join(' ') };
    }
  ];
  // 简单的顺序执行
  for (const p of providers) {
      try { const r = await p(); if (r) return r; } catch(e) {}
  }
  return null;
}

// > 落地 IPv6
async function getLandingIPv6() {
  const providers = [
    async () => {
      const res = await httpGet('https://api-ipv6.ip.sb/ip', { headers: { 'User-Agent': 'Mozilla/5.0' }, ...HTTP_OPTS_PROXY });
      const ip = res.body.trim();
      if (ip.includes(':')) return { ip };
    },
    async () => {
      const res = await httpGet('https://api64.ipify.org/?format=json', { ...HTTP_OPTS_PROXY });
      const body = JSON.parse(res.body);
      if (body.ip && body.ip.includes(':')) return { ip: body.ip };
    }
  ];
  for (const p of providers) {
      try { const r = await p(); if (r) return r; } catch(e) {}
  }
  return null;
}

// > 解析 IPPure 风险数据
function parseIPPureRisk(data) {
    if (!data) return null;
    const score = parseInt(data.fraudScore || 0);
    let riskLabel = '';
    let color = '';

    if (score >= 76) { 
        riskLabel = `🛑极高风险(${score})`; color = '#FF3B30'; 
    } else if (score >= 51) { 
        riskLabel = `⚠️高风险(${score})`; color = '#FF9500'; 
    } else if (score >= 26) { 
        riskLabel = `🔶中风险(${score})`; color = '#FFCC00'; 
    } else { 
        riskLabel = `✅低风险(${score})`; color = '#34C759'; 
    }

    let typeStr = '';
    const ispUpper = (data.asOrganization || data.isp || '').toUpperCase();
    if (typeof data.isResidential === "boolean") {
        typeStr = data.isResidential ? "✅原生" : "🏢数据中心";
    } else {
        const dcRegex = /AKARI|DMIT|MISAKA|KIRINO|CLOUDFLARE|GOOGLE|AMAZON|ORACLE|ALIYUN|TENCENT|DIGITALOCEAN|VULTR|LINODE/i;
        typeStr = dcRegex.test(ispUpper) ? "🏢数据中心(推)" : "❓类型未知";
    }
    
    return { text: `\n\nIP纯净: ${riskLabel}  ${typeStr}`, color: color };
}

async function getNetworkBasicInfo() {
  let ssid = ''; let lanv4 = ''; let lanv6 = '';
  if (typeof $network !== 'undefined') {
    if (arg.SSID == 1) ssid = $network.wifi?.ssid;
    if (arg.LAN == 1) {
      lanv4 = $network.v4?.primaryAddress;
      if (arg.IPv6 == 1) lanv6 = $network.v6?.primaryAddress;
    }
  }
  return { ssid, lanv4, lanv6 };
}

// ================================
// 4. 底层工具
// ================================

function httpGet(url, opts = {}) {
  const { timeout = 5, headers = {}, policy } = opts;
  const reqObj = { url, timeout, headers };
  if (policy) reqObj.policy = policy;
  return new Promise((resolve, reject) => {
    $httpClient.get(reqObj, (error, response, body) => {
      if (error) return reject(error);
      resolve({ response, body });
    });
  });
}

function parseQueryString(url) {
  if (!url || !url.includes('?')) return {};
  const queryString = url.split('?')[1];
  return Object.fromEntries(queryString.split('&').map(pair => {
    const [k, v] = pair.split('=');
    return [decodeURIComponent(k), decodeURIComponent(v || '')];
  }));
}

function done() {
  if (typeof $request !== 'undefined') {
    $done({
      response: {
        status: 200, body: JSON.stringify({ title, content }, null, 2),
        headers: { 'Content-Type': 'application/json; charset=UTF-8' }
      }
    });
  } else {
    $done({ title, content, icon, 'icon-color': iconColor });
  }
}

function maskIP(ip) {
  if (!ip) return '';
  if (arg.MASK == 1) {
    if (ip.includes('.')) {
      let parts = ip.split('.');
      return [...parts.slice(0, 2), '*', '*'].join('.');
    } else {
      let parts = ip.split(':');
      return [...parts.slice(0, 4), '*', '*', '*', '*'].join(':');
    }
  }
  return ip;
}

function maskAddr(str) {
  if (!str) return '';
  if (arg.MASK == 1 && str.length > 5) {
    return str.substring(0, 3) + '***' + str.substring(str.length - 2);
  }
  return str;
}

function getFlag(code) {
  if (arg.FLAG == 0 || !code) return '';
  try {
    const t = code.toUpperCase().split('').map(c => 127397 + c.charCodeAt());
    return String.fromCodePoint(...t).replace(/🇹🇼/g, '🇼🇸');
  } catch (e) { return ''; }
}
