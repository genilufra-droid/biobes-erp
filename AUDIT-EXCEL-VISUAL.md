# BioBes ERP — Audit i shtresës Excel & Pamje (rindërtim)

> **SHËNIM I RËNDËSISHËM (2026-09-13, sesioni `arena/01a09932-biobes-erp`).**
> Dokumenti origjinal `AUDIT-EXCEL-VISUAL.md` i sesionit të mëparshëm **nuk u gjet në
> këtë checkout** — nuk ekziston në asnjë commit të historisë Git. Ky skedar është një
> **rindërtim besnik nga kodi aktual i `main`** (i cili përmban funksionalitetin e plotë,
> shih §4) dhe shërben si kujtesë për sesionet e ardhshme.
>
> **RREGULL PËR VAZHDIMËSINË:** shtresa Excel dhe pamjet e listuara më poshtë janë
> funksionalitet i prodhimit. **Mos i mbishkruaj, mos i zëvendëso dhe mos i "pastro"**
> kur shton blloqe të reja `<script>`. Çdo ndryshim i ri duhet të jetë **shtues**
> (0 deletions) dhe të verifikohet me `npm test` (përfshin `test:ocr` që ushtron
> eksportet XLSX/PDF dhe `test:browser` që ushtron pamjet).

---

## 1. Pse ekziston ky dokument

Në sesionin e Magazina Gur u kërkua që rregullimi i ri të **ruante** ndryshimet e
mëparshme Excel/pamje dhe të mos i mbishkruante. Meqë dokumenti origjinal mungonte,
u verifikua që shtresa ekziston dhe është e paprekur, dhe u rindërtua ky regjistër.

Verifikimi i paprekshmërisë (pas rregullimit `biobes-warehouse-rack-v1`):

| Funksion / element | Në `index.html` para | Pas | Rezultati |
|---|---|---|---|
| `exportWeightDocumentXlsx` | 4 | 4 | i paprekur |
| `exportSaleInvoiceXlsx` | 2 | 2 | i paprekur |
| `exportLedgerXlsx` | 4 | 4 | i paprekur |
| `makeXlsx` | 63 | 63 | i paprekur |
| `unzipXlsx` | 2 | 2 | i paprekur |
| `liveTable` | 7 | 7 | i paprekur |
| `tableCard` | 107 | 107 | i paprekur |

`git diff --numstat` për `index.html`: `282 0` — pra vetëm shtime, asnjë fshirje.

---

## 2. Shtresa Excel — inventari aktual

### 2.1 Menaxhimi i template-ve (banner-i në krye të moduleve)

- `importToolbarForPage()` — shton banner-in **"Menaxhimi Excel — {Moduli}"** me
  butonat **⬇ Shkarko template** dhe **⬆ Importo template** në krye të faqes së modulit.
- `MODULE_IMPORT_BY_PAGE` — modulet me template zyrtar: `products`, `suppliers`,
  `customers`, `purchases` (purchaseInvoices), `warehouse` (warehouses), `orders`,
  `packaging`, `sales`, `payments`, `banking`, `shipments`.
- `downloadImportTemplate(k)` / `professionalImportTemplate` — gjenerojnë template-in
  XLSX me kolonat dhe validimet e modulit.
- `pickModuleImport(k)` → `parseModuleImport` → `commitModuleImport` — importi me
  parashikim rreshtash, mesazhe gabimi për rresht dhe `IMPORT_SCHEMAS` si skemë kolonash.
- Ndihmës: `importLabel`, `importNum`, `importBool`, `normalizeImportHeader`,
  `readImportRows`, `importCenter`, `importProducts`, `importOfficialSupplierCodes`.

### 2.2 Eksportet XLSX (dokumente dhe regjistra)

`exportWeightDocumentXlsx`, `exportPurchaseDocumentXlsx`, `exportSaleInvoiceXlsx`,
`exportOrderDocumentXlsx`, `exportReceiptsXlsx`, `exportLedgerXlsx`,
`exportRegistryXlsx`, `exportSalesRegisterXlsx`, `exportSamplesReportXlsx`,
`exportE2EXlsx` — të ndërtuara mbi `makeXlsx`.

### 2.3 Leximi/verifikimi i skedarëve XLSX

`unzipXlsx`, `xlsxRowsFromXml`, `xlsxColIndex`, `testXlsxContainer`,
`advancedXlsx`, `salesRegistryExcel`, `exportExcelRegistry`.

---

## 3. Shtresa e pamjes — inventari aktual

- `tableCard(...)` — tabela standarde me kërkim live, renditje dhe kartela veprimesh;
  përdoret në ~107 vende.
- `liveTable` — rindërtimi live i listave të zgjedhjes pa kopje të vjetra.
- 20 pamje `views.*` (dashboard, peshime, magazinë, blerje, shitje, raportet Odoo-style,
  gjurmueshmëri etj.), me filtra të grupuar dhe masa të llogaritshme.
- Kërkimi global i selektorëve: `globalizeAllSelects` i kthen çdo `<select>` në një
  kërkim live (`input[type=search]` + `.global-live-option`); `<select>`-i nativ
  fshehet me `display:none`. **Provat UI duhet të klikojnë opsionin live, jo
  `selectOption()`** — shih `tests/warehouse-rack-audit.cjs` (`filterWarehouse`).
- Bartja e pamjes në telefon (390×844): banner-i Excel, kartelat e rafteve dhe
  modalet-stackohen vertikalisht; e provuar me screenshot para/pas.
- Shtresa e printimit: `biobesPrintFrame`, etiketat e loteve, fletët A4/PDF.

---

## 4. Ku është verifikuar

| Prova | Çfarë ushtron nga shtresa Excel/pamje |
|---|---|
| `test:ocr` | PDF/PNG reale, set eksporti/arkiv/shkarkim, PDF i dëmtuar, kartelë A4 |
| `test:browser` | navigimi në të gjitha pamjet, tabela, modale, backup/import, E2E |
| `test:operations` | formularët dhe kartelat operative, etiketa e lotit |
| `test:warehouse` (i ri) | banner-i Excel i Magazina mbetet i pandryshuar dhe i dukshëm në të dy viewport-et gjatë provave të rafteve |

Screenshot-et para/pas te `.audit/shots/` tregojnë banner-in **"Menaxhimi Excel —
Magazina"** të paprekur dhe të responsiv në desktop dhe telefon.

---

## 5. Lista e kontrollit para çdo ndryshimi në `index.html`

```bash
git diff --numstat -- index.html          # prit: 0 deletions për kodin ekzistues
grep -c "Menaxhimi Excel" index.html      # >= 1
grep -c "function makeXlsx" index.html    # >= 1
grep -c "function tableCard" index.html   # >= 1
node tests/check-syntax.cjs index.html    # 0 gabime
npm test                                  # të gjitha suitat PASS
```

---
*Rindërtuar: 2026-09-13 — sesioni `arena/01a09932-biobes-erp`. Origjinali nuk u gjet në repo.*
