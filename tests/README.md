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

## `npm test` = i gjithë suite (35 hapa)

Që nga 2026-09-23 `npm test` i ekzekuton **të gjitha** provat, përfshirë ato cloud
(multi-company, realtime, izolimi, blind, doc-number-sync, server-backups) dhe
eksportet/gjurmueshmërinë. Zinxhiri i vjetër (18 hapa, pa cloud) mbetet si
`npm run test:core`.

`BIOBES_BROWSER_EXECUTABLE` tani respektohet nga **çdo** skedar prove (më parë
`multi-company`, `cloud-realtime`, `cloud-isolation`, `blind-write` dhe
`doc-number-sync` e shpërfillnin dhe dështonin me "Executable doesn't exist").

**Mos i ekzekuto provat njëkohësisht** — Chromium me `--single-process` në të njëjtën
makinë ngadalëson renderimin dhe pritjet kohore bëhen të paqëndrueshme.

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
| `test:opening` | 16 prova × desktop/telefon për **gjendjet fillestare** (`biobes-opening-balances-v1`): data e hapjes (go-live) te Kontabiliteti → Gjendjet fillestare; fusha "Gjendja fillestare" (shuma, kuptimi, monedha, kursi) te furnitori i ri / ndrysho nga kartela / ndrysho nga lista dhe te klienti i ri / ndrysho; importi Excel me kolonat opsionale `Gjendja fillestare`, `Monedha e gjendjes`, `Kursi i gjendjes` (ALL, EUR me kurs, EUR pa kurs → kursi i datës së hapjes, negativ = parapagim, bosh = 0) dhe template-i i vjetër pa këto kolona; kartela/ditari/XLSX i furnitorit dhe kartela/lista/ditari i klientit me rreshtin "Gjendje fillestare"; veprimi J-GEN "Bilanci i hapjes" (401/411/512/530 + rreshta të lirë + balancim te 101) — idempotent, Rigjenero, Posto, bilanci verifikues "Fillestare"; raportet Alpha (kod i paprekur) lexojnë gjendjet; ROLE-USER pa "Paraja dhe kontabiliteti" refuzohet me toast, por ruan gjendjen te furnitori me `suppliers:edit`. |
| `test:warehouse-docs` | 16 prova × desktop/telefon për **dokumentet e magazinës** (`biobes-stock-docs-v1`): Magazina → "+ Fletë hyrje" / "+ Fletë dalje" (formular me rreshta produkt/lot/furnitor/kg/thasë/kosto, SHUMA live, Ruaj draft, Ruaj & konfirmo); loti i ri me kod automatik `B1<furnitor>-<produkt>-<vv>` ose kodi i shkruar, etiketa e magazinës nga kartela e lotit; libri unik i lëvizjeve (`SDOC:` / `REV:`), `unifiedStockBalanceRows`; kontrolli i sasisë në dalje (asnjë lot negativ); veprimet kontabël Draft J-GEN (311/401 blerje pa peshim, 685/311 dëmtim, 618/311 mostër me WAC); anulimi me arsye (kundërlëvizje, rikthim i lotit, heqja e VK Draft) dhe bllokimi kur loti është konsumuar; regjistri me filtra/kërkim live/Excel; printimi A4 portret si blloku "FLETË - HYRJE" (18 rreshta, të pashkruarit vizohen me "—", SHUMA, SHITËSI / BLERËSI); gjendja fillestare e magazinës (formular me datën e hapjes të fiksuar + import Excel për lot me titujt shqip, kolona opsionale, presje dhjetore, gabimet ndalojnë gjithçka) → rreshti 311 automatik i "Bilanci i hapjes" me paralajmërim për rresht manual; raportet Alpha (kod i paprekur) me "Fletë Hyrje / Fletë Dalje / Gjendje Fillestare / Anulim …", hapja e rreshtit → kartela e fletës, regjistri përmbledhës (tjera hyrje/dalje), Vyapar 360°; ROLE-USER me view+create+edit por pa Konfirmo/Anulo. |
| `test:table-sort` | 46 prova × desktop/telefon për **renditjen ↑/↓ të tabelave** (`biobes-table-sort-v1`): mbulimi i të 25 moduleve (çdo tabelë liste me ≥2 rreshta bëhet e renditshme dhe cikli 3-gjendësh rritës → zbritës → rendi origjinal provohet me klikim të vërtetë); semantika e vlerave (numra shqip `1 234,5 kg` / `(100)`, data ISO dhe `23.9.2026`, tekst me numra natyrorë `2 < 10`, rendi i alfabetit shqip me ç/ë dhe digrafët dh/gj/ll/nj/rr/sh/th/xh/zh, qelizat bosh gjithmonë në fund, rreshtat TOTALI të ngulitur poshtë, kolona `Nr.` që rinumërohet dhe kthehet saktë); mbijetesa pas `render()`, pas ndërrimit të modulit dhe gjatë kërkimit live; tastiera (Enter/Space) dhe `aria-sort`; modal-et; përjashtimet (kartela/dokumentet për print, raportet Alpha me gjendje progresive, formularët me input-e, kokat e bashkuara colspan/rowspan, tabelat me renditje të brendshme `.sdr-table`) dhe lejimi i regjistrave Excel (`excel-registry`, `sales-excel`, `data-sortable`); 0 gabime konzole dhe 0 gabime të brendshme. |
| `test:activity-actor` | 24 prova × desktop/telefon për **autorin e veprimeve në Aktivitet** (`biobes-activity-actor-v1`): çdo ngjarje e re vuloset me `user`/`userName`/`userRole`/`at` të sesionit (hook mbi `state.events.push`, pa ndryshuar ~130 vende ekzistuese); kolona «Përdoruesi» tregon emrin real + rolin dhe askund nuk shkruhet më "Admin"; ngjarjet e vjetra lexohen nga dokumenti i referencës (`createdBy`/`createdByName` → emër, `ROLE-ADMIN` → "Administrator"), ato pa gjurmë shfaqen "—" (edhe kur dokumenti ka vetëm `salesperson:'Admin'`); dokumenti pa autor plotësohet nga ngjarja; dropdown «Përdoruesi» (i mbështjellë nga kërkimi live i sistemit) me opsionet *të gjithë / veprimet e mia / pa autor / secili emër* dhe numëruesi i rezultateve; kërkimi live gjen emrin dhe rolin; eksporti XLSX mban emrat realë pa rresht të dytë; përshëndetja e panelit, «Kush e priti mallin?» dhe «Shitësi» i raporteve ndjekin sesionin; hyrje si përdorues tjetër (ROLE-ADMIN dhe ROLE-USER) → veprimet regjistrohen me autorin e tyre; pas `reload()` hook-u rikthehet dhe autorët mbeten; 0 gabime konzole dhe 0 gabime të brendshme. |
- Viewport-et: 1440×1000 dhe 390×844 me touch/mobile.
- **Asnjë kërkesë nuk shkon në API-n e prodhimit.** Kërkesat HTTPS interceptohen në
  profilin e përkohshëm të Chromium. Konfigurimi backend zbrazet për provat.
