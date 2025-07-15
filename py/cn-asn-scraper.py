import asyncio
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup
import requests
import time
import os

async def get_asn_data_ipip(url, headers):
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = await browser.new_page()
        
        await page.set_extra_http_headers({"User-Agent": headers['User-Agent']})
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                await page.goto(url, wait_until='networkidle')
                await page.wait_for_selector('table.tablesorter tbody tr', timeout=60000)
                break
            except Exception as e:
                if attempt == max_retries - 1:
                    raise e
                print(f"Attempt {attempt + 1} failed. Retrying...")
                await asyncio.sleep(5)

        content = await page.content()
        await browser.close()

    soup = BeautifulSoup(content, 'html.parser')
    asn_data_ipip = []
    table_rows = soup.select('table.tablesorter tbody tr')
    print(f"Found {len(table_rows)} rows in the table.")

    for row in table_rows:
        asn_number = row.select_one('td:nth-of-type(1)').text.replace('AS', '').strip()
        asn_data_ipip.append(asn_number)

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
        asn_number = row.select_one('td:nth-of-type(1) a').text.replace('AS', '').strip()
        asn_data_he.append(asn_number)

    return asn_data_he

def merge_asn_data(asn_data_he, asn_data_ipip):
    merged_set = set()
    
    # 合并两个数据源的ASN
    merged_set.update(asn_data_he)
    merged_set.update(asn_data_ipip)
    
    return sorted(list(merged_set))

def write_asn_file(filename, asn_data):
    os.makedirs(os.path.dirname(filename), exist_ok=True)

    print(f"Writing {len(asn_data)} ASNs to file...")
    local_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    total_asn = len(asn_data)
    
    with open(filename, 'w', encoding='utf-8') as asn_file:
        asn_file.write("// Name: China ASN\n")
        asn_file.write("// Type: rule-set\n")
        asn_file.write(f"// Last Updated: UTC {local_time}\n")
        asn_file.write(f"// Total ASN: {total_asn}\n")
        asn_file.write("// Author: budaobu\n")
        asn_file.write("// ASN CN from: https://bgp.he.net/country/CN and https://whois.ipip.net/iso/CN\n")

        for asn_number in asn_data:
            asn_file.write(f"IP-ASN,{asn_number}\n")

def main():
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15"
    }

    # Get data from bgp.he.net
    url_he = "https://bgp.he.net/country/CN"
    asn_data_he = get_asn_data_he(url_he, headers)
    print(f"Total ASNs from he.net: {len(asn_data_he)}")

    # Get data from whois.ipip.net
    url_ipip = "https://whois.ipip.net/iso/CN"
    asn_data_ipip = asyncio.run(get_asn_data_ipip(url_ipip, headers))
    print(f"Total ASNs from ipip.net: {len(asn_data_ipip)}")

    # Merge data
    merged_asn_data = merge_asn_data(asn_data_he, asn_data_ipip)
    print(f"Total merged ASNs: {len(merged_asn_data)}")

    # Write to file
    output_filename = "lists/cn_asn.list"
    write_asn_file(output_filename, merged_asn_data)

if __name__ == "__main__":
    main()
