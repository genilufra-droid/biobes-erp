# BioBes ERP — Audit Magazina Gur (MG), 13 shtator 2026

**Status: 12/12 prova të magazinës në desktop dhe në telefon, 32/32 rigresione, 177 script-e pa gabime sintakse. Kopja known-good dhe snapshot-i i ri janë rifreskuar dhe hash-et janë verifikuar pas suite-s së plotë.**

Branch: `arena/01a09932-biobes-erp`.
Auditimi përdor profil të përkohshëm Chromium me të dhëna prove.
Asnjë ndryshim nuk u dërgua te API-ja e prodhimit dhe **asnjë provë nuk ka prekur
ose krijuar dokumentin real `PS-2026-002`**: çdo peshim prove merr ID-në e vet të
gjeneruar dhe suita ka një guard që dështon menjëherë nëse ajo ID shfaqet në
profilin e testit.
Shërbimi lokal: `python3 -m http.server 8000 --bind 0.0.0.0`.

> **Shënim për vazhdimësinë e sesionit.** Rregullimi i përshkruar në sesionin e
> mëparshëm **nuk ishte publikuar kurrë**: në këtë checkout mungonin si kodet
> (`ensureWarehouseRack`, `repairWarehouseLotRacks`) ashtu dhe skedarët
> `AUDIT-MAGAZINA-GUR.md` dhe `tests/warehouse-rack-audit.cjs` (nuk ekzistojnë në
> asnjë commit të historisë). Ato u rishkruan nga e para në këtë sesion, mbi
> specifikimin e njëjtë, dhe u verifikuan me riprodhim para/pas.

---

## 1. Defekti i raportuar nga terreni

Peshimi **PS-2026-002** u konfirmua në **Magazina Gur (MG)**, furnitor **Arben Koci**,
produkt **Ferrë**, **8 thasë / 216 kg neto**. Pas konfirmimit:

- stoku dhe draft-fatura e blerjes (FB) u krijuan **saktë**;
- por faqja **Magazina** shfaqte filtrin dhe butonat, **pa asnjë raft dhe pa lotin**.

### Shkaku i riprodhuar (para rregullimit)

| Hapi | Çfarë ndodhte |
|---|---|
| 1 | `state.racks` përmbante vetëm raftet e `W1` (Magazina Qendrore). MG (`W2`) nuk kishte asnjë raft. |
| 2 | Rruga e konfirmimit kërkonte raftin me `state.racks.find(r=>r.warehouse===wid)`; për MG kthente `undefined`. |
| 3 | Loti krijohej me `rack: rack?.id \|\| ''` → **`lot.rack = ''`**. |
| 4 | `views.warehouse` vizaton vetëm `state.racks`; `#rackGrid` ekzistonte por, i filtruar në MG, ishte **bosh**. |
| 5 | `syncPurchaseDrafts` funksiononte — FB Draft me `physical: 216` ekzistonte. Pra defekti ishte **vetëm i lidhjes me raftin / i shfaqjes**, jo i stokut ose i faturës. |

Riprodhimi i saktë (profil i izoluar, ID prove `PS-2026-0001`, jo dokumenti real):

```
lot.rack            = ""
rafti ekziston?     = false
rafte MG në grid    = 0
FB Draft            = [{"id":"FB-2026-0001","weighing":"PS-2026-0001","physical":216}]
pageerrors/console  = 0
```

---

## 2. Rregullimi — blloku `biobes-warehouse-rack-v1`

Një bllok i vetëm `<script id="biobes-warehouse-rack-v1">` në fund të `index.html`,
**thjesht shtues**: `282 insertions / 0 deletions`. Asnjë funksion ekzistues nuk u
mbishkrua në vend; override-et bëhen duke ruajtur referencën e mëparshme te
`window.__biobesWarehouseRackFix.previous`.

### 2.1 `ensureWarehouseRack(wid,{preferRackId})`

- Nëse thirret me `preferRackId` dhe ai raft ekziston → e kthen atë, pa krijuar asgjë.
- Përndryshe përdor **çdo raft ekzistues** të magazinës → kurrë nuk dublon.
- Vetëm në mungesë krijon raftin kryesor: `name: 'Rafti kryesor'`, `code` i pari i
  lirë (`R1` në gjendjen reale ku W1 ka `R01…R09`), `id` i pari i lirë `R1…R9999`,
  me shenjat `autoCreated`, `autoCreatedBy`, `createdAt`.
