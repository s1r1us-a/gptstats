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
- **Medien & Tools** — Bild-Uploads, Live-Voice-Split (deine Beiträge vs. KI-Audio-Antworten inkl. gesprochener Wörter), Datei-Anhänge nach Typ, Code-Blöcke
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

Optional kann zusätzlich die `conversation_asset_file_names.json` mitgeladen werden.

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

## Hinweise

- Die Auswertung basiert auf **allen Nachrichten im Export** (inkl. Voice-Transkripten und Medien-Nachrichten). Andere Analyzer zählen teils nur den finalen Gesprächspfad oder verwerfen textlose Nachrichten — die Zahlen können daher abweichen.
- Diktat (Speech-to-Text im Textchat) speichert der Export als normalen Text — es ist nicht von getippten Nachrichten unterscheidbar. Der Live-Voice-Modus dagegen schon.
- Denkzeiten werden aus den „Nachgedacht für …"-Angaben geparst; Textangaben wie „ein paar Sekunden" werden konservativ geschätzt.

## Lizenz

MIT
