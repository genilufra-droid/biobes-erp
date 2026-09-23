# PR: arena/01a0ce33-biobes-erp → main — Renditje ↑/↓ (ascend/descend) në çdo tabelë të sistemit

## Përmbledhje
Çdo tabelë liste në çdo modul tani renditet me klikim në kokën e kolonës:
**1 klikim = rritës (↑) · 2 klikime = zbritës (↓) · 3 klikime = kthehet rendi origjinal**.
Implementuar si një bllok i ri i vetëm `biobes-table-sort-v1` në fund të `index.html`
(534 rreshta të shtuar, **0 rreshta të ekzistuesve të ndryshuar**) — i njëjti model si patch-et e tjera të repo-s.

Verifikuar në Chromium: **92/92 prova OK** (46 hapa × desktop 1440×1000 dhe telefon 390×844),
**24 tabela të vërteta modulesh** të provuara me klikim për çdo viewport, 0 gabime konzole.

## Mbulimi (të 25 modulet)
Matrica e auditimit — çdo tabelë me ≥2 rreshta u bë e renditshme:

| Moduli | Tabela me ≥2 rreshta | Të renditshme |
|---|---|---|
| Blerje & Peshime, Fatura Blerje, Furnitorët, Pagesat, Shpenzimet, Produktet, Magazina (fletë hyrje/dalje), Lotet, Mostrat, Klientët, Porositë, Përpunimi (2), Paketimi, Shitjet, Ngarkesat, Dosjet e Eksportit (regjistri Excel), Arkëtimet, Banka, Kontabiliteti, Regjistrat (3) | 24 | **24** |
| Raportet, Gjurmueshmëria, Fotot, Konfigurime, Paneli | pa tabela liste | — |

## Çfarë bën
1. **Koka të klikueshme kudo** — shenja `⇅` në çdo kolonë, `▲` rritës / `▼` zbritës,
   `cursor:pointer`, `tabindex="0"` (Enter/Space), `aria-sort="ascending|descending|none"` dhe tooltip shqip.
2. **Lexim i saktë i vlerave** (jo renditje tekstuale e numrave):
   - numra me formatin shqiptar: `1 234,5 kg`, `20,250.00`, `12,5 %`, negativ me kllapa `(100)` → `-100`;
   - data: ISO `2026-09-23` dhe shqipe `23.9.2026, 14:05` (edhe kur kalojnë vitin);
   - tekst: kollacion shqip — `ç`/`ë` si shkronja të veçanta dhe digrafët `dh gj ll nj rr sh th xh zh`
     (`Ciani < Çaj mali`, `Dafinë < Dëllinjë < Dhjetë`, `Lule < Llak`), me numra natyrorë (`2 < 10`).
     Nëse browser-i nuk e ka kollacionin shqip (ICU e shkurtuar), përdoret rendi i alfabetit shqip i modulit.
   - qelizat e rrjetave Excel lexohen nga `value` e input-it/select-it, jo nga teksti i qelizës.
3. **Rregulla që nuk prishin dokumentet**: qelizat bosh zbresin gjithmonë në fund (në të dyja drejtimet),
   rreshtat `TOTALI`/`alpha-total-row` qëndrojnë të ngulitur poshtë, kolona `Nr.` rinumërohet `1..N`
   sipas rendit të ri dhe kthehet saktë në rendin origjinal (nuk rinumërohet kur renditet vetë kolona `Nr.`).
4. **Renditja mbijeton** pas `render()`, pas ndërrimit modul→modul dhe gjatë kërkimit live/filtrave
   (ruhet sipas nënshkrimit të tabelës: faqe/modal + kokat, dhe ripërtërihet automatikisht).
5. **API për module të tjera dhe diagnostikë**:
   `window.sortTableColumn('#main table','Data','desc')`,
   `window.__biobesTableSortV1.{sort,sortColumn,toggle,restore,resetAll,refresh,state,report}`,
   `window.tableSortReport()` dhe eventi `bb:sorted` mbi tabelë.

## Çfarë NUK preket (me qëllim)
- **Dokumentet për print / kartelat**: kartela e furnitorit dhe klientit (`#printLedger`), peshat (`#printWeight`),
  mandatet, faturat, kartela e porosisë/ngarkesës — kanë kolona progresive (Gjendja, Progresivi) që do të
  dilnin të gabuara po të ri-renditeshin.
