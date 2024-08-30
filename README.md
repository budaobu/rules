# ASN CN Scraper

Fetch ASN Chine data, updated daily.

## Features

1. Collect ASN data from two different sources.
2. Remove duplicates by ASN Number and keep the most detailed ASN Name.
3. Save the merged data to the file `asn_cn.list`.
4. Updated daily.

## Usage

**Surge**

```
RULE-SET,https://raw.githubusercontent.com/budaobu/asn-cn-scraper/main/asn_cn.list,DIRECT
```

## Sources

1. [ipip.net](https://whois.ipip.net/iso/CN)
2. [he.net](https://bgp.he.net/country/CN)
