# GPT Stats 📊

Ein lokales Statistik-Dashboard für deinen **ChatGPT-Datenexport** — im Apple-Design, komplett offline, ohne Abhängigkeiten.

Ziehe die `conversations-*.json` Dateien deines Exports in den Browser und erhalte über 50 Kennzahlen, 15+ interaktive Charts und einen durchsuchbaren Chat-Reader.

> 🔒 **Privatsphäre:** Alles läuft zu 100 % lokal in deinem Browser. Es gibt keinen Server, kein Tracking, keine externen Bibliotheken — deine Daten verlassen niemals deinen Rechner.

## Features

### 📈 Statistik-Dashboard
- **Überblick** — Gespräche, Nachrichten, Wörter, geschätzte Tokens, aktive Tage, allererste & letzte Nachricht
- **Aktivität** — Tagesverlauf, Wochentags- & Stunden-Verteilung, Wochentag×Uhrzeit-Heatmap, GitHub-Style-Kalender, Streaks, Nachteulen-Quote
- **Modelle** — Verteilung der genutzten Modelle (Donut), Thinking-Anteil, Modellnutzung über Zeit, Start-Modell-Ranking
- **Reasoning** — Gesamt-Denkzeit der Modelle, Ø/längste Denkzeit, Denkzeit-Histogramm, Umfang der mitlesbaren Gedanken
- **Gespräche** — Top 10, Themen-Wortwolke, One-Shot-Chats, Custom-GPT- & Voice-Gespräche
- **Medien & Tools** — Bild-Uploads, Live-Voice-Split (deine Beiträge vs. KI-Audio-Antworten inkl. gesprochener Wörter), Datei-Anhänge nach Typ, Code-Blöcke, ChatGPT-Bibliothek (echte Dateitypen, Datenvolumen, KI-Artefakte vs. Uploads, Verlauf über Zeit) und Export-Gesamtgröße
- **Websuche** — zitierte Quellen, Top-Domains, Verweis-Typen
- **Text-Insights** — Top-Wörter deiner Prompts (Stoppwort-gefiltert DE/EN), Fragen-Quote, längste Nachrichten
- **Fun Facts** — Buchseiten-Äquivalent, Kino-Vergleich, längste Session, nächtlichste Nachricht, Emoji-Zähler u. v. m.

### 💬 Chat-Reader
Alle Gespräche als lesbarer Chatverlauf mit Markdown-Rendering (Tabellen, Listen, Code-Blöcke):
- Volltextsuche über alle Nachrichten mit **Treffer-Highlighting**
- **Filter nach Modell** + permanenter Gesprächszähler
- Sortierung (Neueste / Längste / A–Z)
- **„Gedanken"-Toggle**: Reasoning der KI inklusive Denkzeit-Markern einblenden
- Sprungmarken aus Top-10-Liste und Themen-Wolke direkt in den Reader

### 🎨 Design
- Apple-inspiriertes UI mit Glassmorphism, animierten Verläufen und Count-Up-Zahlen
- **Light & Dark Mode** mit Umschalter (Light ist Standard)
- Eigene, leichtgewichtige SVG-Chart-Bibliothek mit Tooltips und Animationen
- Responsive bis Mobile

### 🎲 Demo-Modus
Keine Export-Dateien zur Hand? Ein Klick auf **„Mit Demo-Daten ausprobieren"** generiert 120 realistische Beispiel-Gespräche (deterministisch) und zeigt das komplette Dashboard.

## Verwendung

1. **ChatGPT-Export anfordern:** ChatGPT → *Einstellungen → Datenkontrollen → Daten exportieren*. Du erhältst eine ZIP-Datei per E-Mail.
2. **ZIP entpacken** — darin liegen `conversations-000.json`, `conversations-001.json`, … (bei kleineren Exporten nur `conversations.json`).
3. **`index.html` öffnen** (Doppelklick genügt — kein Server nötig).
4. Die JSON-Dateien **in die Dropzone ziehen** und auf **Auswerten** klicken.

Optional können weitere Dateien aus dem Export mitgeladen werden — jede schaltet zusätzliche Karten frei, keine ist Pflicht:

- `conversation_asset_file_names.json` — Original-Dateinamen der Anhänge (Kategorien per Namens-Heuristik)
- `library_files.json` — Metadaten deiner ChatGPT-Bibliothek: echte MIME-Typen, Dateigrößen, Zeitstempel, KI-Artefakte
- `export_manifest.json` — Inhaltsverzeichnis des Export-ZIPs → Gesamtgröße & Medienvolumen des Exports
- `user.json` — Konto-Infos

## Projektstruktur

