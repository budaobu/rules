import asyncio
from pyppeteer import launch
from bs4 import BeautifulSoup
import time

async def get_asn_data_he(url):
    browser = await launch(headless=True)
    page = await browser.newPage()
    await page.goto(url)
    await page.waitForSelector('#asns tbody tr')
    
    content = await page.content()
    await browser.close()
    
    soup = BeautifulSoup(content, 'html.parser')
    asn_data = {}
    
    table_rows = soup.select('#asns tbody tr')
    print(f"Found {len(table_rows)} rows in the table.")  # Debug output
    
    for row in table_rows:
        asn_number = row.select_one('td:nth-of-type(1) a').text.replace('AS', '')
        asn_name = row.select_one('td:nth-of-type(2)').text.strip()
        asn_data[asn_number] = asn_name
    
    return asn_data

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

def merge_asn_data(asn_data_he, asn_data_ipip):
    merged_data = asn_data_he.copy()
    
    for asn_number, asn_name in asn_data_ipip.items():
        # 如果 asn_data_he 中没有该 ASN 或者 asn_data_he 中的名称为空，则使用 asn_data_ipip 中的名称
        if asn_number not in merged_data or not merged_data[asn_number].strip():
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

async def main():
    # Get data from bgp.he.net
    url_he = "https://bgp.he.net/country/CN"
    asn_data_he = await get_asn_data_he(url_he)
    
    # Get data from whois.ipip.net
    url_ipip = "https://whois.ipip.net/iso/CN"
    asn_data_ipip = await get_asn_data_ipip(url_ipip)
    
    # Merge data
    merged_asn_data = merge_asn_data(asn_data_he, asn_data_ipip)
    
    # 安全检查：确保没有丢失任何 ASN
    assert len(merged_asn_data) >= len(asn_data_he), "Some ASNs from he.net were lost during merging"
    assert len(merged_asn_data) >= len(asn_data_ipip), "Some ASNs from ipip.net were lost during merging"
    
    # Write to file
    output_filename = "asn_cn.list"
    write_asn_file(output_filename, merged_asn_data)

if __name__ == "__main__":
    asyncio.run(main())
