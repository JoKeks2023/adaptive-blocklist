# Getting started (no prior DNS knowledge needed)

This guide takes you from "I have never run a DNS server" to "ads and trackers are blocked on my devices".
It takes about 30 minutes. Nothing here can damage your devices: if something goes wrong, you switch the DNS
setting back and everything is as before.

## 1. What are we building?

Every time a device opens a website or app, it first asks a **DNS server** "which address belongs to `example.com`?".
By default that is your router or your provider. A **DNS filter** (Pi-hole or AdGuard Home) is your own DNS server
that refuses to answer for domains on a **blocklist**: ads, trackers and malware simply never load.

This project builds those blocklists. You pick what to block in the [configurator](https://jokeks2023.github.io/adaptive-blocklist/)
and paste one address into your DNS filter. It then keeps the list up to date by itself.

```
Your devices ──> Pi-hole / AdGuard Home (checks the blocklist) ──> internet
```

## 2. What you need

- A device that is **always on** and connected by cable if possible: Raspberry Pi, a spare PC, a NAS or a small server.
- Ability to change the **DNS setting** in your router (or on single devices).
- Optional but recommended: give that device a **fixed IP address** (a "DHCP reservation" in your router).

## 3. Install a DNS filter (pick one)

| | Pi-hole | AdGuard Home |
|---|---|---|
| Good for | Large community, many tutorials | Simple setup, built-in encrypted upstream DNS |
| Install | [docs.pi-hole.net](https://docs.pi-hole.net/main/basic-install/) | [github.com/AdguardTeam/AdGuardHome](https://github.com/AdguardTeam/AdGuardHome#getting-started) |
| Docker | [Docker guide](https://github.com/pi-hole/docker-pi-hole) | [Docker guide](https://hub.docker.com/r/adguard/adguardhome) |

Follow the official install instructions. Both end with a web page where you manage everything.
Both work well with this project; if you are unsure, start with Pi-hole.

## 4. Send your devices' DNS requests to it

The DNS filter only helps for devices that actually ask it.

- **Whole network (recommended):** in your router, look for *DHCP* or *DNS server* settings and enter the IP address of
  your Pi-hole/AdGuard Home as the DNS server. Reconnect your devices (or wait a while) so they pick it up.
- **Single device:** set the DNS server manually in that device's network settings.

> If the DNS filter device is switched off, devices pointed at it lose internet access.
> That is not a bug: change the router setting back (or power the device on) to fix it.

## 5. Add the blocklist

1. Open the [configurator](https://jokeks2023.github.io/adaptive-blocklist/) and choose the **Desktop** profile.
2. **Start safely:** switch off the **Telemetry** module (marked high risk). It can block updates or smart-home features.
   You can add it later, see section 7.
3. Copy the address shown under **Your list** and follow the **How to use your list** steps for your DNS filter.
   In short:
   - **Pi-hole:** *Group Management → Adlists* (called *Lists* in v6) → paste → *Add* → *Tools → Update Gravity*.
   - **AdGuard Home:** *Filters → DNS blocklists → Add blocklist → Add a custom list* → paste → save.

If you turned off a module, the configurator shows one address per module (there is no single address for custom
combinations). Add each of them.

## 6. Check that it works

- Open the query log of your DNS filter, then browse a few sites. Blocked requests are marked as blocked.
- Test page: any ad-heavy news site should look cleaner.
- Not working? See [Troubleshooting](troubleshooting.md).

## 7. Adding more protection over time

Add modules **one at a time** and use your devices for a day before adding the next. If something breaks, you know
which module caused it. The **Telemetry** module is the most likely to cause trouble, because it blocks things like
update checks, voice assistants and TV features.

## 8. Something broke?

Don't panic, it is fixable:

1. Find the blocked domain in your DNS filter's query log.
2. Allow it in your DNS filter right away (see [Troubleshooting](troubleshooting.md)).
3. Tell us with the **Report a problem** button in the configurator, so we can fix the list for everybody.

## Glossary

- **DNS**: the internet's phone book, translating names (`example.com`) into addresses.
- **DNS filter**: your own DNS server that can refuse certain names (Pi-hole, AdGuard Home).
- **Blocklist / adlist**: a text file with domains to refuse.
- **Allowlist**: domains you explicitly let through even if a blocklist contains them.
- **Gravity**: Pi-hole's name for its combined blocklist database; "Update Gravity" re-downloads all lists.
- **Module / profile**: here, a module is one kind of blocking (e.g. advertising); a profile is a ready-made set of modules.
