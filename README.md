# ASN CN Scraper

## Overview

This project is designed to scrape and merge Autonomous System Number (ASN) data from two different sources: [bgp.he.net](https://bgp.he.net) and [whois.ipip.net](https://whois.ipip.net). The goal is to create a unified list of ASNs for China, ensuring that there are no duplicates and selecting the most informative names.

## Features

- Asynchronously fetch ASN data using Pyppeteer.
- Fetch ASN data using the requests library for efficient HTTP requests.
- Merge ASN data from both sources to eliminate duplicates.
- Generate a clean output file with the merged ASN data.
- Automatically update the ASN data daily using GitHub Actions.

## Requirements

- Python 3.7+
- `requests`
- `pyppeteer`
- `beautifulsoup4`
- `asyncio`

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/asn-cn-scraper.git
   cd asn-cn-scraper
   ```
2. Install the required packages:
    ```
    pip install requests pyppeteer beautifulsoup4
    ```
## Usage
1. Run the main script:
   ```
   python asn-cn-scraper.py
   ```
2. The merged ASN data will be saved in a file named `asn_cn.list`.

## Automated Updates
This project is configured to automatically update the ASN data daily using GitHub Actions. You can check the Actions tab in the repository to see the status of the updates.