- **Raportet Alpha** (`.alpha-paper`, `.alpha-card-table`) — njëjtë: gjendje progresive + rreshta totali.
- **Formularët me input-e** (rreshtat e peshimit `#weighRows`, rreshtat e fletës `#sdLines`, porosi e re,
  kthimet, paketimi) — renditja do të prishte futjen e të dhënave.
- **Tabelat me renditjen e tyre** (`.sdr-table` — regjistri i magazinës, `th[onclick]`) — nuk dyfishohen shigjetat;
  prova `test:stock-doc-ux` (28/28) konfirmon që renditja e brendshme vazhdon të punojë.
- **Kokat e bashkuara** (`colspan`/`rowspan`, p.sh. regjistrat e faturave me dy nivele) — hartëzimi i kolonave
  do të ishte i pasigurt.
- Anashkalimi/lejimi është i kontrollueshëm: `data-no-sort` në tabelë e ndalon, `data-sortable="1"` e lejon
  (kështu u lejuan regjistrat Excel `excel-registry` dhe `sales-excel`, ku çdo rresht lidhet me regjistrimin
  me `data-*` dhe jo me pozicionin).

## Ndryshimet në skedarë
```
 index.html              | 534 ++++++++++++++++++++++++++++++++++++++ (1 bllok i ri në fund, para </body>)
 package.json            |   3 +-  (script-i "test:table-sort")
 tests/table-sort-audit.cjs | i ri (46 hapa × 2 viewport)
 tests/README.md         |   1 +   (rreshti i auditimit të ri)
```
`index.known-good.html`, `snapshots/` dhe `__biobesBootGuard` **nuk u prekën**
(`git diff -U0 index.html` → një hunk i vetëm në fund të skedarit).

## Verifikimi
```bash
python3 -m http.server 8000 --bind 0.0.0.0
node tests/check-syntax.cjs index.html     # 210 blloqe <script> → 0 gabime sintakse
npm run test:table-sort                    # 92/92 OK (46 hapa × desktop + telefon)
# Regresioni (audit-et ekzistuese, të njëjtin browser):
node tests/expenses-audit.cjs              # 36/36
node tests/stock-doc-ux-audit.cjs          # 28/28  (renditja e brendshme .sdr-table e paprekur)
node tests/warehouse-docs-audit.cjs        # 32/32
node tests/bank-csv-audit.cjs              # 18/18
node tests/returns-audit.cjs               # 13/13
node tests/weigh-group-audit.cjs           # 6/6
node tests/openings-alpha-audit.cjs        # 9/9
node tests/registry-export-audit.cjs       # 12/13 — dështimi "kolona Veprime" është EKZISTUES
                                           #          (i njëjtë edhe në HEAD, pa këtë patch)
```
Shëmbull i matricës së mbulimit që shtyp auditi (desktop):
```
   weighings      tabela: 1  me≥2 rreshta: 1  të renditshme: 1
   purchases      tabela: 1  me≥2 rreshta: 1  të renditshme: 1
   ...
   registries     tabela: 4  me≥2 rreshta: 3  të renditshme: 3
   → tabela të provuara me klikim: 24   të përjashtuara me qëllim: 0
   {"sortable":41,"headers":276,"clicks":79,"sorts":69,"restores":25,"reapplied":2,"errors":0}
```

## Deploy
`index.html` është statik — Render ribën deploy automatikisht pas merge në `main`.

---

# Shtesë në të njëjtën degë: Aktiviteti pasqyron përdoruesin që kreu veprimin

## Bug-u i raportuar
Te **Paneli → "Veprimet e fundit / Auditimi"** kolona «Përdoruesi» tregonte gjithmonë **"Admin"**,
edhe kur faturat dhe dokumentet e tjera i krijonin përdorues të ndryshëm. Shkaku ishte dyfish:

1. `dashboardActivityHtml()` e shkruante qelizën fiks — `<td>Admin</td>` për çdo rresht;
2. ngjarjet në `state.events` (~130 vende `events.push(...)`) nuk e mbanin fare autorin,
   vetëm `{date, type, ref, text}` — pra nuk ekzistonte asnjë e dhënë për t'u shfaqur.

