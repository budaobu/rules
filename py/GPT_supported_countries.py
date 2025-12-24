import requests
from bs4 import BeautifulSoup
import pycountry
import json
import os
import re
import sys

# 配置
# 强制使用英文版 URL 以确保 pycountry 能准确识别国家名称
# 文章 ID 7947663 是固定的，语言变体不影响内容的核心列表
URL = "https://help.openai.com/en/articles/7947663-chatgpt-supported-countries"
OUTPUT_DIR = "lists"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "GPT_supported_countries.json")

# 手动映射字典，用于处理 pycountry 无法直接模糊匹配的特殊名称
# 这种硬编码在网络爬虫中很常见，因为网页上的写法并不总是标准的 ISO 名称
MANUAL_MAPPING = {
    "Bolivia": "BO",
    "Brunei": "BN",
    "Cabo Verde": "CV",
    "Cote d'Ivoire": "CI",
    "Côte d'Ivoire": "CI",
    "Czech Republic": "CZ",
    "Eswatini": "SZ",  # Swaziland
    "Gambia": "GM",
    "The Gambia": "GM",
    "Holy See (Vatican City)": "VA",
    "Vatican City": "VA",
    "Iran": "IR",
    "Kyrgyzstan": "KG",
    "Laos": "LA",
    "Micronesia": "FM",
    "Moldova": "MD",
    "North Korea": "KP",
    "Palestine": "PS",
    "Russia": "RU",
    "South Korea": "KR",
    "Syria": "SY",
    "Taiwan": "TW",
    "Tanzania": "TZ",
    "Timor-Leste": "TL",
    "Türkiye": "TR",
    "Turkey": "TR",
    "United Kingdom": "GB",
    "United States": "US",
    "Venezuela": "VE",
    "Vietnam": "VN"
}

def clean_country_name(name):
    """
    清洗国家名称，移除括号内的备注内容和多余空格。
    例如: "Italy (regions)" -> "Italy"
    """
    # 移除括号及其内容
    name = re.sub(r'\s*\(.*?\)', '', name)
    # 移除多余空白字符
    return name.strip()

def get_iso_code(country_name):
    """
    尝试将国家名称转换为 ISO 3166-1 alpha-2 代码
    """
    clean_name = clean_country_name(country_name)
    
    # 1. 检查手动映射
    if clean_name in MANUAL_MAPPING:
        return MANUAL_MAPPING[clean_name]
    
    # 2. 尝试 pycountry 的精确或模糊搜索
    try:
        # 优先尝试名字
        match = pycountry.countries.search_fuzzy(clean_name)
        if match and len(match) > 0:
            return match[0].alpha_2
    except LookupError:
        pass

    # 3. 如果失败，尝试一些常见的替换再搜索
    try:
        if "Saint" in clean_name:
            alt_name = clean_name.replace("Saint", "St.")
            match = pycountry.countries.search_fuzzy(alt_name)
            if match:
                return match[0].alpha_2
    except LookupError:
        pass

    return None

def main():
    print(f"Fetching data from {URL}...")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    try:
        response = requests.get(URL, headers=headers)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Error fetching page: {e}")
        sys.exit(1)

    soup = BeautifulSoup(response.content, 'html.parser')

    # 查找逻辑更新：
    # 1. 避免使用极长的 selector，因为样式类名(如 px-5, h-fit)经常变动。
    # 2. 优先寻找语义化的 .article-content 或 .prose (Tailwind typography)，这些通常包裹正文。
    # 3. 如果找不到，回退到 <article> 标签。
    
    content_area = None
    
    # 尝试更精确的定位，对应你提到的 selector 中的关键部分
    selectors_to_try = [
        '.article-content', # Intercom (OpenAI使用的帮助中心) 常见的正文类名
        '.prose',           # Tailwind Typography 常用类名
        'article'           # 最通用的语义标签
    ]
    
    for selector in selectors_to_try:
        content_area = soup.select_one(selector)
        if content_area:
            print(f"Located content using selector: '{selector}'")
            break
            
    if not content_area:
        print("Error: Could not find article body in the HTML.")
        # 打印部分 HTML 以供调试
        print(soup.prettify()[:1000])
        sys.exit(1)

    # 提取所有列表项
    # 我们不限制在直接的 > ul > li，因为有时候格式可能是嵌套的，或者使用了 ol
    # 获取 content_area 内的所有 li 是最保险的
    list_items = content_area.find_all('li')
    
    countries_found = set()
    print(f"Found {len(list_items)} list items. Processing...")

    for li in list_items:
        text = li.get_text().strip()
        
        # 简单的过滤：国家名通常不包含太长的句子
        if len(text) > 50 or "http" in text:
            continue
            
        # 忽略空行
        if not text:
            continue

        iso_code = get_iso_code(text)
        
        if iso_code:
            countries_found.add(iso_code)
        else:
            # 记录未匹配项，仅在看起来像是有意义的文本时警告
            # 避免对单纯的标点符号或极短字符报错
            if len(text) > 2:
                print(f"Warning: Could not map '{text}' to an ISO code.")

    if not countries_found:
        print("Error: No valid countries extracted. structure might have changed.")
        sys.exit(1)

    # 排序并转换为列表
    sorted_codes = sorted(list(countries_found))
    
    # 确保输出目录存在
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    # 写入 JSON
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(sorted_codes, f, indent=2)

    print(f"Successfully wrote {len(sorted_codes)} country codes to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
