import requests
from bs4 import BeautifulSoup
import time
import ipaddress
import os  # 导入 os 库以确保文件夹存在

def get_asn_data(url, headers):
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, 'html.parser')
    asn_data = []
    
    table_rows = soup.select('table tbody tr')
    for row in table_rows:
        asn_type = row.select_one('td:nth-of-type(2)').text.strip()
        if asn_type == "ASN":
            asn_number = row.select_one('td:nth-of-type(1)').text.replace('AS', '').strip()
            asn_name = row.select_one('td:nth-of-type(3)').text.strip()
            asn_data.append((asn_number, asn_name))
    
    return asn_data

def get_cidr_data(cidr_url):
    response = requests.get(cidr_url)
    response.raise_for_status()
    cidr_list = [line.strip() for line in response.text.splitlines() if line.strip()]  # 去掉空行和空格
    return cidr_list

def write_output_file(filename, cidr_data, asn_data):
    local_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    
    # 统计有效记录的行数
    domains = [
        "PROCESS-NAME,org.telegram.messenger",
        "DOMAIN-SUFFIX,t.me",
        "DOMAIN-SUFFIX,tx.me",
        "DOMAIN-SUFFIX,tg.dev",
        "DOMAIN-SUFFIX,tdesktop.com",
        "DOMAIN-SUFFIX,telegra.ph",
        "DOMAIN-SUFFIX,telega.one",
        "DOMAIN-SUFFIX,telegram.me",
        "DOMAIN-SUFFIX,telegram.org",
        "DOMAIN-SUFFIX,telegram.dog",
        "DOMAIN-SUFFIX,telegram.space",
        "DOMAIN-SUFFIX,graph.org",
        "DOMAIN-SUFFIX,legra.ph",
        "DOMAIN-SUFFIX,telesco.pe",
        "DOMAIN-SUFFIX,cdn-telegram.org",
        "DOMAIN-SUFFIX,comments.app // Bot"
    ]
    
    total_records = len(domains) + len(cidr_data) + len(asn_data)  # 动态计算行数
    
    with open(filename, 'w') as output_file:
        output_file.write("// Name: Telegram list\n")
        output_file.write("// Type: rule-set\n")
        output_file.write(f"// Last Updated: {local_time}\n")
        output_file.write(f"// Total: {total_records}\n")
        output_file.write("// Author: budaobu\n")
        output_file.write("// IP-ASN from: https://bgp.he.net/\n")
        output_file.write("// IP-CIDR from: https://core.telegram.org/resources/cidr.txt\n")
        
        # 写入域名信息
        for domain in domains:
            output_file.write(domain + '\n')
        
        # 写入CIDR信息
        for cidr in cidr_data:
            try:
                if ipaddress.ip_network(cidr):
                    version = "IP-CIDR" if ipaddress.ip_address(cidr.split('/')[0]).version == 4 else "IP-CIDR6"
                    output_file.write(f"{version},{cidr},no-resolve\n")
            except ValueError:
                continue
        
        # 写入ASN信息
        for asn_number, asn_name in asn_data:
            output_file.write(f"IP-ASN,{asn_number},no-resolve\n")

def main():
    asn_url = "https://bgp.he.net/search?search%5Bsearch%5D=telegram&commit=Search"
    cidr_url = "https://core.telegram.org/resources/cidr.txt"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15"
    }
    
    asn_data = get_asn_data(asn_url, headers)
    cidr_data = get_cidr_data(cidr_url)

    # 确保文件夹存在
    os.makedirs("lists", exist_ok=True)
    
    write_output_file("lists/telegram.list", cidr_data, asn_data)

if __name__ == "__main__":
    main()
