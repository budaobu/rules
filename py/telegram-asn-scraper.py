import requests
from bs4 import BeautifulSoup
import time
import ipaddress
import os

def get_asn_and_route_data(url, headers):
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, 'html.parser')
    
    asn_data = []
    route_data = []
    
    table_rows = soup.select('table tbody tr')
    for row in table_rows:
        try:
            asn_type = row.select_one('td:nth-of-type(2)').text.strip()
            first_column = row.select_one('td:nth-of-type(1)').text.strip()
            
            if asn_type == "ASN":
                asn_number = first_column.replace('AS', '')
                asn_name = row.select_one('td:nth-of-type(3)').text.strip()
                asn_data.append((asn_number, asn_name))
            elif asn_type == "Route":
                try:
                    ipaddress.ip_network(first_column)
                    route_data.append(first_column)
                except ValueError:
                    continue
        except (AttributeError, IndexError):
            continue
    
    return asn_data, route_data

def get_official_cidr_data(cidr_url):
    response = requests.get(cidr_url)
    response.raise_for_status()
    cidr_list = []
    
    for line in response.text.splitlines():
        line = line.strip()
        if line and not line.startswith('#'):
            try:
                ipaddress.ip_network(line)
                cidr_list.append(line)
            except ValueError:
                continue
    
    return cidr_list

def merge_and_deduplicate_cidrs(official_cidrs, route_cidrs):
    """按IP版本分别处理并去重CIDR数据"""
    all_cidrs = set(official_cidrs + route_cidrs)
    
    # 按IP版本分离
    ipv4_networks = []
    ipv6_networks = []
    
    for cidr in all_cidrs:
        try:
            network = ipaddress.ip_network(cidr)
            if network.version == 4:
                ipv4_networks.append(network)
            else:
                ipv6_networks.append(network)
        except ValueError:
            continue
    
    # 分别处理IPv4和IPv6网络的去重
    def deduplicate_same_version_networks(networks):
        if not networks:
            return []
        
        # 按网络大小排序，大网络在前
        networks.sort(key=lambda x: x.num_addresses, reverse=True)
        
        # 去除被包含的子网络
        unique_networks = []
        for network in networks:
            is_contained = False
            for existing_network in unique_networks:
                if network.subnet_of(existing_network):
                    is_contained = True
                    break
            if not is_contained:
                unique_networks.append(network)
        
        return unique_networks
    
    # 分别去重IPv4和IPv6网络
    unique_ipv4 = deduplicate_same_version_networks(ipv4_networks)
    unique_ipv6 = deduplicate_same_version_networks(ipv6_networks)
    
    # 合并结果
    all_unique = unique_ipv4 + unique_ipv6
    return [str(net) for net in all_unique]

def write_output_file(filename, merged_cidr_data, asn_data):
    local_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    
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
    
    total_records = len(domains) + len(merged_cidr_data) + len(asn_data)
    
    with open(filename, 'w') as output_file:
        output_file.write("// Name: Telegram list\n")
        output_file.write("// Type: rule-set\n")
        output_file.write(f"// Last Updated: {local_time}\n")
        output_file.write(f"// Total: {total_records}\n")
        output_file.write("// Author: budaobu\n")
        output_file.write("// IP-ASN from: https://bgp.he.net/\n")
        output_file.write("// IP-CIDR from: https://core.telegram.org/resources/cidr.txt + BGP.HE Route data\n")
        
        # 写入域名信息
        for domain in domains:
            output_file.write(domain + '\n')
        
        # 写入合并后的CIDR信息
        for cidr in merged_cidr_data:
            try:
                network = ipaddress.ip_network(cidr)
                version = "IP-CIDR" if network.version == 4 else "IP-CIDR6"
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
    
    try:
        # 获取BGP.HE的ASN和Route数据
        asn_data, route_data = get_asn_and_route_data(asn_url, headers)
        
        # 获取官方CIDR数据
        official_cidr_data = get_official_cidr_data(cidr_url)
        
        # 合并并去重CIDR数据
        merged_cidr_data = merge_and_deduplicate_cidrs(official_cidr_data, route_data)
        
        # 确保文件夹存在
        os.makedirs("lists", exist_ok=True)
        
        write_output_file("lists/telegram.list", merged_cidr_data, asn_data)
        
        print(f"处理完成：官方CIDR {len(official_cidr_data)}条，BGP.HE Route {len(route_data)}条")
        print(f"合并去重后：{len(merged_cidr_data)}条CIDR，{len(asn_data)}条ASN")
        
    except Exception as e:
        print(f"执行出错：{e}")
        raise

if __name__ == "__main__":
    main()
