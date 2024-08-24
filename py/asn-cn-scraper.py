import requests
from bs4 import BeautifulSoup
from datetime import datetime
import re
import os

def update_asn_cn_list():
    # 确保我们在正确的目录中操作
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(script_dir)
    filename = os.path.join(root_dir, "ASN-CN.list")
    
    # 1. 打开文件，写入初始文件头信息
    with open(filename, 'w', encoding='utf-8') as file:
        initial_header = f"""# ASN CN from: https://bgp.he.net/country/CN
# Last Updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
# Total ASNs: To be updated
# Made by budaobu.

"""
        file.write(initial_header)
    
    # 2. 解析URL，添加自定义请求头
    url = "https://bgp.he.net/country/CN"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
    }
    
    response = requests.get(url, headers=headers)
    soup = BeautifulSoup(response.content, 'html.parser')
    
    # 3. 获取ASN表格
    asn_table = soup.find('table', id='asns')
    if not asn_table:
        print("Error: Could not find the ASN table. The website structure might have changed or the request was blocked.")
        return
    
    rows = asn_table.find('tbody').find_all('tr')
    
    asn_list = []
    for row in rows:
        columns = row.find_all('td')
        asn_number = columns[0].text.strip()[2:]
        asn_name = columns[1].text.strip()
        
        # 4 & 5. 检查ASN名称是否为空，如果不为空则添加到列表
        if asn_name:
            asn_list.append(f"{asn_number} {asn_name}")
    
    # 计算ASN总数
    total_asns = len(asn_list)
    
    # 6. 只更新文件头信息中的最后更新时间和ASN总数
    with open(filename, 'r+', encoding='utf-8') as file:
        content = file.read()
        file.seek(0)
        
        # 更新最后更新时间
        content = re.sub(r'# Last Updated:.*', f'# Last Updated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}', content)
        
        # 更新ASN总数
        content = re.sub(r'# Total ASNs:.*', f'# Total ASNs: {total_asns}', content)
        
        file.write(content)
        file.write('\n'.join(asn_list))
        file.truncate()
    
    print(f"ASN-CN list has been updated. Total ASNs: {total_asns}")

if __name__ == "__main__":
    update_asn_cn_list()
