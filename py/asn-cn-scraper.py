import requests
from bs4 import BeautifulSoup
import time

def get_asn_data(url, headers):
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, 'html.parser')
    asn_data = []
    
    table_rows = soup.select('#asns tbody tr')
    for row in table_rows:
        asn_number = row.select_one('td:nth-of-type(1) a').text.replace('AS', '')
        asn_name = row.select_one('td:nth-of-type(2)').text.strip()
        asn_data.append((asn_number, asn_name))
    
    return asn_data

def write_asn_file(filename, asn_data, include_empty_names=True):
    local_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    total_asn = len(asn_data)
    with open(filename, 'w') as asn_file:
        asn_file.write("// ASN CN from: https://bgp.he.net/country/CN\n")
        asn_file.write(f"// Last Updated: UTC {local_time}\n")
        asn_file.write(f"// Total ASN: {total_asn}\n")
        asn_file.write("// Made by budaobu.\n\n")
        
        for asn_number, asn_name in asn_data:
            if include_empty_names or asn_name:
                asn_file.write(f"IP-ASN,{asn_number} // {asn_name}\n")

def main():
    url = "https://bgp.he.net/country/CN"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15"
    }
    
    asn_data = get_asn_data(url, headers)
    
    # 保存所有ASN，包括名称为空的
    write_asn_file("cn_asn.list", asn_data, include_empty_names=True)
    
    # 保存ASN名称不为空的数据
    filtered_asn_data = [asn for asn in asn_data if asn[1]]
    write_asn_file("cn_asn_named.list", filtered_asn_data, include_empty_names=False)

if __name__ == "__main__":
    main()
