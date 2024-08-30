import asyncio
from pyppeteer import launch
from bs4 import BeautifulSoup
import requests
import time

async def get_asn_data_ipip(url):
    browser = await launch(headless=True)
    page = await browser.newPage()
    await page.goto(url)
    await page.waitForSelector('table.tablesorter tbody tr')

    content = await page.content()
    await browser.close()

    soup = BeautifulSoup(content, 'html.parser')
    asn_data_ipip = []
    table_rows = soup.select('table.tablesorter tbody tr')
    print(f"Found {len(table_rows)} rows in the table.")  # Debug output

    for row in table_rows:
        asn_number = row.select_one('td:nth-of-type(1)').text.replace('AS', '')
        asn_name = row.select_one('td:nth-of-type(2)').text.strip()
        asn_data_ipip.append({'asn': asn_number, 'name': asn_name})

    return asn_data_ipip

def get_asn_data_he(url, headers):
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
    except requests.exceptions.RequestException:
        return []

    soup = BeautifulSoup(response.text, 'html.parser')
    asn_data_he = []

    table_rows = soup.select('#asns tbody tr')
    for row in table_rows:
        asn_number = row.select_one('td:nth-of-type(1) a').text.replace('AS', '')
        asn_name = row.select_one('td:nth-of-type(2)').text.strip()
        asn_data_he.append({'asn': asn_number, 'name': asn_name})

    return asn_data_he

def merge_asn_data(asn_data_he, asn_data_ipip):
    # 创建临时字典，包含 asn 和 name
    temp_dict = {}

    # 从 asn_data_ipip 中取出所有 asn 值
    for asn_data in asn_data_ipip:
        asn_number = asn_data['asn']
        temp_dict[asn_number] = {'asn': asn_number, 'name': ''}  # 初始 name 为空

    # 从 asn_data_he 中逐行取出 asn 值
    for asn_data in asn_data_he:
        asn_number = asn_data['asn']
        
        # 如果 ASN 不在临时字典中，直接添加
        if asn_number not in temp_dict:
            temp_dict[asn_number] = {'asn': asn_number, 'name': ''}  # 初始 name 为空

    # 逐行使用临时字典中的 asn 值，在 asn_data_ipip 中查找对应的 name
    for asn_data in asn_data_ipip:
        asn_number = asn_data['asn']
        if asn_number in temp_dict:
            temp_dict[asn_number]['name'] = asn_data['name']  # 更新 name

    # 继续查找 asn_data_he 中的 name
    for asn_data in asn_data_he:
        asn_number = asn_data['asn']
        if asn_number in temp_dict and not temp_dict[asn_number]['name']:
            temp_dict[asn_number]['name'] = asn_data['name']  # 更新 name 如果之前为空

    # 将临时字典的值转换为列表
    merged_data = list(temp_dict.values())
    return merged_data


def write_asn_file(filename, asn_data):
    print(f"Writing {len(asn_data)} ASNs to file...")  # Debug output
    local_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    total_asn = len(asn_data)
    with open(filename, 'w', encoding='utf-8') as asn_file:
        asn_file.write("// ASN CN from: https://bgp.he.net/country/CN and https://whois.ipip.net/iso/CN\n")
        asn_file.write(f"// Last Updated: UTC {local_time}\n")
        asn_file.write(f"// Total ASN: {total_asn}\n")
        asn_file.write("// Made by budaobu.\n\n")

        for asn_info in asn_data:
            asn_number = asn_info['asn']
            asn_name = asn_info['name']
            output_line = f"IP-ASN,{asn_number}"
            if asn_name:
                output_line += f" // {asn_name}"
            asn_file.write(output_line + "\n")

def main():
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15"
    }

    # Get data from bgp.he.net
    url_he = "https://bgp.he.net/country/CN"
    asn_data_he = get_asn_data_he(url_he, headers)
    print(f"Total ASNs from he.net: {len(asn_data_he)}")  # Debug output

    # Get data from whois.ipip.net
    url_ipip = "https://whois.ipip.net/iso/CN"
    asn_data_ipip = asyncio.run(get_asn_data_ipip(url_ipip))
    print(f"Total ASNs from ipip.net: {len(asn_data_ipip)}")  # Debug output

    # Merge data
    merged_asn_data = merge_asn_data(asn_data_he, asn_data_ipip)
    print(f"Total merged ASNs: {len(merged_asn_data)}")  # Debug output

    # 安全检查：确保没有丢失任何 ASN
    assert len(merged_asn_data) >= len(asn_data_he), "Some ASNs from he.net were lost during merging"
    assert len(merged_asn_data) >= len(asn_data_ipip), "Some ASNs from ipip.net were lost during merging"

    # Write to file
    output_filename = "asn_cn.list"
    write_asn_file(output_filename, merged_asn_data)

if __name__ == "__main__":
    main()
