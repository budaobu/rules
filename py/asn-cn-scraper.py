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
    asn_data = {}
    table_rows = soup.select('table.tablesorter tbody tr')
    print(f"Found {len(table_rows)} rows in the table.")  # Debug output
    
    for row in table_rows:
        asn_number = row.select_one('td:nth-of-type(1)').text.replace('AS', '')
        asn_name = row.select_one('td:nth-of-type(2)').text.strip()
        asn_data[asn_number] = asn_name
    
    return asn_data

def get_asn_data_he(url, headers):
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
    except requests.exceptions.RequestException:
        return {}
    
    soup = BeautifulSoup(response.text, 'html.parser')
    asn_data = {}
    
    table_rows = soup.select('#asns tbody tr')
    for row in table_rows:
        asn_number = row.select_one('td:nth-of-type(1) a').text.replace('AS', '')
        asn_name = row.select_one('td:nth-of-type(2)').text.strip()
        asn_data[asn_number] = asn_name
    
    return asn_data

def merge_asn_data(asn_data_he, asn_data_ipip):
    merged_data = asn_data_he.copy()
    
    for asn_number, asn_name in asn_data_ipip.items():
        # 如果 asn_data_he 中没有该 ASN，直接加入
        if asn_number not in merged_data:
            merged_data[asn_number] = asn_name
        # 如果 asn_data_he 中有该 ASN，但名称为空，则使用 asn_data_ipip 中的名称
        elif not merged_data[asn_number].strip():
            merged_data[asn_number] = asn_name
        # 如果 asn_data_he 中的名称不为空且 asn_data_ipip 中的名称更详细，则更新名称
        elif asn_name and len(asn_name) > len(merged_data[asn_number]):
            merged_data[asn_number] = asn_name
    
    return merged_data

def write_asn_file(filename, asn_data):
    local_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    total_asn = len(asn_data)
    with open(filename, 'w', encoding='utf-8') as asn_file:
        asn_file.write("// ASN CN from: https://bgp.he.net/country/CN and https://whois.ipip.net/iso/CN\n")
        asn_file.write(f"// Last Updated: UTC {local_time}\n")
        asn_file.write(f"// Total ASN: {total_asn}\n")
        asn_file.write("// Made by budaobu.\n\n")
        
        for asn_number, asn_name in asn_data.items():
            if asn_name:
                asn_file.write(f"IP-ASN,{asn_number} // {asn_name}\n")
            else:
                asn_file.write(f"IP-ASN,{asn_number}\n")

def main():
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15"
    }
    
    # Get data from bgp.he.net
    url_he = "https://bgp.he.net/country/CN"
    asn_data_he = get_asn_data_he(url_he, headers)
    
    # Get data from whois.ipip.net
    url_ipip = "https://whois.ipip.net/iso/CN"
    asn_data_ipip = asyncio.run(get_asn_data_ipip(url_ipip))
    
    # Merge data
    merged_asn_data = merge_asn_data(asn_data_he, asn_data_ipip)
    
    # 安全检查：确保没有丢失任何 ASN
    assert len(merged_asn_data) >= len(asn_data_he), "Some ASNs from he.net were lost during merging"
    assert len(merged_asn_data) >= len(asn_data_ipip), "Some ASNs from ipip.net were lost during merging"
    
    # Write to file
    output_filename = "asn_cn.list"
    write_asn_file(output_filename, merged_asn_data)

if __name__ == "__main__":
    main()
