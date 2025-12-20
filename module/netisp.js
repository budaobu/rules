/**
 * Surge 网络信息面板 (精简版)
 * @description 适配 Surge 5，移除多端兼容代码，增加风险检测与图标变色
 */

// ================================
// 1. 初始化与参数解析
// ================================
let arg = {};
if (typeof $argument !== 'undefined') {
  arg = Object.fromEntries($argument.split('&').map(item => item.split('=')));
}

// 合并持久化存储的参数 (如果有)
const stored = JSON.parse($persistentStore.read('network-info') || '{}');
arg = { ...arg, ...stored };

// 如果是 HTTP 请求触发，合并 URL 参数
if (typeof $request !== 'undefined') {
  const urlArgs = parseQueryString($request.url);
  arg = { ...arg, ...urlArgs };
}

// 核心配置
const PROXY_POLICY_NAME = arg.Proxy || 'Proxy';
// 注意：由于我们在模块 [Rule] 中已经指定了这些域名走 {{{Proxy}}}，
// 这里的 policy 参数其实是为了向后兼容，或者在非模块环境下生效。
// 在模块环境下，系统规则优先级高于请求参数 policy。
const HTTP_OPTS = { policy: PROXY_POLICY_NAME };

let title = `策略: ${PROXY_POLICY_NAME}`;
let content = '';
let icon = arg.icon || 'globe.asia.australia';
let iconColor = arg['icon-color'] || '#6699FF';

// ================================
// 2. 主逻辑执行
// ================================
(async () => {
  try {
    // 并行执行所有耗时任务
    const [netInfo, entrance, landing, v6] = await Promise.all([
      getNetworkBasicInfo(),
      getEntranceInfo(),
      getLandingInfo(),
      (arg.IPv6 == 1) ? getProxyInfoIPv6() : Promise.resolve(null)
    ]);

    // --- 构建内容 ---
    
    // 1. 本地网络 (SSID / LAN)
    let localStr = '';
    if (netInfo.ssid) localStr += `SSID: ${netInfo.ssid}\n`;
    if (netInfo.lanv4) localStr += `LAN: ${netInfo.lanv4}`;
    if (netInfo.lanv6) localStr += ` ${maskIP(netInfo.lanv6)}`;
    if (localStr) localStr += '\n';

    // 2. 入口信息
    let entranceStr = '';
    if (entrance) {
      const ip = maskIP(entrance.ip) || '-';
      const loc = maskAddr(entrance.location);
      entranceStr = `入口: ${ip}\n${loc}\n`;
    }

    // 3. 落地信息
    let landingStr = '';
    let riskStr = '';
    
    if (landing) {
      const ip = maskIP(landing.ip) || '-';
      const loc = maskAddr(landing.location);
      const isp = landing.isp ? `\n运营商: ${landing.isp}` : '';
      const asn = (arg.ASN == 1 && landing.asn) ? `\nASN: ${landing.asn}` : '';
      const v6Str = (v6 && v6.ip) ? `\n🅿 IPv6: ${maskIP(v6.ip)}` : '';
      
      landingStr = `\n落地: ${ip}${v6Str}\n${loc}${isp}${asn}`;
      
      // 处理风险信息和图标颜色
      if (landing.risk) {
        riskStr = landing.risk.text;
        // 如果有风险颜色，且不是默认颜色，则覆盖图标颜色
        if (landing.risk.color) {
          iconColor = landing.risk.color;
        }
      }
    } else {
      landingStr = `\n落地: 获取失败`;
    }

    // 4. 最终组合
    content = `${localStr}${entranceStr}${landingStr}${riskStr}`.trim();
    
    // 格式美化：去除多余换行
    content = content.replace(/\n{3,}/g, '\n\n');

  } catch (err) {
    title = '❌ 运行错误';
    content = err.message || JSON.stringify(err);
    console.log(`Error: ${content}`);
  } finally {
    done();
  }
})();

// ================================
// 3. 功能函数
// ================================

// 获取 SSID 和 LAN IP
async function getNetworkBasicInfo() {
  let ssid = '';
  let lanv4 = '';
  let lanv6 = '';

  if (typeof $network !== 'undefined') {
    if (arg.SSID == 1) ssid = $network.wifi?.ssid;
    if (arg.LAN == 1) {
      lanv4 = $network.v4?.primaryAddress;
      if (arg.IPv6 == 1) lanv6 = $network.v6?.primaryAddress;
    }
  }
  return { ssid, lanv4, lanv6 };
}

