# Troubleshooting

## A website or app stopped working

1. Open your DNS filter's **query log** and look for blocked entries from around the time of the problem.
2. Allow the domain:
   - **Pi-hole:** *Domains* (v6) / *Allowlist* → add the domain as an exact allow entry → save.
   - **AdGuard Home:** *Filters → Custom filtering rules* → add `@@||example.com^` (replace with the domain).
3. Retry. If it works, please [report it](https://github.com/JoKeks2023/adaptive-blocklist/issues/new?template=broken-service.yml)
   so the list can be fixed upstream.

Not sure which domain? Temporarily disable blocking for a few minutes. If the problem disappears, the filter is the cause;
then look in the query log for entries from the affected device.

## Everything is offline

Your devices use the DNS filter, and it is switched off or unreachable. Power it on, or change the DNS server back in your
router. Giving the DNS filter a fixed IP address avoids this after a reboot.

## Ads still show up

- **YouTube/Twitch/Spotify in-stream ads** come from the same domains as the content and cannot be blocked by DNS.
- **Browser "secure DNS" (DoH):** the browser may bypass your DNS filter. Turn it off in the browser's privacy settings
  or point it at your filter.
- **Devices with hardcoded DNS** (some TVs, Chromecasts) ignore your router setting. Check the query log: if the device
  never appears, it uses another DNS server.
- **The list was not loaded:** in Pi-hole run *Update Gravity*; in AdGuard Home check that the list is enabled and has a
  non-zero count.
- **Other devices:** only devices using the DNS filter are protected, for example not on mobile data away from home.

## The list in the DNS filter shows an error or 0 entries

- Check that the address was pasted completely (starts with `https://`, ends with `.txt`).
- Open the address in a browser: you should see lines like `0.0.0.0 example.com`. If not, the site may be updating; retry in
  a few minutes.
- Large lists need memory: the *Malware* module has around 270,000 entries. On very small devices, disable that module first.

## I want to block or allow one specific domain

- Only for you: use your DNS filter's own allow/deny rules.
- For everyone: [suggest domains](https://github.com/JoKeks2023/adaptive-blocklist/issues/new?template=block-domain.yml) or
  [report a false positive](https://github.com/JoKeks2023/adaptive-blocklist/issues/new?template=broken-service.yml).

## Does blocking `example.com` also block `sub.example.com`?

No. The lists contain exact domains only. This is how Pi-hole matches list entries; wildcard behaviour would need
separate rules in your filter.
