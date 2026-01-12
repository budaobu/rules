import asyncio
import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import List, Set, Dict, Optional
from dataclasses import dataclass, asdict
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup
import aiohttp


@dataclass
class ASNSnapshot:
    """ASN数据快照"""
    timestamp: str
    total_count: int
    asn_list: List[int]
    sources: Dict[str, int]
    checksum: str
    
    @classmethod
    def create(cls, asn_list: List[int], sources: Dict[str, int]) -> 'ASNSnapshot':
        sorted_list = sorted(asn_list)
        checksum = hashlib.sha256(
            ','.join(map(str, sorted_list)).encode()
        ).hexdigest()[:16]
        
        return cls(
            timestamp=datetime.utcnow().isoformat(),
            total_count=len(sorted_list),
            asn_list=sorted_list,
            sources=sources,
            checksum=checksum
        )


class ASNDataManager:
    """ASN数据管理器，负责历史记录和变更追踪"""
    
    def __init__(self, base_dir: str = "data"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.history_dir = self.base_dir / "history"
        self.history_dir.mkdir(exist_ok=True)
        
    def save_snapshot(self, snapshot: ASNSnapshot) -> None:
        """保存快照到历史记录"""
        timestamp = datetime.fromisoformat(snapshot.timestamp)
        filename = f"snapshot_{timestamp.strftime('%Y%m%d_%H%M%S')}.json"
        filepath = self.history_dir / filename
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(asdict(snapshot), f, indent=2, ensure_ascii=False)
        
        # 保留最近30个快照
        self._cleanup_old_snapshots(keep=30)
    
    def _cleanup_old_snapshots(self, keep: int) -> None:
        """清理旧快照，保留最新的N个"""
        snapshots = sorted(self.history_dir.glob("snapshot_*.json"))
        for old_snapshot in snapshots[:-keep]:
            old_snapshot.unlink()
    
    def get_latest_snapshot(self) -> Optional[ASNSnapshot]:
        """获取最新快照"""
        snapshots = sorted(self.history_dir.glob("snapshot_*.json"))
        if not snapshots:
            return None
        
        with open(snapshots[-1], 'r', encoding='utf-8') as f:
            data = json.load(f)
            return ASNSnapshot(**data)
    
    def compare_snapshots(self, old: ASNSnapshot, new: ASNSnapshot) -> Dict:
        """比较两个快照的差异"""
        old_set = set(old.asn_list)
        new_set = set(new.asn_list)
        
        added = sorted(new_set - old_set)
        removed = sorted(old_set - new_set)
        
        change_rate = len(added) + len(removed)
        total_avg = (old.total_count + new.total_count) / 2
        change_percentage = (change_rate / total_avg * 100) if total_avg > 0 else 0
        
        return {
            'added': added,
            'removed': removed,
            'added_count': len(added),
            'removed_count': len(removed),
            'change_percentage': round(change_percentage, 2),
            'old_total': old.total_count,
            'new_total': new.total_count
        }


class ASNScraper:
    """ASN数据抓取器"""
    
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                         "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15"
        }
    
    async def fetch_from_ipip(self, url: str) -> Set[int]:
        """从ipip.net抓取数据"""
        for attempt in range(3):
            try:
                async with async_playwright() as p:
                    browser = await p.chromium.launch(
                        headless=True,
                        args=['--no-sandbox', '--disable-dev-shm-usage']
                    )
                    page = await browser.new_page()
                    await page.set_extra_http_headers({"User-Agent": self.headers['User-Agent']})
                    
                    await page.goto(url, wait_until='networkidle', timeout=60000)
                    await page.wait_for_selector('table.tablesorter tbody tr', timeout=30000)
                    
                    content = await page.content()
                    await browser.close()
                
                soup = BeautifulSoup(content, 'html.parser')
                asn_set = set()
                
                for row in soup.select('table.tablesorter tbody tr'):
                    td = row.select_one('td:nth-of-type(1)')
                    if td:
                        asn_text = td.text.replace('AS', '').strip()
                        if asn_text.isdigit():
                            asn_set.add(int(asn_text))
                
                return asn_set
                
            except Exception as e:
                wait_time = 2 ** attempt * 5
                if attempt < 2:
                    print(f"IPIP fetch attempt {attempt + 1} failed: {e}. Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    print(f"IPIP fetch failed after 3 attempts: {e}")
                    return set()
        
        return set()
    
    async def fetch_from_he(self, url: str) -> Set[int]:
        """从bgp.he.net抓取数据"""
        for attempt in range(3):
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(url, headers=self.headers, timeout=30) as response:
                        response.raise_for_status()
                        html = await response.text()
                
                soup = BeautifulSoup(html, 'html.parser')
                asn_set = set()
                
                for row in soup.select('#asns tbody tr'):
                    link = row.select_one('td:nth-of-type(1) a')
                    if link:
                        asn_text = link.text.replace('AS', '').strip()
                        if asn_text.isdigit():
                            asn_set.add(int(asn_text))
                
                return asn_set
                
            except Exception as e:
                wait_time = 2 ** attempt * 5
                if attempt < 2:
                    print(f"HE fetch attempt {attempt + 1} failed: {e}. Retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    print(f"HE fetch failed after 3 attempts: {e}")
                    return set()
        
        return set()
    
    async def fetch_all(self) -> tuple[Set[int], Dict[str, int]]:
        """并行抓取所有数据源"""
        url_he = "https://bgp.he.net/country/CN"
        url_ipip = "https://whois.ipip.net/iso/CN"
        
        results = await asyncio.gather(
            self.fetch_from_he(url_he),
            self.fetch_from_ipip(url_ipip),
            return_exceptions=True
        )
        
        asn_he = results[0] if not isinstance(results[0], Exception) else set()
        asn_ipip = results[1] if not isinstance(results[1], Exception) else set()
        
        sources = {
            'bgp.he.net': len(asn_he),
            'whois.ipip.net': len(asn_ipip)
        }
        
        merged = asn_he | asn_ipip
        
        # 数据源一致性检查
        if asn_he and asn_ipip:
            overlap = asn_he & asn_ipip
            overlap_rate = len(overlap) / max(len(asn_he), len(asn_ipip)) * 100
            print(f"Data source overlap: {overlap_rate:.1f}%")
            
            if overlap_rate < 50:
                print("⚠️  WARNING: Low overlap between sources, data quality may be compromised")
        
        return merged, sources


class ASNFileWriter:
    """ASN文件写入器"""
    
    @staticmethod
    def write(filepath: Path, snapshot: ASNSnapshot, changelog: Optional[Dict] = None) -> None:
        """写入ASN列表文件"""
        filepath.parent.mkdir(parents=True, exist_ok=True)
        
        temp_file = filepath.with_suffix('.tmp')
        
        with open(temp_file, 'w', encoding='utf-8') as f:
            # 元数据
            f.write("// Name: China ASN\n")
            f.write("// Type: rule-set\n")
            f.write(f"// Last Updated: {snapshot.timestamp}\n")
            f.write(f"// Total ASN: {snapshot.total_count}\n")
            f.write(f"// Checksum: {snapshot.checksum}\n")
            f.write("// Sources: bgp.he.net, whois.ipip.net\n")
            
            # 变更信息
            if changelog:
                f.write(f"// Changes: +{changelog['added_count']} -{changelog['removed_count']} "
                       f"({changelog['change_percentage']}%)\n")
                if changelog['added']:
                    f.write(f"// Added: {', '.join(map(str, changelog['added'][:10]))}"
                           f"{'...' if len(changelog['added']) > 10 else ''}\n")
                if changelog['removed']:
                    f.write(f"// Removed: {', '.join(map(str, changelog['removed'][:10]))}"
                           f"{'...' if len(changelog['removed']) > 10 else ''}\n")
            
            f.write("\n")
            
            # ASN数据
            for asn in snapshot.asn_list:
                f.write(f"IP-ASN,{asn}\n")
        
        # 原子性替换
        temp_file.replace(filepath)


async def main():
    print("=== China ASN Data Scraper ===\n")
    
    # 初始化组件
    scraper = ASNScraper()
    manager = ASNDataManager()
    writer = ASNFileWriter()
    
    # 抓取数据
    print("Fetching ASN data from sources...")
    asn_set, sources = await scraper.fetch_all()
    
    if not asn_set:
        print("❌ Failed to fetch any ASN data")
        return
    
    print(f"✓ HE.net: {sources['bgp.he.net']} ASNs")
    print(f"✓ IPIP.net: {sources['whois.ipip.net']} ASNs")
    print(f"✓ Merged: {len(asn_set)} unique ASNs\n")
    
    # 创建新快照
    new_snapshot = ASNSnapshot.create(list(asn_set), sources)
    
    # 获取旧快照并比较
    old_snapshot = manager.get_latest_snapshot()
    changelog = None
    
    if old_snapshot:
        changelog = manager.compare_snapshots(old_snapshot, new_snapshot)
        print(f"Changes detected:")
        print(f"  Added: {changelog['added_count']}")
        print(f"  Removed: {changelog['removed_count']}")
        print(f"  Change rate: {changelog['change_percentage']}%\n")
        
        # 异常检测
        if changelog['change_percentage'] > 20:
            print("⚠️  WARNING: Large data change detected (>20%), please verify manually")
            print(f"  Old total: {changelog['old_total']}")
            print(f"  New total: {changelog['new_total']}")
    else:
        print("No previous snapshot found, creating initial version\n")
    
    # 保存快照
    manager.save_snapshot(new_snapshot)
    
    # 写入文件
    output_file = Path("lists/cn_asn.list")
    writer.write(output_file, new_snapshot, changelog)
    
    print(f"✓ ASN list written to: {output_file}")
    print(f"✓ Snapshot saved with checksum: {new_snapshot.checksum}")


if __name__ == "__main__":
    asyncio.run(main())
