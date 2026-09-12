# PR: arena/01a0972d-biobes-erp → main — Fatura Blerje + Peshime (3 rregullime)

## Përmbledhje
Patch final `biobes-purchases-weighings-v1` në `index.html` (1 bllok `<script>` i ri, pa prekur asnjë bllok ekzistues)
që mbyll 5 kërkesat e raportuara. Verifikuar në jsdom: **23/23 teste OK** (para patch-it: 12/23).

## Ndryshimet
1. **`syncPurchaseDrafts()`** — për çdo peshim të **konfirmuar** pa faturë blerjeje krijohet automatikisht një **FB-Draft**
   (`status:'Draft'`, `physical`, `billable` nga peshimi, `documentType:'FB nga peshimi'`), me event në `state.events`;
   **fshihen draft-et** e peshimeve të **anuluara** (ose të fshira) — vetëm `status==='Draft'`, faturat manuale pa peshim nuk preken;
   pastaj `save()` dhe `render()`. Ka mbrojtje re-entrancy (`__syncPurchaseBusy`) kundër rekursionit `render() → sync → render()`.
2. **`views.purchases`** — faqja *Faturat e Blerjes* me kolonat e sakta:
   `Fature · Data · Furnitori · Produkt · Peshimi · Neto · Cmimi · Totali · Monedha · Status · Veprime`
   + butonat në krye: **`↻ Merr peshimet`** (`syncPurchaseDrafts();render()`) dhe **`+ Fature blerjeje`** (`purchaseInvoiceForm()`).
3. **`views.weighings`** — kolona **Veprime** me dy butona: **`Hap`** (`weightCard`) dhe **`⋮ Veprime`** (`weightActions`);
   **ID-ja e peshimit është buton i klikueshëm** (`<button class="link" onclick="weightCard('PS-…')">`).
   Brenda `weightActions` shtohet shkurtesa `🧾 Fatura FB-…` kur peshimi ka faturë blerjeje.
4. **`confirmExistingWeight`** — hequr kushti `!x.bagRows?.length`; konfirmimi lejohet edhe pa rreshta thasësh
   (mbeten kontrollet për furnitor/produkt/magazinë dhe bruto/neto > 0).
5. **Menu + mobile-nav** — `🧾 Fatura Blerje` (`['purchases','🧾','Fatura Blerje']`) në `modules` dhe buton në `mobile-nav`.

## Verifikimi
```bash
node check.js index.html           # 175 blloqe <script> → 0 gabime sintakse
grep -c "BAD" index.html           # 0
node test2.js index.html           # 23/23 teste funksionale OK
node test2.js index.known-good.html# 12/23 (baza, pa patch) — dëshmi e boshllëqeve
cmp index.html index.known-good.html   # identikë 1:1
sha256sum -c snapshots/LATEST-KNOWN-GOOD.sha256   # OK
curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/index.html   # 200
```
Skedarët e mbrojtur nuk u prekën: `index.known-good.html` (u rifreskua 1:1), `snapshots/`, skripti `__biobesBootGuard`.

## Deploy
Render ribën deploy automatikisht pas merge në `main` (`index.html` statik, pa build).
