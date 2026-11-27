# Fehlerhilfe

[English version](../troubleshooting.md)

## Eine Webseite oder App funktioniert nicht mehr

1. Öffne das **Abfrageprotokoll** deines DNS-Filters und suche nach geblockten Einträgen aus der Zeit des Problems.
2. Erlaube die Domain:
   - **Pi-hole:** *Group Management → Domains* → Domain als exakten Allow-Eintrag hinzufügen, oder per Kommandozeile `pihole allow example.com`.
   - **AdGuard Home:** *Filters → Custom filtering rules* → `@@||example.com^` eintragen (Domain ersetzen).
3. Erneut versuchen. Wenn es klappt, [melde es bitte](https://github.com/JoKeks2023/adaptive-blocklist/issues/new?template=broken-service.yml),
   damit die Liste für alle korrigiert werden kann.

Du weißt nicht, welche Domain? Schalte das Blocken kurz aus. Verschwindet das Problem, liegt es am Filter; suche dann im Abfrageprotokoll
nach Einträgen des betroffenen Geräts.

## Alles ist offline

Deine Geräte nutzen den DNS-Filter, und der ist ausgeschaltet oder nicht erreichbar. Schalte ihn ein oder stelle den DNS-Server im Router
zurück. Eine feste IP-Adresse für den DNS-Filter verhindert das Problem nach einem Neustart.

## Werbung erscheint trotzdem

- **In-Stream-Werbung bei YouTube/Twitch/Spotify** kommt von denselben Domains wie die Inhalte und lässt sich per DNS nicht blocken.
- **„Sicheres DNS“ (DoH) im Browser:** Der Browser kann deinen DNS-Filter umgehen. Schalte es in den Datenschutz-Einstellungen aus oder
  richte es auf deinen Filter.
- **Geräte mit fest eingestelltem DNS** (manche TVs, Chromecasts) ignorieren die Router-Einstellung. Taucht das Gerät nie im Abfrageprotokoll
  auf, nutzt es einen anderen DNS-Server.
- **Liste nicht geladen:** In Pi-hole *Update Gravity* ausführen; in AdGuard Home prüfen, ob die Liste aktiviert ist und mehr als 0 Einträge hat.
- **Andere Geräte:** Nur Geräte, die den DNS-Filter nutzen, sind geschützt, z. B. nicht im Mobilfunknetz unterwegs.

## Die Liste zeigt einen Fehler oder 0 Einträge

- Prüfe, ob die Adresse vollständig eingefügt wurde (beginnt mit `https://`, endet auf `.txt`).
- Öffne die Adresse im Browser: Du solltest Zeilen wie `0.0.0.0 example.com` sehen. Wenn nicht, aktualisiert die Seite vielleicht gerade; versuche es in ein paar Minuten erneut.
- Große Listen brauchen Speicher: Das Modul *Malware* hat rund 270.000 Einträge. Bei sehr kleinen Geräten dieses Modul zuerst abschalten.

## Ich möchte eine bestimmte Domain blocken oder erlauben

- Nur für dich: Nutze die eigenen Allow-/Deny-Regeln deines DNS-Filters.
- Für alle: [Domains vorschlagen](https://github.com/JoKeks2023/adaptive-blocklist/issues/new?template=block-domain.yml) oder
  [einen Fehlalarm melden](https://github.com/JoKeks2023/adaptive-blocklist/issues/new?template=broken-service.yml).

## Blockt `example.com` auch `sub.example.com`?

Nein. Die Listen enthalten nur exakte Domains. So gleicht Pi-hole Listeneinträge ab; Wildcard-Verhalten bräuchte eigene Regeln in deinem Filter.
