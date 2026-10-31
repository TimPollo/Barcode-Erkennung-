# CodeSnap – Codes aus Fotos kopieren

Eine kostenlose, eigenständige Web-App für GitHub Pages. Sie erkennt **4- bis 8-stellige Bestätigungscodes**, insbesondere Instagram-, Login- und Verifizierungscodes aus **kopierten Screenshots oder Fotos**.

## Verwendung

1. Das Foto bzw. den Screenshot **kopieren** (nicht auswählen/hochladen).
2. In CodeSnap auf **Foto einsetzen** drücken.
3. Falls der Browser das Bild nicht direkt aus der Zwischenablage lesen kann: Auf dem **iPhone im eingeblendeten Feld lange drücken → Einsetzen**; auf **PC/Mac Strg+V bzw. ⌘V**.
4. Der Code steht **ganz oben**. Prüfe ihn kurz, dann **Kopieren** drücken.
5. Die App setzt sich **automatisch zurück**, damit du direkt das nächste Foto einsetzen kannst.

Die App zeigt das Foto nicht an, speichert keine Bilder und sucht gezielt nach einem Code statt nach beliebigen Nummern wie Uhrzeit, Datum oder Postleitzahl. Die Erkennung kann bei schlechten Fotos einzelne Ziffern verwechseln.

## Auf GitHub Pages installieren

1. Ein neues öffentliches Repository z. B. `codesnap` unter https://github.com/new anlegen.
2. **Alle Dateien** aus dieser ZIP entpackt in das Repository hochladen und committen.
3. **Settings → Pages → Build and deployment → Deploy from a branch** wählen. `main` und `/(root)` auswählen, dann speichern.
4. Website unter `https://DEIN-BENUTZERNAME.github.io/codesnap/` öffnen.

**Wichtig:** Browser verlangen gegebenenfalls eine Freigabe der Zwischenablage. Bei Safari/iPhone kann ein manuelles **Einsetzen** erforderlich sein; Webseiten dürfen die iOS-Zwischenablage nicht immer per Klick auslesen.

## Technik

- HTML/CSS/JavaScript, keine Backend- oder Account-Pflicht
- OCR mit Tesseract.js 5, per CDN geladen; Internet benötigt beim Erstladen
- OCR auf dem eigenen Gerät; Bilder werden nicht an einen eigenen Server gesendet
- Keine Foto- oder Mediathek-Auswahl, keine Bildvorschau
- Statisch gespeicherte PWA-Icons mit orangefarbenem Zahlencode-/Scan-Motiv
