# Audit lokal në Chromium

Aplikacioni mbetet një skedar statik; paketat Node përdoren **vetëm për teste**.

```bash
npm ci
npx playwright install --with-deps chromium
# Motorët realë të OCR/PDF për provat; nuk shtohen në Git/aplikacion:
npm install --prefix .audit --no-save tesseract.js@5.1.1 pdfjs-dist@3.11.174 @tesseract.js-data/eng@1.0.0
python3 -m http.server 8000 --bind 0.0.0.0
# Në një terminal tjetër:
npm test
```

## Çfarë ekzekutohet

| Script | Kontrollet |
|---|---|
| `test:syntax` | Nxjerr çdo inline script dhe ekzekuton `node --check`. |
| `test:browser` | 16 grupe × desktop/telefon: navigimi, peshime, FB, mandate, furnitorë, inventar, lidhjet, raporte, backup/import, E2E/financa. |
| `test:warehouse` | 12 prova × desktop/telefon për defektin e Magazina Gur: magazinë pa rafte → peshim 8 thasë/216 kg → konfirmim → rafti `R1 — Rafti kryesor` me lotin; rakordimi i loteve pa raft, idempotenca, reload, konfirmimi i përsëritur, magazina e pavlefshme dhe mesazhet shpjeguese. Çdo provë ka guard që dështon nëse preket dokumenti real `PS-2026-002`. |
| `test:operations` | 7 grupe × desktop/telefon: krijim/modifikim produkti me foto, magazinë/raft/etiketë, mostër, porosi, proces, paketim dhe ngarkesë. |
| `test:recovery` | Backup automatik, Pastro, Erase dhe Boot-Guard pas dy nisjeve të dështuara. |
| `test:qr` | 10 prova × desktop/telefon për nyjën QR/deep-link: gjuha e përbashkët `?lot=`, `#/peshim/`, `#/lot/` dhe forma e vjetër `/trace/lot/KOD`; round-trip i payload-it të etiketës; dështim i butë kur regjistrimi mungon; hapja e kartelës pa prekur `state`; **Pastro** (heq search+hash, mbyll modalen, kthen filtrimin e raftit); `hashchange` pa rifreskim; dhe guard që `PS-2026-002` të mos shfaqet kurrë në profilin e testit. |
| `test:ocr` | 6 grupe × desktop/telefon: PNG real, PDF me tekst, PDF i skanuar, set eksporti/arkiv/shkarkim, PDF i dëmtuar, kartelë A4. |

- Viewport-et: 1440×1000 dhe 390×844 me touch/mobile.
- **Asnjë kërkesë nuk shkon në API-n e prodhimit.** Kërkesat HTTPS interceptohen në
  profilin e përkohshëm të Chromium. Konfigurimi backend zbrazet për provat.
- Llogaria `audit` krijohet vetëm në profilin e testit; nuk është llogari e aplikacionit.
- OCR **nuk simulohet**: URL-të CDN marrin byte-t origjinale të paketave npm
  Tesseract, worker/WASM, traineddata dhe PDF.js. CSP-ja e faqes mbetet aktive.
  Kjo provon motorët dhe integrimin, jo disponueshmërinë e CDN-ve në internet.
- Rezultatet JSON, PDF-të dhe fotografitë ruhen në `.audit/` (jashtë Git).
- Boot-Guard përdor fillimisht kandidatin si përgjigje për URL-në known-good,
  pa ndryshuar skedarin e rikuperimit. **Pas rifreskimit** të snapshot-it, ekzekuto:
  `BIOBES_USE_REAL_KNOWN_GOOD=1 npm run test:recovery` për objektivin real nga disku.
- Nuk provohen API-ja reale, login/sync me serverin, printeri fizik, browser-i
  Samsung në një telefon fizik ose çdo kombinim i mundshëm i të dhënave.

Opsionalisht: `BIOBES_BROWSER_EXECUTABLE=/rruga/chromium` për browser-in lokal;
`BIOBES_OCR_ASSETS=/rruga/node_modules` për paketat e OCR/PDF.

## Workaround i browser-it në Arena

Shkarkimi standard nga CDN i Playwright dështoi në këtë sandbox. U përdor
`@sparticuz/chromium` në direktorinë e injoruar `.audit`, me bibliotekat NSS/NSPR
nga `bin/al2023.tar.br` të asaj pakete. Të gjitha paketat instalohen së bashku
që një `npm install --no-save` të mos heqë paketat e tjera të testimit:

```bash
npm install --prefix .audit --no-save @sparticuz/chromium tesseract.js@5.1.1 pdfjs-dist@3.11.174 @tesseract.js-data/eng@1.0.0
# Pas nxjerrjes së browser-it dhe bibliotekave:
BIOBES_BROWSER_EXECUTABLE=/tmp/chromium \
LD_LIBRARY_PATH=$PWD/.audit/libs/lib npm test
```


> **Hapi shtesë që mungonte:** binarët `libEGL.so`, `libGLESv2.so`, `libvk_swiftshader.so`,
> `libvulkan.so.1` dhe `vk_swiftshader_icd.json` (të nxjerrë nga `bin/swiftshader.tar.br`) duhet
> të vendosen **në të njëjtën direktorë me binarin** (p.sh. `/tmp/` kur binari është `/tmp/chromium`),
> jo vetëm në `.audit/libs`. Ndryshe Chromium del me `Internal Vulkan error (-3)` /
> `eglInitialize SwANGLE failed` dhe `npm test` raporton `0/0 passed`:
> ```bash
> cp .audit/libs/libEGL.so .audit/libs/libGLESv2.so .audit/libs/libvk_swiftshader.so \
>    .audit/libs/libvulkan.so.1 .audit/libs/vk_swiftshader_icd.json "$(dirname "$BIOBES_BROWSER_EXECUTABLE")/"
> ```
Binarët, bibliotekat dhe fixture-t e gjeneruara nuk janë pjesë e Git-it.
