# BioBes ERP

Sistem ERP për përpunimin dhe tregtimin e bimëve mjekësore: blerje & peshime, magazina,
lote, mostra, porosi, përpunim, paketim, ngarkesa, dosje eksporti, raporte dhe
gjurmueshmëri.

> **Forma e projektit:** një skedar i vetëm statik — `index.html` (~1.9 MB, 177 blloqe
> `<script>`). Nuk ka build, nuk ka server dhe nuk ka varësi runtime. Të dhënat ruhen në
> **IndexedDB-në e shfletuesit** të çdo pajisjeje.

---

## Përmbajtja

- [Çfarë bën](#çfarë-bën)
- [Modulet](#modulet)
- [Hapja lokale](#hapja-lokale)
- [Testet](#testet)
- [Vendosja online (Render)](#vendosja-online-render)
- [Të dhënat, backup & import](#të-dhënat-backup--import)
- [Rikuperimi (Boot-Guard)](#rikuperimi-boot-guard)
- [Struktura e repos](#struktura-e-repos)
- [Dokumentacioni](#dokumentacioni)
- [Rregulla për ndryshime](#rregulla-për-ndryshime)
- [Kufij të njohur](#kufij-të-njohur)

---

## Çfarë bën

- **Blerje & peshime** — regjistrim peshe (bruto/tare/neto, thasë), konfirmim, krijim
  loti dhe gjenerim automatik i draft-faturës së blerjes (FB).
- **Magazina & lotet** — magazina të shumta, rafte, vendosje loteve, transferime,
  inventar fizik, etiketa.
- **Furnitorët & pagesat** — kartelë furnitori me KPI dhe tab-e (Blerje, Pagesa,
  Parapagime, Detaje), mandate pagese, parapagime, kthime.
- **Mostra & porosi** — mostër → aprovim → porosi klienti → përpunim → paketim.
- **Ngarkesa & eksport** — plan ngarkese, dalje stoku, dosje eksporti me OCR (Tesseract)
  dhe PDF (PDF.js), kontroll mospërputhjesh, arkiv.
- **Raporte & gjurmueshmëri** — raporte blerjeje/shitjeje/stoku/arkës/kontabël, eksport
  XLSX, printim dokumentesh, kërkim nga loti në dokument.
- **Konfigurime** — përdorues & të drejta, administrator, mbrojtje/rikuperim, teste të
  brendshme, pastrim të dhënash, lidhje me backend-in opsional.

---

## Modulet

| # | Çelësi | Etiketa në menunë |
|---|---|---|
| 1 | `dashboard` | ⌂ Paneli |
| 2 | `weighings` | ⚖ Blerje & Peshime |
| 3 | `purchases` | 🧾 Fatura Blerje *(shtohet në kohë ekzekutimi, pas `suppliers`)* |
| 4 | `suppliers` | ♙ Furnitorë |
| 5 | `payments` | ₳ Pagesa |
| 6 | `products` | ❧ Produkte |
| 7 | `warehouse` | ▦ Magazina |
| 8 | `lots` | ▣ Lotet |
| 9 | `samples` | ⌁ Mostrat |
| 10 | `orders` | ☷ Porositë |
| 11 | `processing` | ⚙ Përpunimi |
| 12 | `shipments` | 🚚 Ngarkesat |
| 13 | `exports` | ▤ Dosjet Eksport |
| 14 | `reports` | ▥ Raportet |
| 15 | `trace` | ⌘ Gjurmueshmëri |
| 16 | `settings` | ⚒ Konfigurime |

Lista burimore: `const modules = [...]` në krye të `index.html`. Moduli `purchases`
futet nga blloku `biobes-purchases-weighings-v1`. Në gjerësi ≤ 620 px menuja kalon në
shiritin fundor (`mobile-nav`).

---

## Hapja lokale

```bash
git clone https://github.com/genilufra-droid/biobes-erp.git
cd biobes-erp
python3 -m http.server 8000 --bind 0.0.0.0
# hap http://localhost:8000/index.html
```

Çdo server statik funksionon (edhe duke hapur skedarin direkt, por disa veçori si
IndexedDB/OCR janë më të qëndrueshme mbi `http://`).

---

## Testet

Paketat Node përdoren **vetëm për teste** — aplikacioni mbetet statik.

```bash
npm ci
npx playwright install --with-deps chromium
python3 -m http.server 8000 --bind 0.0.0.0   # terminali 1
npm test                                     # terminali 2
```

| Skript | Çfarë kontrollon |
|---|---|
| `npm run test:syntax` | Çdo inline `<script>` kalon nëpër `node --check`. |
| `npm run test:browser` | Navigim, peshime, FB, mandate, furnitorë, inventar, lidhje, raporte, backup/import, E2E/financa. |
| `npm run test:warehouse` | Rafti i garantuar për çdo lot (rasti Magazina Gur), rakordim, idempotencë, reload. |
| `npm run test:operations` | Produkt me foto, magazinë/raft/etiketë, mostër, porosi, proces, paketim, ngarkesë. |
| `npm run test:recovery` | Backup automatik, Pastro, Erase, Boot-Guard pas dy nisjeve të dështuara. |
| `npm run test:ocr` | PNG real, PDF me tekst, PDF i skanuar, set eksporti, PDF i dëmtuar, kartelë A4. |

Detajet, workaround-i i Chromium-it në sandbox dhe garancitë e izolimit nga prodhimi:
[`tests/README.md`](tests/README.md).

---

## Vendosja online (Render)

`render.yaml` është blueprint-i: kopjon `index.html` dhe `index.known-good.html` në
`public/` dhe publikon si **Static Site**. Çdo push në `main` shkakton deploy.
Udhëzues i plotë: [`README-DEPLOY.md`](README-DEPLOY.md).

---

## Të dhënat, backup & import

- Të dhënat jetojnë në shfletuesin e pajisjes (**IndexedDB**, baza `BioBesERP`, objekti
  `app/state`). Serveri nuk ruan asgjë.
- Transferimi midis pajisjeve bëhet me **Backup (⇩)** → JSON → **Import (⇧)**.
- Pa backend të konfiguruar, çdo pajisje ka kopjen e vet të pandërvarur. Për të dhëna të
  përbashkëta duhet backend-i me Postgres (URL vendoset te *Konfigurime → Zona e
  rrezikut → Lidhja me serverin*).
- `README-DEPLOY.md` referon një `README-BACKEND.md` që **nuk ekziston ende** në këtë
  repo; kontrata e vetme e dokumentuar deri tani është endpoint-i
  `POST {BACKEND_URL}/api/admin/wipe` (shih atë skedar).

---

## Rikuperimi (Boot-Guard)

Një version i ri që thyen nisjen zëvendësohet automatikisht nga kopja e qëndrueshme:

- `index.known-good.html` — kopje 1:1 e versionit të verifikuar së fundi.
- `snapshots/index-YYYY-MM-DD.html` + `snapshots/LATEST-KNOWN-GOOD.sha256` — historik dhe
  verifikim: `sha256sum -c snapshots/LATEST-KNOWN-GOOD.sha256`.
- `<script id="__biobesBootGuard">` — numëron nisjet e dështuara; pas 2 dështimesh bën
  `location.replace('index.known-good.html?bootguard=rollback')`.

Shpjegim i plotë dhe hapat manualë: [`RECOVERY.md`](RECOVERY.md).

---

## Struktura e repos

```
index.html                    # i gjithë aplikacioni (statik, 177 blloqe <script>)
index.known-good.html         # kopje e qëndrueshme për rollback automatik
render.yaml                   # blueprint Render (Static Site)
package.json                  # vetëm skriptet e testeve (playwright)
snapshots/                    # snapshot-e të datuara + hash-e SHA-256
tests/                        # suite auditimi (syntax, browser, warehouse, operations, recovery, ocr)
.github/coldstart-inline.js   # helper i injektuar para </body> për cold-start
.github/workflows/            # patch-html-coldstart.yml, assemble-exact.yml
AUDIT.md                      # audit funksional
AUDIT-MAGAZINA-GUR.md         # audit i defektit Magazina Gur
AUDIT-EXCEL-VISUAL.md         # regjistër i shtresës Excel & pamjeve
RECOVERY.md                   # Boot-Guard & rikuperim
README-DEPLOY.md              # vendosja në Render
WORKFLOW-COLDSTART-PATCH.md   # patch i aplikueshëm manualisht për workflow
PR.md                         # përshkrimi i PR-së së fundit
```

---

## Dokumentacioni

| Dokument | Për çfarë shërben |
|---|---|
| [`AUDIT.md`](AUDIT.md) | Rezultatet e auditit funksional dhe defektet e rregulluara. |
| [`AUDIT-MAGAZINA-GUR.md`](AUDIT-MAGAZINA-GUR.md) | Rasti i raftit që mungonte në Magazina Gur. |
| [`AUDIT-EXCEL-VISUAL.md`](AUDIT-EXCEL-VISUAL.md) | Shtresa Excel/XLSX dhe pamjet që nuk duhen mbishkruar. |
| [`RECOVERY.md`](RECOVERY.md) | Boot-Guard, snapshot-e, rikuperim manual. |
| [`README-DEPLOY.md`](README-DEPLOY.md) | Deploy në Render, reset me password, kontrata API. |
| [`tests/README.md`](tests/README.md) | Ekzekutimi i testeve dhe kufijtë e provës. |
| [`WORKFLOW-COLDSTART-PATCH.md`](WORKFLOW-COLDSTART-PATCH.md) | Patch manual për workflow-n e cold-start. |

---

## Rregulla për ndryshime

1. **Vetëm shtesa.** Kod i ri = bllok `<script>` i ri në fund të `index.html`. Mos
   mbishkruaj, mos "pastro" dhe mos fshij blloqe ekzistuese (0 deletions).
2. **Verifiko sintaksën:** `node tests/check-syntax.cjs`.
3. **Ekzekuto suite-n:** `npm test` (përfshin OCR/PDF dhe pamjet).
4. **Përditëso mbrojtjen:** vetëm pasi të gjitha testet të kalojnë, rifresko
   `index.known-good.html` dhe `snapshots/index-YYYY-MM-DD.html` (1:1 me `index.html`)
   dhe regjistro hash-et në `snapshots/LATEST-KNOWN-GOOD.sha256`.
5. **Mos prek** `RECOVERY.md`, `snapshots/` e vjetra dhe skriptin `__biobesBootGuard`.

---

## Kufij të njohur

- Pa backend: **një përdorues / një pajisje**; sinkronizimi bëhet vetëm me import JSON.
- Testet e OCR/PDF përdorin motorë realë (Tesseract, PDF.js) të shërbyer nga kopjet npm
  përmes interceptimit të URL-ve CDN — **disponueshmëria e CDN-ve në internet nuk
  provohet** nga suite-ja lokale.
- Pamja mobile është emulim Chromium (1440×1000 dhe 390×844), jo pajisje fizike.
- Nuk auditohën: API-ja e prodhimit, login/sync me serverin real, printeri fizik.
