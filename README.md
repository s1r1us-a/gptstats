# ChatInsights – ChatGPT Export Analyzer

Ein **lokaler** Analyzer für deinen ChatGPT-Datenexport. Lade deine Export-Dateien hoch und
erhalte ein interaktives Dashboard mit Dutzenden Statistiken, einer Aktivitäts-Heatmap und einem
durchsuchbaren Chat-Reader.

> 🔒 **100 % lokal.** Die ganze Auswertung läuft in deinem Browser. Es werden keine Daten an einen
> Server gesendet – es gibt gar kein Backend. Es ist eine statische Seite (HTML/CSS/JS), die du
> einfach per Doppelklick auf `index.html` öffnest – kein Build, keine Installation.

---

## Schnellstart

1. **Export anfordern** (in ChatGPT): *Einstellungen → Datenkontrolle → Daten exportieren*.
   Du bekommst per E-Mail eine ZIP-Datei.
2. ZIP entpacken. Du brauchst daraus die Dateien `conversations*.json`
   (bei großen Accounts mehrere, z. B. `conversations000.json`, `conversations001.json` …).
3. `index.html` im Browser öffnen (Doppelklick genügt) und die JSON-Dateien hineinziehen.
4. Auf **✨ Auswerten** klicken.

Kein Build, keine Installation, keine Abhängigkeiten zum Selbst-Installieren.

### Nur mal reinschauen? (Demo-Modus)

Du willst die App ausprobieren, ohne deinen eigenen Export hochzuladen? Klick auf der Startseite auf
**„✨ Beispieldaten ansehen“** – ChatInsights lädt dann einen realistisch generierten Demo-Datensatz
(zufällig erzeugt, kein echter Account) und zeigt dir das komplette Dashboard inklusive Chat-Reader.

### Welche Dateien?

| Datei | Nötig? | Wofür |
|-------|--------|-------|
| `conversations*.json` | **ja** | Quelle für **alle** Kernstatistiken (Nachrichten, Wörter, Heatmap, Modelle, Voice …) |
| `conversation_asset_file_names.json` | optional | nur für die Karte **„Geteilte Dateien"** und für **echte Dateinamen** im Chat-Reader |

> Die Assets-Datei ändert **keine** der Hauptzahlen – wenn du sie weglässt, fehlt lediglich die
> Datei-Statistik. Du brauchst sie also nur, wenn dich genau das interessiert.

---

## Was wird ausgewertet?

**Überblick (Stat-Karten)**
- Konversationen, Nachrichten gesamt (du / KI), geschriebene Wörter
- Aktive Tage + längste Serie, **längste Pause** (mit Von–Bis-Datum)
- Ø Nachrichten pro Chat, **KI-Antwortzeit** (Median & Ø), Ø/längste Antwortlänge, Ø deine Nachricht
- Ø Wörter pro aktivem Tag, **aktivste Stunde**, **aktivster Wochentag**, genutzte Modelle
- **Live-Voice** vs. **Sprachnachrichten** (siehe unten), Thinking-Blöcke
- **Web-Suchen** (+ Antworten mit Quellen), **Antworten mit Code**, **hochgeladene Bilder**
- Chats mit Anhang, geteilte Dateien, Spitzentag

**Diagramme & mehr**
- Aktivitäts-Heatmap (pro Tag, mit Monats- und Wochentags-Beschriftung)
- Verlauf pro Tag, Tageszeit, Wochentage, Modell-Nutzung, Chat-Längen, Nachrichten-Typen
- Bestenlisten (längste Konversationen / meiste Wörter), Wortwolke
- Optional: Datei-Typen-Aufschlüsselung (mit Assets-Datei)

**Chat-Reader**
- Alle Konversationen durchsuchen, nach Datum / Länge / Titel sortieren, Markdown-Rendering,
  optional Thinking-Blöcke einblenden.

---

## Live-Voice vs. Sprachnachrichten

Im Export gibt es **zwei** unterschiedliche Sprach-Typen, die ChatInsights getrennt ausweist:

- **Live-Voice (Advanced Voice Mode)** – das durchgehende Echtzeit-Gespräch (der animierte Kreis).
  Im Export als `real_time_user_audio_video_asset_pointer` erkennbar.
- **Sprachnachricht (Standard)** – du sprichst *eine* Nachricht ein, sie wird transkribiert, die
  KI antwortet rundenbasiert. Im Export als `audio_asset_pointer` + `audio_transcription`.

Wenn du fast nur das Live-Gespräch nutzt, ist die Zahl bei „Sprachnachrichten" entsprechend klein.
Mit dem Umschalter **„Ohne Voice"** blendest du alle Voice-Chats aus und siehst die reine
Text-Bilanz.

---

## Hinweis zu generierten Bildern

ChatInsights zählt **hochgeladene** Bilder (von dir gesendet). **KI-generierte** Bilder lassen
sich leider **nicht** anzeigen: ChatGPT legt die generierten Bild-Ergebnisse im Datenexport nicht
als auswertbare Daten ab. Im Conversation-JSON tauchen nur deine Uploads als Bild-Verweise auf.

---

## Technik

- Statische Seite aus wenigen Dateien, reines Vanilla JavaScript – kein Framework, kein Build:
  - `index.html` – Markup der drei Ansichten (Upload, Dashboard, Chat-Reader)
  - `styles.css` – das (helle, von Apple inspirierte) Design-System
  - `app.js` – Parsing, Statistik, Diagramme, Reader und die Scroll-/Motion-Effekte
  - `demo.js` – Generator für die Beispieldaten des Demo-Modus
- Geöffnet wird weiterhin einfach `index.html` (Doppelklick); die Skripte werden lokal als
  klassische `<script>` geladen, daher funktioniert die Seite auch offline.
- Per CDN eingebunden: [Chart.js](https://www.chartjs.org/) (Diagramme),
  [marked](https://marked.js.org/) (Markdown), [DOMPurify](https://github.com/cure53/DOMPurify)
  (Sanitizing der gerenderten Inhalte).
- Bewegung & Effekte: sanfte Scroll-Einblendungen (IntersectionObserver), eine „gepinnte“
  Parallax-Hero und hochzählende Kennzahlen – alles respektiert `prefers-reduced-motion`.
- Die Auswertung folgt dem sichtbaren Gesprächsverlauf (vom aktuellen Knoten zurück zur Wurzel),
  damit Regenerierungs-Varianten nicht doppelt zählen.

---

## Datenschutz

Deine Exportdateien verlassen deinen Browser nicht. Es findet kein Upload statt. Du kannst die
Seite auch offline öffnen.