- Llogaria `audit` krijohet vetëm në profilin e testit; nuk është llogari e aplikacionit.
- OCR **nuk simulohet**: URL-të CDN (jsdelivr, unpkg, cdnjs) marrin byte-t origjinale
  të paketave npm Tesseract, worker/WASM, traineddata dhe PDF.js. CSP-ja e faqes mbetet aktive.
  Kjo provon motorët dhe integrimin, jo disponueshmërinë e CDN-ve në internet.
- Motori OCR (`biobes-ocr-v2`) provon me radhë jsdelivr → unpkg → cdnjs dhe mban një
  worker të përhershëm; menuja e llogarisë ka **🔎 Testo OCR** për të provuar pajisjen
  reale të përdoruesit (shfaq serverin e motorit, lexuesin PDF dhe arsyen e dështimit).
- Rezultatet JSON, PDF-të dhe fotografitë ruhen në `.audit/` (jashtë Git).
- Boot-Guard përdor fillimisht kandidatin si përgjigje për URL-në known-good,
  pa ndryshuar skedarin e rikuperimit. **Pas rifreskimit** të snapshot-it, ekzekuto:
  `BIOBES_USE_REAL_KNOWN_GOOD=1 npm run test:recovery` për objektivin real nga disku.
- Nuk provohen API-ja reale, login/sync me serverin, printeri fizik, browser-i
  Samsung në një telefon fizik ose çdo kombinim i mundshëm i të dhënave.

Opsionalisht: `BIOBES_BROWSER_EXECUTABLE=/rruga/chromium` për browser-in lokal;
`BIOBES_OCR_ASSETS=/rruga/node_modules` për paketat e OCR/PDF.

## Auditimet cloud (100% cloud, multi-company)

Këto prova punojnë me **server të rremë** të interceptuar në Chromium (`biobes-api.onrender.com`
nuk preket kurrë) dhe me stub për `EventSource` (protokolli SSE provohet kundër serverit real
në repo-n `biobes-api`).

| Script | Çfarë provon |
|---|---|
| `test:multi-company` | 20 hapa: regjimi i fjetur me 1 kompani; me 2 kompani — ndërruesi, numërim i pavarur (`FSH-C1-1`/`FSH-C2-1`), ruajtje veçmas (`state:C1`, `state:C2`), modul «Kompanitë», anëtarësi, çaktivizim, pranim wipe-i per kompani. |
| `test:cloud-realtime` | 56 prova: SSE midis dy pajisjeve (~2 s, pa rifreskim), ruajtje për dokument (`/api/state/patch`), pa shkrime blind, konflikt i zgjidhur vetë (serveri fiton), përdoruesi normal pa dialogë, të drejtat per kompani. |
| `test:cloud-isolation` | 22 prova për **kërkesat fikse**: `company_id` në çdo kërkesë (`?company=` + header `X-Company-Id`) dhe në SSE (rilidhje me kompaninë e re); izolim C1 ≠ C2 (event-e, `biobesDirty:<ID>`, baza e bashkimit, op-et e patch-it); puna e paruajtur nuk humbet në ndërrim kompanie (bashkim 3-way + ridërgesë); asnjë të dhënë biznesi në `localStorage` (cache në IndexedDB, migrim i çelësave të vjetër); serveri para cache-it; **pastrim i plotë browseri → gjithçka rikthehet nga serveri**; shkrime konkurrente të së njëjtës pajisje renditen pa dyfishim. |
| `test:blind` | Shkrimet blind ndalohen kur serveri ka gjendje; versioni mësohet para shkrimit; asnjë zëvendësim me gjendje më të varfër. |
| `test:doc-number-sync` | Numrat e dokumenteve në kohë reale: 409 `conflict:'number'` → rinumerim automatik + riftim, pa dyfishim. |
| `test:server-backups` | Karta ADMIN «Backup-et në server»: lista, krijimi, shkarkimi, rikthimi, fshirja; `performDailyBackup` → `POST /api/backups`. |

```bash
BIOBES_BROWSER_EXECUTABLE=/tmp/chromium LD_LIBRARY_PATH=$PWD/.audit/libs/lib \
  npm run test:cloud-isolation
```

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
