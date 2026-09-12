# BioBes ERP — Sistemi i mbrojtjes (Boot-Guard) & Rikuperimi

## Çfarë bën Boot-Guard

`index.html` përmban një skript të quajtur **Boot-Guard** (`<script id="boot-guard-v1">`)
që punon në shfletues dhe mbron aplikacionin nga versionet e prishura:

1. Numëron **crash-et** — gabime JavaScript të pakapura (`window.onerror`) dhe
   premtime të refuzuara (`unhandledrejection`) gjatë ngarkimit të faqes.
2. Çdo ngarkim i shëndetshëm (faqja hapet pa gabim fatal + aplikacioni nis
   me sukses) e **rivendos numëruesin në 0**.
3. Nëse ndodhin **2 crash-e të njëpasnjëshme** brenda një dritareje prej
   15 minutash, Boot-Guard e kalon automatikisht përdoruesin te
   **`index.known-good.html`** — versioni i fundit i njohur si i mirë.

Gjendja ruhet në `localStorage` me çelësin **`biobesBootGuard`**:

```json
{
  "crashes": 0,
  "lastCrashAt": 0,
  "lastError": "",
  "rolledBackAt": 0,
  "rolledBackReason": "",
  "lastOkAt": 0
}
```

API në konsolë (F12):

```js
window.__bootGuard.status()   // gjendja aktuale e numëruesit
window.__bootGuard.reset()    // rivendos numëruesin me dorë
window.__bootGuard.ok()       // sinjal "boot i shëndetshëm"
window.__bootGuard.knownGood  // 'index.known-good.html'
```

## Rollback automatik (si funksionon)

- Crash #1 → numëruesi bëhet 1, asgjë tjetër nuk ndodh.
- Crash #2 (pa një ngarkim të shëndetshëm midis tyre) → ridrejtim automatik te
  `index.known-good.html`, dhe një shënim `rolledBackAt` që **parandalon
  ridrejtime të përsëritura** (nuk krijohet loop).
- Pasi faqja e sigurt ngarkohet pa gabim, numëruesi rivendoset.

## Rikuperim manual (nëse automatiku nuk mjafton)

Renditja nga më e thjeshta te më e fuqishmja:

1. **Hap direkt versionin e sigurt** në shfletues:
   `https://<sajti>/index.known-good.html`
2. **Pastro numëruesin** nëse ka mbetur i bllokuar: hap faqen, F12 → Console,
   ekzekuto `window.__bootGuard.reset()` dhe rifresko.
3. **Rikthe nga një snapshot** — zëvendëso `index.html` me një kopje nga
   `snapshots/` dhe bëj redeploy:

   ```bash
   cp snapshots/index.2026-09-12-bootguard-baseline.html index.html
   git add index.html && git commit -m "rollback: rikthe snapshot-in e qëndrueshëm" && git push
   ```

   Render-i rindërton automatikisht pas push në `main`.

4. **Rifresko `index.known-good.html`** pas çdo versioni të qëndrueshëm (shih
   `snapshots/README.md`), që rollback-u të shkojë gjithmonë te versioni i fundit i mirë.

## Shënime për vendosjen (Render)

- `render.yaml` publikon **edhe** `index.known-good.html` dhe `snapshots/`
  (buildCommand i përditësuar). **Mos i fshini** këta file-a — pa to rollback-u
  automatik nuk ka destinacion.
- Rregulli i routes (`/* → /index.html`) vepron vetëm si *fallback*: Render-i
  shërben gjithmonë fillimisht file-ët që ekzistojnë, kështu
  `/index.known-good.html` hapet siç duhet.
- Të dhënat e biznesit mbeten në IndexedDB të çdo pajisjeje; rollback-u prek
  vetëm **kodin**, jo të dhënat.
