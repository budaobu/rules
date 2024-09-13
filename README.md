# rules

Rule lists for iOS Surge 5 App.

## Usage

```
RULE-SET,https://raw.githubusercontent.com/budaobu/rules/main/lists/cn_asn.list,DIRECT
```

```
RULE-SET,https://raw.githubusercontent.com/budaobu/rules/main/lists/telegram.list,DIRECT
```

## ASN CN

1. Fecth ASN data from two [ipip.net](https://whois.ipip.net/iso/CN) and [he.net](https://bgp.he.net/country/CN)
2. Remove duplicates by ASN Number and keep the most detailed ASN Name.
3. Save the merged data to the file `cn_asn.list`.
4. Updated daily.

## Telegram

1. Collect Telegram domain.
2. Fetch ip-cidr data from [Telegram](https://core.telegram.org/resources/cidr.txt).
3. Fetch ASN data from [he.net](https://bgp.he.net/).
4. Save the merged data to the file `telegram_asn.list`.
5. Updated daily.