// 获取入口信息 (强制 Direct)
async function getEntranceInfo() {
  const commonOpts = { timeout: 3 }; // 3秒超时
  const ua = { 'User-Agent': 'Mozilla/5.0' };
  const biliH = { ...ua, 'Referer': 'https://www.bilibili.com/' };

  // 1. Bilibili Live
  try {
    const res = await httpGet('https://api.live.bilibili.com/xlive/web-room/v1/index/getIpInfo', { headers: biliH, ...commonOpts });
    const body = JSON.parse(res.body);
    if (body.code === 0 && body.data) {
      const { addr, country, province, city, isp } = body.data;
      return { ip: addr, location: [country, province, city, isp].filter(Boolean).join(' ') };
    }
  } catch (e) {}

  // 2. Bilibili Zone
  try {
    const res = await httpGet('https://api.bilibili.com/x/web-interface/zone', { headers: biliH, ...commonOpts });
    const body = JSON.parse(res.body);
    if (body.code === 0 && body.data) {
      const { addr, country, province, city, isp } = body.data;
      return { ip: addr, location: [country, province, city, isp].filter(Boolean).join(' ') };
    }
  } catch (e) {}

  // 3. NetEase
  try {
    const res = await httpGet('https://ipservice.ws.126.net/locate/api/getLocByIp', { headers: ua, ...commonOpts });
    const body = JSON.parse(res.body);
    if (body.result) {
      const { ip, country, province, city, company } = body.result;
      return { ip: ip, location: [country, province, city, company].filter(Boolean).join(' ') };
    }
  } catch (e) {}

  return { ip: '', location: '检测失败' };
}

// 获取落地信息 (走 Proxy)
async function getLandingInfo() {
  const ua = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://ippure.com/",
    "Accept": "application/json"
  };

  // 1. IPPure (含风险检测) - 优先
  try {
    // 增加 8 秒超时，因为检测风险比较慢
    const res = await httpGet('https://my.ippure.com/v1/info', { headers: ua, timeout: 8, ...HTTP_OPTS });
    
    let data;
    try { data = JSON.parse(res.body); } catch(e) { data = JSON.parse(res.body.trim()); }

    if (data && (data.ip || data.query)) {
      const ip = data.ip || data.query;
      let country = data.country || '';
      const city = data.city || '';
      if (country === city) country = '';
      
      const location = [getFlag(data.countryCode), country, city].filter(Boolean).join(' ');
      const isp = data.asOrganization || data.isp || '';
      const asn = data.asn ? `AS${data.asn}` : '';

      // 计算风险
      const score = parseInt(data.fraudScore || 0);
      let riskLabel = '';
      let color = ''; // 用于改变 Icon 颜色

      if (score >= 76) { 
        riskLabel = `🛑极高风险(${score})`; 
        color = '#FF3B30'; // Red
      } else if (score >= 51) { 
        riskLabel = `⚠️高风险(${score})`; 
        color = '#FF9500'; // Orange
      } else if (score >= 26) { 
        riskLabel = `🔶中风险(${score})`; 
        color = '#FFCC00'; // Yellow
      } else { 
        riskLabel = `✅低风险(${score})`; 
        color = '#34C759'; // Green (安全时用绿色，或者保持默认)
      }

      let typeStr = '';
      if (typeof data.isResidential === "boolean") {
        typeStr = data.isResidential ? "✅原生" : "🏢数据中心";
      } else {
        const dcRegex = /Akari|DMIT|Misaka|Kirino|Cloudflare|Google|Amazon|Oracle|Aliyun|Tencent|DigitalOcean|Vultr|Linode/i;
        typeStr = dcRegex.test(isp) ? "🏢数据中心(推)" : "❓类型未知";
      }

      return {
        ip, location, isp, asn,
        risk: { text: `\n\nIP纯净: ${riskLabel}  ${typeStr}`, color: color }
      };
    }
  } catch (e) {
    console.log(`IPPure failed: ${e.message}`);
  }

  // 2. Fallback: IP-API (无风险数据)
  try {
    const res = await httpGet('http://ip-api.com/json?lang=zh-CN', { timeout: 5, ...HTTP_OPTS });
    const data = JSON.parse(res.body);
    if (data.status === 'success') {
      const location = [getFlag(data.countryCode), data.country, data.city].filter(Boolean).join(' ');
      return {
        ip: data.query, location, isp: data.isp, asn: data.as,
        risk: { text: '\n\nIP纯净: ⚠️无数据 (Fallback)', color: '' }
      };
    }
  } catch (e) {}

  return null;
}

// 获取 IPv6 落地
async function getProxyInfoIPv6() {
  try {
    const res = await httpGet('https://api-ipv6.ip.sb/ip', { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5, ...HTTP_OPTS });
    return { ip: res.body.trim() };
  } catch (e) { return null; }
}

// ================================
// 4. 工具函数 (原生封装)
// ================================

function httpGet(url, opts = {}) {
  const { timeout = 5, headers = {}, policy } = opts;
  // 构建 Surge 请求对象
  const reqObj = { url, timeout, headers };
  if (policy) reqObj.policy = policy; // 兼容非模块环境，模块环境[Rule]优先

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
    // 请求模式返回 JSON
    $done({
      response: {
        status: 200,
        body: JSON.stringify({ title, content }, null, 2),
        headers: { 'Content-Type': 'application/json; charset=UTF-8' }
      }
    });
  } else {
    // 面板模式返回对象
    $done({
      title,
      content,
      icon,
      'icon-color': iconColor
    });
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
  // 国旗转换
  try {
    const t = code.toUpperCase().split('').map(c => 127397 + c.charCodeAt());
    return String.fromCodePoint(...t).replace(/🇹🇼/g, '🇼🇸');
  } catch (e) { return ''; }
}
