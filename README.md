# ASN CN Scraper

This repository contains a Python script that scrapes ASN (Autonomous System Number) data from the [BGP.he.net](https://bgp.he.net/country/CN) website. The script extracts ASN numbers and their corresponding names and saves the data into two files:

1. **`asn.cn.list`**: Contains all ASN data, including entries with empty names.
    ```
    https://raw.githubusercontent.com/budaobu/asn-cn-scraper/main/cn_asn.list
    ```
2. **`asn.cn.names.list`**: Contains only the ASN data where the ASN name is not empty.
    ```
    https://raw.githubusercontent.com/budaobu/asn-cn-scraper/main/cn_asn_named.list
    ```

## Features

- Automatically update daily through Actions. 
- Scrapes ASN data from `https://bgp.he.net/country/CN`.
- Saves all ASN data to `asn.cn.list`.
- Saves only ASN data with non-empty names to `asn.cn.names.list`.
- Each output file includes the timestamp of the data collection and the total number of ASNs.