- Kërkon që magazina të ekzistojë; përndryshe kthen gabim shpjegues pa krijuar lot,
  lëvizje ose raft.
- Kodi është **unik globalisht** me qëllim: `by('racks', x)` kërkon edhe sipas `code`,
  ndaj dy rafte me të njëjtin kod do të ishin të paadresueshëm. MG merr `R1`; një
  magazinë tjetër pa rafte merr kodin tjetër të lirë (`R2`), jo një dublikatë.

### 2.2 `coreConfirmWeighing` (override)

- Ruajtën të njëjtat verifikime: peshimi ekziston, bruto/neto të vlefshme, jo i anuluar.
- **Loti ekzistues kthehet siç është** — konfirmimi i përsëritur nuk krijon lot të dytë.
- **I ri:** verifikon magazinën (`Magazina "X" nuk ekziston…`) dhe thërret
  `ensureWarehouseRack` **përpara** krijimit të lotit, duke nderuar raftin e
  kërkuar nga thirrësi nëse është i vlefshëm.
- Brenda `atomicTransaction`, një dështim i mëvonshëm e kthen mbrapsht edhe raftin
  e krijuar (provë 11).

### 2.3 `repairWarehouseLotRacks(opts)`

- Ekzekutohet **kur hapet faqja Magazina**, përpara vizatimit.
- Gjen lotet pa raft ose me raft të fshirë dhe ndryshon **VETËM `lot.rack`**.
- **Nuk prek**: `net`, `gross`, `tare`, `bags`, `availableNet`, `originalNet`, `id`,
  `code`, `status`, `warehouse`. **Nuk thërret** `coreMove` dhe **as** `syncPurchaseDrafts`
  → nuk krijon lëvizje stoku as fatura.
- Ripërdor raftin ekzistues të magazinës; nuk shton raft të ri nëse nuk duhet.
- **Idempotent**: pas ekzekutimit të parë nuk gjen më lote pa raft, ndaj reload ose
  hapje të përsëritura nuk shtojnë asnjë të dhënë (provë 7, 8).
- Kthen një raport `guards` (numrat e loteve, lëvizjeve, faturave dhe peshimeve
  para/pas) që duhet të jenë identike; një event i vetëm i përmbledhur shkruhet
  **vetëm kur diçka u rakordua vërtet**.

### 2.4 Pamja Magazina dhe mesazhet shpjeguese

- `views.warehouse` ruan markup-un dhe filtrin ekzistues; para vizatimit thërret
  rakordimin.
- Kur nuk ka asnjë raft: `#rackGridEmpty` shpjegon pse lotet nuk duken dhe çfarë bën
  rregullimi automatik.
- Kur filtri i një magazine nuk gjen asnjë raft: `#rackEmptyNote` shfaqet vetëm në
  atë rast (nuk ngatërrohet me rastin "grid bosh fare").
- `filterRacksV2` tani numëron raftet e dukshme dhe menaxhon shënimin.

---

## 3. Rezultatet pas rregullimit

### Prova manuale e skenarit real (profil i izoluar, ID prove)

```
Peshim i ri → MG pa rafte → 8 thasë / 216 kg neto → konfirmim → Magazina
lot.rack            = "R10"            (raft i vlefshëm në state.racks)
rafti në grid       = "R1 — Rafti kryesor | Magazina Gur | 1 lote · 216 kg | 1 furnitorë | 1 produkte"
FB Draft            = [{"id":"FB-2026-0001","weighing":"PS-2026-0001","physical":216}]
pageerrors/console  = 0
```

### Prova vizuale para/pas (`.audit/shots/`, jashtë Git)

| | PARA (`index.known-good.html`, pa rregullim) | PAS (`index.html`, me rregullim) |
|---|---|---|
| Desktop, MG e filtruar pas konfirmimit | 0 rafte të dukshme, grid bosh | 1 raft: `R1 — Rafti kryesor · 1 lote · 216 kg` |
| Telefon, e njëjta rrugë | 0 rafte të dukshme, grid bosh | 1 raft me të njëjtat të dhëna |
| `lot.rack` | `""` | ID-ja e raftit të MG |
| Loti / fatura | 216 kg / 8 thasë, 1 FB Draft | të pandryshuara, 1 FB Draft |

Screenshot-et: `desktop-para-*.png`, `desktop-pas-*.png`, `mobile-para-*.png`,
`mobile-pas-*.png` te `.audit/shots/`.

### Suita e re `tests/warehouse-rack-audit.cjs` — 12 prova × 2 viewport-e

