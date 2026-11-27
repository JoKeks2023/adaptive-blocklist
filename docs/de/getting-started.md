# Einstieg (ohne Vorkenntnisse)

[English version](../getting-started.md)

Diese Anleitung führt dich von „Ich habe noch nie einen DNS-Server betrieben“ bis „Werbung und Tracker werden geblockt“.
Du brauchst etwa 30 Minuten. Es kann nichts kaputtgehen: Im Zweifel stellst du die DNS-Einstellung zurück, dann ist alles wie vorher.

## 1. Was bauen wir da?

Jedes Mal, wenn ein Gerät eine Webseite oder App öffnet, fragt es zuerst einen **DNS-Server**: „Welche Adresse gehört zu `example.com`?“
Normalerweise antwortet dein Router oder dein Provider. Ein **DNS-Filter** (Pi-hole oder AdGuard Home) ist dein eigener DNS-Server,
der bei Domains auf einer **Blockliste** die Antwort verweigert. Werbung, Tracker und Schadseiten werden dadurch gar nicht erst geladen.

Dieses Projekt erzeugt diese Blocklisten. Im [Konfigurator](https://jokeks2023.github.io/adaptive-blocklist/) wählst du, was geblockt
werden soll, und fügst eine Adresse in deinen DNS-Filter ein. Der hält die Liste danach selbst aktuell.

```
Deine Geräte ──> Pi-hole / AdGuard Home (prüft die Blockliste) ──> Internet
```

## 2. Was du brauchst

- Ein Gerät, das **immer an** ist, möglichst per Kabel: Raspberry Pi, ein alter PC, NAS oder ein kleiner Server.
- Zugriff auf die **DNS-Einstellung** deines Routers (oder einzelner Geräte).
- Empfohlen: dem DNS-Filter-Gerät eine **feste IP-Adresse** geben („DHCP-Reservierung“ im Router).

## 3. DNS-Filter installieren (einen auswählen)

| | Pi-hole | AdGuard Home |
|---|---|---|
| Gut für | Große Community, viele Anleitungen | Einfache Einrichtung, verschlüsseltes Upstream-DNS eingebaut |
| Installation | [docs.pi-hole.net](https://docs.pi-hole.net/main/basic-install/) | [github.com/AdguardTeam/AdGuardHome](https://github.com/AdguardTeam/AdGuardHome#getting-started) |
| Docker | [Docker-Anleitung](https://github.com/pi-hole/docker-pi-hole) | [Docker-Anleitung](https://hub.docker.com/r/adguard/adguardhome) |

Folge der offiziellen Installationsanleitung. Beide enden mit einer Weboberfläche zur Verwaltung. Beide funktionieren mit diesem Projekt;
wenn du unsicher bist, nimm Pi-hole.

## 4. Geräte auf den DNS-Filter umleiten

Der DNS-Filter hilft nur bei Geräten, die ihn auch fragen.

- **Ganzes Netzwerk (empfohlen):** Suche im Router die Einstellung für *DHCP* bzw. *DNS-Server* und trage die IP-Adresse deines
  Pi-hole/AdGuard Home als DNS-Server ein. Verbinde die Geräte neu (oder warte etwas), damit sie die Änderung übernehmen.
- **Einzelnes Gerät:** DNS-Server in den Netzwerkeinstellungen des Geräts manuell setzen.

> Ist das DNS-Filter-Gerät ausgeschaltet, haben Geräte, die darauf zeigen, kein Internet. Das ist kein Fehler: Gerät einschalten oder die Router-Einstellung zurücksetzen.

## 5. Blockliste hinzufügen

1. Öffne den [Konfigurator](https://jokeks2023.github.io/adaptive-blocklist/) und wähle das Profil **Desktop**.
2. **Sicher starten:** Schalte das Modul **Telemetry** (als „High risk“ markiert) aus. Es kann Updates oder Smart-Home-Funktionen blockieren.
   Du kannst es später ergänzen, siehe Abschnitt 7.
3. Kopiere die Adresse unter **Your list** und folge der Anleitung **How to use your list** für deinen DNS-Filter. Kurzfassung:
   - **Pi-hole:** *Group Management → Adlists* (in v6 evtl. *Lists* genannt) → Adresse einfügen → *Add* → *Tools → Update Gravity*.
   - **AdGuard Home:** *Filters → DNS blocklists → Add blocklist → Add a custom list* → Adresse einfügen → speichern.

Hast du ein Modul abgeschaltet, zeigt der Konfigurator eine Adresse pro Modul (für eigene Kombinationen gibt es keine einzelne Adresse).
Füge jede davon hinzu.

## 6. Prüfen, ob es funktioniert

- Öffne das Abfrageprotokoll (Query Log) deines DNS-Filters und surfe ein paar Seiten. Geblockte Anfragen sind als geblockt markiert.
- Eine werbelastige Nachrichtenseite sollte aufgeräumter aussehen.
- Klappt es nicht? Siehe [Fehlerhilfe](troubleshooting.md).

## 7. Mit der Zeit mehr Schutz ergänzen

Füge Module **einzeln** hinzu und nutze deine Geräte einen Tag, bevor du das nächste aktivierst. Wenn etwas kaputtgeht, weißt du,
welches Modul schuld ist. **Telemetry** macht am ehesten Probleme, weil es z. B. Update-Prüfungen, Sprachassistenten und TV-Funktionen blockiert.

## 8. Etwas funktioniert nicht mehr?

Keine Panik, das lässt sich beheben:

1. Suche die geblockte Domain im Abfrageprotokoll deines DNS-Filters.
2. Erlaube sie sofort in deinem DNS-Filter (siehe [Fehlerhilfe](troubleshooting.md)).
3. Melde es mit dem Button **Report a problem** im Konfigurator, damit wir die Liste für alle verbessern können.

## Glossar

- **DNS**: Das „Telefonbuch“ des Internets: übersetzt Namen (`example.com`) in Adressen.
- **DNS-Filter**: Dein eigener DNS-Server, der bestimmte Namen verweigern kann (Pi-hole, AdGuard Home).
- **Blockliste / Adlist**: Textdatei mit Domains, die verweigert werden.
- **Allowlist**: Domains, die du ausdrücklich durchlässt, auch wenn eine Blockliste sie enthält.
- **Gravity**: Pi-holes Datenbank aus allen Listen; „Update Gravity“ lädt alle Listen neu.
- **Modul / Profil**: Ein Modul ist eine Art von Blockierung (z. B. Werbung); ein Profil ist ein fertiges Set aus Modulen.