```
├── index.html          Struktur: Landing, Dashboard-Sektionen, Chat-Reader
├── css/
│   └── style.css       Design-Tokens (Dark/Light), Glass-Karten, Charts, Reader
└── js/
    ├── parser.js       Export einlesen, Unicode-Marker bereinigen, normalisieren
    ├── stats.js        Alle Kennzahlen (reine Berechnung, kein DOM)
    ├── charts.js       SVG-Charts: Area, Balken, Donut, Heatmap, Kalender, …
    ├── markdown.js     Minimaler Markdown-Renderer für den Chat-Reader
    ├── demo.js         Generator für Demo-Daten im Original-Exportschema
    └── app.js          Orchestrierung: Dropzone, Rendering, Reader, Theme
```

Kein Build-Schritt, keine Dependencies — einfach klonen und `index.html` öffnen.

## Entwicklung

```bash
node tests/regression.js
```

## Hinweise

- Die Auswertung basiert auf dem **finalen sichtbaren Gesprächspfad** (`current_node`) im Export. Verworfene oder regenerierte Antwort-Alternativen werden nicht mitgezählt.
- Diktat (Speech-to-Text im Textchat) speichert der Export als normalen Text — es ist nicht von getippten Nachrichten unterscheidbar. Der Live-Voice-Modus dagegen schon.
- Denkzeiten werden aus den „Nachgedacht für …"-Angaben geparst; Textangaben wie „ein paar Sekunden" werden konservativ geschätzt.
- Der Export enthält vereinzelt **fehlerhafte Zeitstempel** (z. B. KI-Antworten, die angeblich Wochen vor der zugehörigen Frage liegen). Solche Ausreißer werden beim Einlesen auf den Zeitpunkt der Vorgänger-Nachricht korrigiert — der Datei-Chip beim Laden zeigt an, wie viele Zeitstempel repariert wurden.
- Die Umweltbilanz ist eine Schätzung. Energie, Wasser und CO₂ werden aus sichtbaren Prompt-/Antwort-Tokens, Kontextaufschlag und Modelltyp abgeleitet; echte Messwerte enthält der Export nicht.

### Quellen für Umweltfaktoren

- ChatGPT-Ø-Query: [Sam Altman, 2025](https://blog.samaltman.com/the-gentle-singularity) — ca. 0,34 Wh und 0,000085 gal Wasser pro durchschnittlicher Query.
- Strommix global: [IEA Electricity 2025](https://www.iea.org/reports/electricity-2025/emissions) — ca. 445 g CO₂/kWh für 2024.
- Strommix Deutschland: [Umweltbundesamt, 2025](https://www.umweltbundesamt.de/themen/co2-emissionen-pro-kilowattstunde-strom-2025-nur) — 344 g CO₂/kWh.
- Wasser-Spanne: [OECD.AI](https://oecd.ai/en/wonk/how-much-water-does-ai-consume) / [„Making AI Less Thirsty"](https://arxiv.org/abs/2304.03271) — standortabhängige KI-Wassernutzung von etwa 1,8–12 L/kWh; die sehr niedrige Vergleichsgrenze leitet sich aus Altmans Ø-Query-Wasserangabe ab.
- Alltag/Wasser: [EPA WaterSense Showerheads](https://www.epa.gov/watersense/showerheads) und [Residential Toilets](https://www.epa.gov/watersense/residential-toilets) — Standarddusche 2,5 gal/min; WaterSense-Toiletten 1,28 gal/Spülung.
- Lebensmittelwasser: [Water Footprint Network](https://www.waterfootprint.org/resources/interactive-tools/product-gallery/) / [University of Twente](https://research.utwente.nl/en/publications/the-green-blue-and-grey-water-footprint-of-animals-and-animal-pro/) — u. a. Rindfleisch 15.400 m³/t.
- Bildgenerierung: [Luccioni, Jernite & Strubell, „Power Hungry Processing" (FAccT '24)](https://arxiv.org/abs/2311.16863) — ~2,9 Wh je generiertem Bild (Stable Diffusion XL, 1.000 Inferenzen ≈ 2,907 kWh).
- Gemini-Vergleich: [Google, „Measuring the environmental impact of delivering AI at Google Scale" (2025)](https://arxiv.org/abs/2508.15734) — Median-Gemini-Prompt ≈ 0,24 Wh, 0,26 ml Wasser, 0,03 g CO₂e.
- Lebenszyklus-CO₂: [Mistral AI, Ökobilanz mit ADEME/Carbone 4 (2025)](https://mistral.ai/news/our-contribution-to-a-global-environmental-standard-for-ai/) — 1,14 g CO₂e je 400-Token-Antwort inkl. Training & Hardware (~2,85 g je 1.000 Antwort-Tokens).
- Baum-Vergleich: [FNR-Themenportal Wald (Kohlenstoffinventur)](https://wald.fnr.de/wissen/themendossiers/kohlenstoffspeicher/faq-kohlenstoffspeicher-wald-und-holz-in-zahlen) — eine Buche bindet grob 12,5 kg CO₂ pro Jahr.

## Lizenz

MIT