1. MG nuk ka rafte në seed; grid-i i filtruar është bosh (filtri + butonat ekzistojnë).
2. Peshim i ri 8 thasë / 216 kg neto në MG → lot me raft të vlefshëm të MG.
3. Faqja Magazina shfaq `R1 — Rafti kryesor` me `1 lote · 216 kg`.
4. Kartela e raftit: 8 thasë, 240 bruto, 24 ambalazh, 216 neto, loti i vetëm.
5. Draft-fatura krijohet **një herë**, `physical: 216`, furnitori/produkti të saktë.
6. Loti ekzistues pa raft lidhet nga `repairWarehouseLotRacks` pa ndryshuar sasitë/ID-të.
7. Rakordimi është idempotent; hapje të përsëritura nuk shtojnë asgjë.
8. Pas reload gjendja ruhet e lidhur; MG ka saktësisht një raft (pa dublikatë).
9. Konfirmimi i përsëritur i të njëjtit peshim nuk dublon stokun, lëvizjet ose faturën.
10. `ensureWarehouseRack` ripërdor raftin, nderon `preferRackId`, kodet/ID-të unike.
11. Magazina e pavlefshme refuzohet me mesazh; rollback-u nuk lë rafte jetimë.
12. Mesazhi shpjegues për grid bosh dhe shënimi i filtrit për magazinë pa rafte.

Çdo provë kalon gjithashtu një **guard prodhimi**: nëse `PS-2026-002` shfaqet ndonjëherë
në profilin e testit, suita dështon menjëherë.

---

## 4. Rezultatet e ekzekutimit përfundimtar

| Suita | Rezultati |
|---|---|
| `test:syntax` | **177 scripts, 0 syntax errors** (176 + blloku i ri) |
| `test:browser` (rigresione) | **32/32 PASS** (16 grupe × desktop/telefon) |
| `test:warehouse` (i ri) | **24/24 PASS** (12 prova × desktop/telefon) |
| `test:operations` | **14/14 PASS** |
| `test:recovery` | **4/4 PASS** |
| `test:ocr` | **12/12 PASS** |
| **Gjithsej** | **86 PASS / 0 FAIL**, `git diff --check` kalon |

Log-u i plotë: `.audit/final-tests.log`; rezultatet JSON:
`.audit/warehouse-desktop.json`, `.audit/warehouse-mobile.json` (jashtë Git).
Asnjë `pageerror` ose `console.error` gjatë skenarëve të kaluar.

---

## 5. Çfarë NUK u bë (me qëllim)

- **Nuk u rikrijua peshimi real `PS-2026-002`** dhe nuk u shtuan 216 kg të rinj
  për të "rregulluar" shfaqjen. Çdo provë përdor të dhëna prove në profilin e izoluar.
- **Nuk u prekën të dhënat e prodhimit**: kërkesat HTTPS interceptohen në profilin e
  testit; konfigurimi backend zbrazet (`serverBaseUrl=()=>''`).
- Rakordimi automatik i loteve pa raft ndodh **vetëm në pajisjen që hap faqen
  Magazina** dhe vetëm për fushën `lot.rack` — sipas miratimit të dhënë.
- Nuk u fshinë dhe nuk u zhvendosën: `index.known-good.html`, `snapshots/`,
  `RECOVERY.md`, skripti `__biobesBootGuard`.

## 6. Verifikimi i integritetit

```bash
node tests/check-syntax.cjs index.html            # 177 scripts, 0 syntax errors
sha256sum -c snapshots/LATEST-KNOWN-GOOD.sha256   # OK pas rifreskimit
cmp index.html index.known-good.html              # identike 1:1
git diff --check                                  # pa probleme
```

## 7. Ndryshimet e prekura

- `index.html` — vetëm blloku i ri `biobes-warehouse-rack-v1` (282 rreshta shtesë, 0 të fshira).
- `tests/warehouse-rack-audit.cjs` — suita e re me 12 prova.
- `package.json` — skripti `test:warehouse` dhe përfshirja e tij në `npm test`.
- `tests/README.md`, `AUDIT-MAGAZINA-GUR.md`, `AUDIT-EXCEL-VISUAL.md` — dokumentim.
- `index.known-good.html`, `snapshots/index-2026-09-13.html`,
  `snapshots/LATEST-KNOWN-GOOD.sha256` — rifreskim pas verifikimit.

---
*Përditësuar: 2026-09-13 — rregullimi i rafteve të Magazina Gur (arena/01a09932-biobes-erp).*