## Rregullimi
Bllok i ri i vetëm `biobes-activity-actor-v1` në fund të `index.html`
(**580 rreshta të shtuar, 0 rreshta ekzistues të ndryshuar**):

1. **Vulosja e autorit** — `push`/`unshift` i `state.events` mbështjellen, kështu që çdo ngjarje
   e re merr `user` (id), `userName`, `userRole` dhe `at` (kohë ISO) nga sesioni (`activeUser()`),
   pa prekur asnjë nga vendet që shtojnë ngjarje. Hook-u riinstalohet pas `load`/`save`/`render`/
   `login`/`logout`/`restore` dhe kur `state.events` zëvendësohet (`slice(-500)` te ruajtja,
   `state.events=[]` te reset-i, `state=…` te load/restore).
2. **Plotësimi i dokumentit** — kur ngjarja referon dokument pa autor, ai merr
   `createdBy`/`createdByName`/`createdByRole` (emër i lexueshëm). Kjo ndreq edhe shfaqjet që
   lexonin `createdBy||salesperson||'Admin'`.
3. **Tabela** — kolona «Përdoruesi» tregon emrin real + rolin poshtë tij, me tooltip
   ("Regjistruar nga …"). Ngjarjet e vjetra lexohen nga dokumenti i referencës; roli i ruajtur
   (`ROLE-ADMIN`) kthehet në "Administrator"; ato pa asnjë gjurmë shfaqen "—" dhe **kurrë**
   "Admin" i rremë (as kur dokumenti ka vetëm `salesperson:'Admin'`).
4. **Filtrat** — `data-search` pasurohet me emrin/rolin (kërkimi live gjen përdoruesin) dhe
   shtohet dropdown «Përdoruesi»: *Të gjithë* · *Veprimet e mia (…)* · *Pa autor të regjistruar* ·
   secili emër. Dropdown-i mbështillet nga kërkimi live i sistemit (`globalizeAllSelects`),
   zgjedhja mbahet gjatë navigimit dhe numëruesi i rezultateve përditësohet.
5. **Eksporti XLSX** — kolona «Përdoruesi» merr emrin e pastër (pa rolin si rresht të dytë).
6. **Gjetkë** — përshëndetja "Mirë se vini, <emri>", «Kush e priti mallin?» te forma e peshores
   dhe «Shitësi» te `salesReportData()`/`alphaSalesAnalyticRows()` ndjekin përdoruesin real.

## Verifikimi
`npm run test:activity-actor` → **24/24** (desktop 1440×1000 + telefon 390×844), 0 gabime konzole,
`stats.errors=0`, `stats.mismatch=0`. Provohen tre përdorues (`Audit lokal` ROLE-ADMIN, `Ana Kola`
ROLE-ADMIN, `Besnik Rama` ROLE-USER) me veprime reale (shpenzim i konfirmuar `SHP-…`, peshim `PS-…`),
ngjarje të vjetra të pashtjelluara, filtrat, kërkimi, eksporti XLSX dhe `reload()`.

Regresionet: browser 32/32 · table-sort 92/92 · expenses 36/36 · cloud-realtime 56/56 ·
opening 32/32 · warehouse-docs 32/32 · stock-doc-ux 28/28 · cloud-isolation 22/22 ·
multi-company 20/20 · bank-csv 18/18 · blind 15/15 · doc-numbers 15/15 · returns 13/13 ·
trace-dossier 12/12 · doc-number-sync 10/10 · sales-prepay 9/9 · openings-alpha 9/9 · manual 7/7 ·
weigh-group 6/6 · recovery OK.
`registry-export` (12/13) dhe `operations` (hapi i paketimit) dështojnë **njësoj edhe në HEAD pa këtë
patch** → të parafillora; `ocr` kërkon motorët lokalë (`tesseract.js`) siç përshkruhet në `tests/README.md`.

## API
```js
window.activityActorReport()   // diagnostikë: autorë për ngjarje, filtri, statistika
window.__biobesActivityActorV1.{version,refresh,keepAlive,installHooks,stampActor,resolveActor,
  actorNow,recordOfRef,buildUserFilter,applyUserFilter,report,stats}
```
