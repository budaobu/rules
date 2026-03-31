import asyncio
import ipaddress
from pathlib import Path
import aiohttp
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15"
}
OFFICIAL_CIDR_URL = "https://core.telegram.org/resources/cidr.txt"
BGP_ASN_URL = "https://bgp.he.net/search?search%5Bsearch%5D=%22telegram%20messenger%22&commit=Search"


async def fetch_official_cidrs(session: aiohttp.ClientSession) -> list[str]:
    for attempt in range(3):
        try:
            async with session.get(OFFICIAL_CIDR_URL, headers=HEADERS, timeout=30) as response:
                response.raise_for_status()
                text = await response.text()

            lines = []
            for line in text.splitlines():
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                try:
                    network = ipaddress.ip_network(line)
                    rule_type = "IP-CIDR6" if network.version == 6 else "IP-CIDR"
                    lines.append(f"{rule_type},{line},no-resolve")
                except ValueError:
                    print(f"  Skipping invalid CIDR: {line}")
            return lines

        except Exception as e:
            if attempt < 2:
                wait = 2 ** attempt * 5
                print(f"  CIDR fetch attempt {attempt + 1} failed: {e}. Retrying in {wait}s...")
                await asyncio.sleep(wait)
            else:
                print(f"  CIDR fetch failed after 3 attempts: {e}")
                return []

    return []


async def fetch_bgp_asns(session: aiohttp.ClientSession) -> list[str]:
    for attempt in range(3):
        try:
            async with session.get(BGP_ASN_URL, headers=HEADERS, timeout=30) as response:
                response.raise_for_status()
                html = await response.text()

            soup = BeautifulSoup(html, 'html.parser')
            lines = []

            for row in soup.select('table tbody tr'):
                type_cell = row.select_one('td:nth-of-type(2)')
                first_cell = row.select_one('td:nth-of-type(1)')
                if not type_cell or not first_cell:
                    continue
                if type_cell.text.strip() != "ASN":
                    continue

                raw = first_cell.text.strip()
                asn_num = raw.replace('AS', '').strip()
                if asn_num.isdigit():
                    lines.append(f"IP-ASN,AS{asn_num}")

            # deduplicate, preserve order
            seen = set()
            unique = []
            for line in lines:
                if line not in seen:
                    seen.add(line)
                    unique.append(line)

            return unique

        except Exception as e:
            if attempt < 2:
                wait = 2 ** attempt * 5
                print(f"  ASN fetch attempt {attempt + 1} failed: {e}. Retrying in {wait}s...")
                await asyncio.sleep(wait)
            else:
                print(f"  ASN fetch failed after 3 attempts: {e}")
                return []

    return []


def write_list(filepath: Path, lines: list[str]) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    tmp = filepath.with_suffix('.tmp')
    tmp.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    tmp.replace(filepath)


async def main():
    async with aiohttp.ClientSession() as session:
        print("Fetching official CIDRs...")
        cidr_lines = await fetch_official_cidrs(session)
        print(f"  {len(cidr_lines)} entries")

        print("Fetching BGP ASNs...")
        asn_lines = await fetch_bgp_asns(session)
        print(f"  {len(asn_lines)} entries")

    write_list(Path("lists/telegram_ip_official.list"), cidr_lines)
    print(f"Written: lists/telegram_ip_official.list")

    write_list(Path("lists/telegram_asn.list"), asn_lines)
    print(f"Written: lists/telegram_asn.list")


if __name__ == "__main__":
    asyncio.run(main())
