import asyncio
import json
import hashlib
import ipaddress
from datetime import datetime
from pathlib import Path
from typing import List, Set, Tuple, Dict, Optional
from dataclasses import dataclass, asdict, field
from enum import Enum
import aiohttp
from bs4 import BeautifulSoup


class RuleType(Enum):
    """规则类型枚举"""
    PROCESS = "PROCESS-NAME"
    DOMAIN = "DOMAIN-SUFFIX"
    IP_CIDR = "IP-CIDR"
    IP_CIDR6 = "IP-CIDR6"
    IP_ASN = "IP-ASN"


@dataclass
class ASNInfo:
    """ASN信息"""
    number: str
    name: str
    
    def __hash__(self):
        return hash(self.number)
    
    def __eq__(self, other):
        return isinstance(other, ASNInfo) and self.number == other.number


@dataclass
class TelegramSnapshot:
    """Telegram规则快照"""
    timestamp: str
    total_count: int
    cidr_count: int
    asn_count: int
    domain_count: int
    cidrs: List[str]
    asns: List[Dict[str, str]]
    checksum: str
    sources: Dict[str, int] = field(default_factory=dict)
    
    @classmethod
    def create(cls, cidrs: List[str], asns: List[ASNInfo], 
               domain_count: int, sources: Dict[str, int]) -> 'TelegramSnapshot':
        # 按版本和网络地址分别排序
        def sort_key(cidr: str):
            network = ipaddress.ip_network(cidr)
            return (network.version, network.network_address)
        
        sorted_cidrs = sorted(cidrs, key=sort_key)
        sorted_asns = sorted([{'number': a.number, 'name': a.name} for a in asns], 
                           key=lambda x: int(x['number']))
        
        data_str = '|'.join(sorted_cidrs) + '|' + '|'.join(a['number'] for a in sorted_asns)
        checksum = hashlib.sha256(data_str.encode()).hexdigest()[:16]
        
        return cls(
            timestamp=datetime.utcnow().isoformat(),
            total_count=len(sorted_cidrs) + len(sorted_asns) + domain_count,
            cidr_count=len(sorted_cidrs),
            asn_count=len(sorted_asns),
            domain_count=domain_count,
            cidrs=sorted_cidrs,
            asns=sorted_asns,
            checksum=checksum,
            sources=sources
        )


class CIDROptimizer:
    """CIDR网络优化器，负责去重和合并"""
    
    @staticmethod
    def optimize(cidrs: List[str]) -> List[str]:
        """优化CIDR列表，移除被包含的子网"""
        if not cidrs:
            return []
        
        networks = []
        for cidr in cidrs:
            try:
                networks.append(ipaddress.ip_network(cidr))
            except ValueError:
                continue
        
        if not networks:
            return []
        
        # 按版本分组
        ipv4 = [n for n in networks if n.version == 4]
        ipv6 = [n for n in networks if n.version == 6]
        
        # 分别优化
        optimized_v4 = CIDROptimizer._deduplicate_networks(ipv4)
        optimized_v6 = CIDROptimizer._deduplicate_networks(ipv6)
        
        return [str(n) for n in optimized_v4 + optimized_v6]
    
    @staticmethod
    def _deduplicate_networks(networks: List[ipaddress.IPv4Network | ipaddress.IPv6Network]) -> List:
        """去除被包含的子网络"""
        if not networks:
            return []
        
        # 按网络大小排序（大网络优先）
        networks.sort(key=lambda x: (x.num_addresses, x.network_address), reverse=True)
        
        unique = []
        for network in networks:
            # 检查是否被已有网络包含
            if not any(network.subnet_of(existing) for existing in unique):
                unique.append(network)
        
        # 按网络地址排序输出
        unique.sort(key=lambda x: x.network_address)
        return unique


