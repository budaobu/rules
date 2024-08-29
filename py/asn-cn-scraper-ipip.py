import asyncio
from pyppeteer import launch
from bs4 import BeautifulSoup
import time

async def get_asn_data(url):
    browser = await launch(headless=True)
    page = await browser.newPage()
    await page.goto(url)
    await page.waitForSelector('table.tablesorter tbody tr')
    
    content = await page.content()
    await browser.close()
    
    soup = BeautifulSoup(content, 'html.parser')
    asn_data = []
    table_rows = soup.select('table.tablesorter tbody tr')
    print(f"Found {len(table_rows)} rows in the table.")  # Debug output
    
    for row in table_rows:
        asn_number = row.select_one('td:nth-of-type(1) a').text.replace('AS', '')
        asn_name = row.select_one('td:nth-of-type(2)').text.strip()
        asn_data.append((asn_number, asn_name))
    
    return asn_data

def write_asn_file(filename, asn_data):
    local_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    total_asn = len(asn_data)
    
    try:
        with open(filename, 'w') as asn_file:
            asn_file.write("// ASN CN from: https://whois.ipip.net/iso/CN\n")
            asn_file.write(f"// Last Updated: UTC {local_time}\n")
            asn_file.write(f"// Total ASN: {total_asn}\n")
            asn_file.write("// Made by budaobu.\n\n")
            
            for asn_number, asn_name in asn_data:
                asn_file.write(f"IP-ASN,{asn_number} // {asn_name}\n")
    except IOError as e:
        print(f"Error writing to file {filename}: {e}")

def main():
    url = "https://whois.ipip.net/iso/CN"
    
    print(f"Fetching data from {url}...")
    asn_data = asyncio.run(get_asn_data(url))
    
    print(f"Extracted {len(asn_data)} ASN entries.")
    if asn_data:
        # 保存所有ASN
        write_asn_file("asn_cn_ipip.list", asn_data)
    else:
        print("No ASN data to write.")

if __name__ == "__main__":
    main()