class TelegramDataScraper:
    """Telegram数据抓取器"""
    
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                         "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15"
        }
        self.bgp_url = "https://bgp.he.net/search?search%5Bsearch%5D=%22telegram%20messenger%22&commit=Search"
        self.official_cidr_url = "https://core.telegram.org/resources/cidr.txt"
    
    async def fetch_bgp_data(self) -> Tuple[Set[ASNInfo], List[str]]:
        """从BGP.HE抓取ASN和Route数据"""
        for attempt in range(3):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(self.bgp_url, headers=self.headers, timeout=30) as response:
                        response.raise_for_status()
                        html = await response.text()
                
                soup = BeautifulSoup(html, 'html.parser')
                asns = set()
                routes = []
                
                for row in soup.select('table tbody tr'):
                    try:
                        asn_type = row.select_one('td:nth-of-type(2)')
                        first_col = row.select_one('td:nth-of-type(1)')
                        
                        if not asn_type or not first_col:
                            continue
                        
                        type_text = asn_type.text.strip()
                        first_text = first_col.text.strip()
                        
                        if type_text == "ASN":
                            asn_num = first_text.replace('AS', '').strip()
                            asn_name = row.select_one('td:nth-of-type(3)')
                            name_text = asn_name.text.strip() if asn_name else "Unknown"
                            
                            if asn_num.isdigit():
                                asns.add(ASNInfo(number=asn_num, name=name_text))
                        
                        elif type_text == "Route":
                            try:
                                ipaddress.ip_network(first_text)
                                routes.append(first_text)
                            except ValueError:
                                pass
                    
                    except (AttributeError, IndexError):
                        continue
                
                return asns, routes
            
            except Exception as e:
                wait_time = 2 ** attempt * 5
                if attempt < 2:
                    print(f"BGP fetch attempt {attempt + 1} failed: {e}. Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    print(f"BGP fetch failed after 3 attempts: {e}")
                    return set(), []
        
        return set(), []
    
    async def fetch_official_cidrs(self) -> List[str]:
        """从官方源获取CIDR列表"""
        for attempt in range(3):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(self.official_cidr_url, timeout=30) as response:
                        response.raise_for_status()
                        text = await response.text()
                
                cidrs = []
                for line in text.splitlines():
                    line = line.strip()
                    if line and not line.startswith('#'):
                        try:
                            ipaddress.ip_network(line)
                            cidrs.append(line)
                        except ValueError:
                            pass
                
                return cidrs
            
            except Exception as e:
                wait_time = 2 ** attempt * 5
                if attempt < 2:
                    print(f"Official CIDR fetch attempt {attempt + 1} failed: {e}. Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    print(f"Official CIDR fetch failed after 3 attempts: {e}")
                    return []
        
        return []
    
    async def fetch_all(self) -> Tuple[Set[ASNInfo], List[str], Dict[str, int]]:
        """并行抓取所有数据"""
        results = await asyncio.gather(
            self.fetch_bgp_data(),
            self.fetch_official_cidrs(),
            return_exceptions=True
        )
        
        bgp_result = results[0] if not isinstance(results[0], Exception) else (set(), [])
        official_result = results[1] if not isinstance(results[1], Exception) else []
        
        asns, bgp_routes = bgp_result
        official_cidrs = official_result
        
        sources = {
            'bgp.he.net_asn': len(asns),
            'bgp.he.net_routes': len(bgp_routes),
            'telegram_official': len(official_cidrs)
        }
        
        # 合并并优化CIDR
        all_cidrs = official_cidrs + bgp_routes
        optimized_cidrs = CIDROptimizer.optimize(all_cidrs)
        
        return asns, optimized_cidrs, sources


class TelegramRuleWriter:
    """Telegram规则文件写入器"""
    
    # 内置域名规则
    DOMAIN_RULES = [
        ("PROCESS-NAME", "org.telegram.messenger", None),
        ("DOMAIN-SUFFIX", "t.me", None),
        ("DOMAIN-SUFFIX", "tx.me", None),
        ("DOMAIN-SUFFIX", "tg.dev", None),
        ("DOMAIN-SUFFIX", "tdesktop.com", None),
        ("DOMAIN-SUFFIX", "telegra.ph", None),
        ("DOMAIN-SUFFIX", "telega.one", None),
        ("DOMAIN-SUFFIX", "telegram.me", None),
        ("DOMAIN-SUFFIX", "telegram.org", None),
        ("DOMAIN-SUFFIX", "telegram.dog", None),
        ("DOMAIN-SUFFIX", "telegram.space", None),
        ("DOMAIN-SUFFIX", "graph.org", None),
        ("DOMAIN-SUFFIX", "legra.ph", None),
        ("DOMAIN-SUFFIX", "telesco.pe", None),
        ("DOMAIN-SUFFIX", "cdn-telegram.org", None),
        ("DOMAIN-SUFFIX", "comments.app", "Bot"),
        ("IP-CIDR", "5.28.192.0/18,no-resolve", None),
    ]
    
    @staticmethod
    def write(filepath: Path, snapshot: TelegramSnapshot, changelog: Optional[Dict] = None) -> None:
        """写入规则文件"""
        filepath.parent.mkdir(parents=True, exist_ok=True)
        temp_file = filepath.with_suffix('.tmp')
        
        with open(temp_file, 'w', encoding='utf-8') as f:
            # 文件头
            f.write("// Name: Telegram list\n")
            f.write("// Type: rule-set\n")
            f.write(f"// Last Updated: {snapshot.timestamp}\n")
            f.write(f"// Total: {snapshot.total_count}\n")
            f.write(f"// CIDR: {snapshot.cidr_count} | ASN: {snapshot.asn_count} | Domain: {snapshot.domain_count}\n")
            f.write(f"// Checksum: {snapshot.checksum}\n")
            f.write("// Sources: bgp.he.net, core.telegram.org\n")
            
            # 变更信息
            if changelog:
                f.write(f"// Changes: CIDR +{changelog['cidr_added']} -{changelog['cidr_removed']}, "
                       f"ASN +{changelog['asn_added']} -{changelog['asn_removed']}\n")
            
            f.write("\n")
            
            # 写入域名规则
            for rule_type, value, comment in TelegramRuleWriter.DOMAIN_RULES:
                line = f"{rule_type},{value}"
                if comment:
                    line += f" // {comment}"
                f.write(line + "\n")
            
            # 写入CIDR规则
            for cidr in snapshot.cidrs:
                try:
                    network = ipaddress.ip_network(cidr)
                    rule_type = "IP-CIDR" if network.version == 4 else "IP-CIDR6"
                    f.write(f"{rule_type},{cidr},no-resolve\n")
                except ValueError:
                    pass
            
            # 写入ASN规则
            for asn in snapshot.asns:
                f.write(f"IP-ASN,{asn['number']}\n")
        
        temp_file.replace(filepath)


class SnapshotManager:
    """快照管理器"""
    
    def __init__(self, base_dir: str = "data/telegram"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.history_dir = self.base_dir / "history"
        self.history_dir.mkdir(exist_ok=True)
    
    def save_snapshot(self, snapshot: TelegramSnapshot) -> None:
        """保存快照"""
        timestamp = datetime.fromisoformat(snapshot.timestamp)
        filename = f"snapshot_{timestamp.strftime('%Y%m%d_%H%M%S')}.json"
        filepath = self.history_dir / filename
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(asdict(snapshot), f, indent=2, ensure_ascii=False)
        
        self._cleanup_old_snapshots(keep=30)
    
    def _cleanup_old_snapshots(self, keep: int) -> None:
        """清理旧快照"""
        snapshots = sorted(self.history_dir.glob("snapshot_*.json"))
        for old in snapshots[:-keep]:
            old.unlink()
    
    def get_latest_snapshot(self) -> Optional[TelegramSnapshot]:
        """获取最新快照"""
        snapshots = sorted(self.history_dir.glob("snapshot_*.json"))
        if not snapshots:
            return None
        
        with open(snapshots[-1], 'r', encoding='utf-8') as f:
            data = json.load(f)
            return TelegramSnapshot(**data)
    
    def compare_snapshots(self, old: TelegramSnapshot, new: TelegramSnapshot) -> Dict:
        """比较快照差异"""
        old_cidrs = set(old.cidrs)
        new_cidrs = set(new.cidrs)
        
        old_asns = {a['number'] for a in old.asns}
        new_asns = {a['number'] for a in new.asns}
        
        cidr_added = sorted(new_cidrs - old_cidrs)
        cidr_removed = sorted(old_cidrs - new_cidrs)
        asn_added = sorted(new_asns - old_asns, key=int)
        asn_removed = sorted(old_asns - new_asns, key=int)
        
        return {
            'cidr_added': len(cidr_added),
            'cidr_removed': len(cidr_removed),
            'asn_added': len(asn_added),
            'asn_removed': len(asn_removed),
            'cidr_added_list': cidr_added[:10],
            'cidr_removed_list': cidr_removed[:10],
            'asn_added_list': asn_added[:10],
            'asn_removed_list': asn_removed[:10],
        }


async def main():
    print("=== Telegram Rule List Generator ===\n")
    
    # 初始化组件
    scraper = TelegramDataScraper()
    manager = SnapshotManager()
    writer = TelegramRuleWriter()
    
    # 抓取数据
    print("Fetching data from sources...")
    asns, cidrs, sources = await scraper.fetch_all()
    
    print(f"✓ BGP.HE ASN: {sources['bgp.he.net_asn']}")
    print(f"✓ BGP.HE Routes: {sources['bgp.he.net_routes']}")
    print(f"✓ Official CIDR: {sources['telegram_official']}")
    print(f"✓ Optimized CIDR: {len(cidrs)}")
    print(f"✓ Domain Rules: {len(writer.DOMAIN_RULES)}\n")
    
    # 创建快照
    new_snapshot = TelegramSnapshot.create(
        cidrs=cidrs,
        asns=list(asns),
        domain_count=len(writer.DOMAIN_RULES),
        sources=sources
    )
    
    # 比较变更
    old_snapshot = manager.get_latest_snapshot()
    changelog = None
    
    if old_snapshot:
        changelog = manager.compare_snapshots(old_snapshot, new_snapshot)
        print("Changes detected:")
        print(f"  CIDR: +{changelog['cidr_added']} -{changelog['cidr_removed']}")
        print(f"  ASN: +{changelog['asn_added']} -{changelog['asn_removed']}\n")
        
        if changelog['cidr_added_list']:
            print(f"  Added CIDR (first 10): {', '.join(changelog['cidr_added_list'])}")
        if changelog['cidr_removed_list']:
            print(f"  Removed CIDR (first 10): {', '.join(changelog['cidr_removed_list'])}")
    else:
        print("No previous snapshot found, creating initial version\n")
    
    # 保存
    manager.save_snapshot(new_snapshot)
    
    output_file = Path("lists/telegram.list")
    writer.write(output_file, new_snapshot, changelog)
    
    print(f"✓ Rule list written to: {output_file}")
    print(f"✓ Total rules: {new_snapshot.total_count}")
    print(f"✓ Snapshot saved with checksum: {new_snapshot.checksum}")


if __name__ == "__main__":
    asyncio.run(main())
