# BioBes ERP — audit funksional, 13 shtator 2026

**Status: Kontrollet lokale të listës kalojnë. Kopja known-good dhe snapshot-i i ri janë verifikuar pas ekzekutimit të plotë të suite-s.**

Branch: `arena/01a09751-biobes-erp`.
Auditimi përdor profil të përkohshëm Chromium me të dhëna prove.
Asnjë ndryshim nuk u dërgua te API-ja ose te të dhënat e përdoruesit.
Shërbimi lokal: `python3 -m http.server 8000 --bind 0.0.0.0`.

## Rezultatet e ekzekutimit përfundimtar

- **62/62 grupe funksionale PASS**: 32 browser, 14 operacione, 4 rikuperim, 12 OCR/PDF.
- Desktop: 1440×1000; telefon i emuluar me touch: 390×844.
- **176 scripts / 0 gabime sintakse**, përmes `node --check` për çdo bllok.
- **152/152 kontrolle E2E të brendshme** kalojnë në të dy viewport-et.
- Testi i brendshëm financiar kalon në të dy viewport-et, edhe pasi janë krijuar transaksione të tjera.
- Asnjë `pageerror` ose `console.error` gjatë skenarëve të kaluar.
- `git diff --check` kalon.
- Hash-et e kopjes së re known-good dhe snapshot-it të datës 13 shtator kalojnë;
  të dy skedarët janë identikë me `index.html` dhe kanë 176 script-e pa gabime sintakse.

Komandat, izolimi nga prodhimi dhe kërkesat e testit: [`tests/README.md`](tests/README.md).
Rezultatet e detajuara lokale: `.audit/final-tests.log`, `.audit/results.json`,
`.audit/operations-*.json`, `.audit/recovery-results.json`, `.audit/ocr-*.json`
(nuk futen në Git). PDF-ja e gjeneruar: `.audit/supplier-a4.pdf`.

## Defekte të riprodhuara dhe rregullime

1. **Nisja** — IndexedDB përfundonte përpara ngarkimit të router-it dhe shkaktonte
   `goPermissionBase is not defined`. Nisja pret `DOMContentLoaded`.
2. **CSP** — u hoq vetëm direktiva `frame-ancestors` nga meta-tag: shfletuesi e
   injoronte dhe raportonte gabim. OCR/PDF bllokohej nga CSP; tani lejohen host-et
   konkrete të motorëve, worker-ëve dhe traineddata. Versioni Tesseract është fiksuar në 5.1.1.
3. **Modalet** — mbyllja pastron përmbajtjen, footer-in dhe gjendjen e dritares;
   kthimi “Prapa” ruan vlerat e shkruara në formular, jo vetëm HTML-në fillestare.
4. **Peshimet** — konfirmimi me lot ekzistues vendos statusin saktë pa dubluar lotin;
   peshimi i anuluar refuzohet nga core; referenca që mungon jep mesazh, jo exception.
5. **Blerjet** — u rikthye hyrja për kthimin te furnitori. Faturat pa peshim dhe
   parapagimet konfirmohen nga kartelat e tyre. Numri opsional bosh nuk trajtohet si
   dublikatë; zero/çmimi i pavlefshëm nuk konfirmohet. Fushat numerike përgatiten
   menjëherë, jo me timer që konkurron me shtypjen e përdoruesit.
6. **Pagesa/parapagimi** — checkbox real në formular, flag i ruajtur në mandat dhe
   titulli `MANDAT PARAPAGIMI`. Shënimi i lirë nuk klasifikon vetë një pagesë si parapagim.
7. **Kartela e furnitorit** — ruhen katër KPI-të dhe shtohen tab-et Blerje, Pagesa,
   Parapagime, Detaje. Kthimet përfshihen në gjendje dhe histori. Parapagimet nga
   mandati dhe nga FB llogariten së bashku; konfirmimi i përsëritur nuk i konsumon dy herë.
8. **Ngarkesat** — dalja tani ul stokun fizik dhe të disponueshëm. Plani kontrollohet
   përpara ndryshimit; dërgesa e pjesshme nuk nxjerr të gjitha paketimet e porosisë.
   U rikthyen kontrollet për stokun e paketuar dhe dosjen e mbyllur të eksportit,
   të cilat ishin humbur në një override të mëvonshëm.
9. **Transferim/inventar** — `net` dhe `availableNet` përditësohen së bashku.
   Transferimi regjistron hyrje/dalje me total zero dhe inventari regjistron diferencën.
10. **Kërkimi live** — rindërtimi hiqte vetëm wrapper-in prind, megjithëse wrapper-i
    aktual ishte sibling. Kjo linte zgjedhje të vjetra dhe e bënte të pamundur zgjedhjen
    e faturës për kthim. Tani lista rindërtohet pa kopje të vjetra.
11. **Veprime** — butonat dytësorë të tabelave që nuk kishin menu mblidhen në `⋮ Veprime`,
    duke përdorur handler-at ekzistues.
12. **Konfigurime** — tab-e Administrator, Përdoruesit, Mbrojtje/Rikuperim, Testet,
    Pastrimi i të dhënave. `Pastro — ruaj llogaritë` dhe `Erase — fshi edhe llogaritë`
    kanë formularë të veçantë. Shkurtesa e password-it rikthehet te funksioni që
    kërkon administrator aktiv dhe password-in e tanishëm.
13. **Restore** — catch-i i restore të sigurt referonte variablën `old` jashtë scope-it.
    U rregullua dhe u shtua kontrolli i të drejtës së importit në të dy hyrjet e restore.
14. **Printimi** — FB përdor dokumentin zyrtar, jo formularin e editimit. Ka vetëm një
    iframe printimi dhe pastrohet pas `afterprint`. Kartela e furnitorit ka rregulla
    A4 specifike, pa ndryshuar pamjen e aplikacionit.
15. **Testet financiare** — kontrolli i TVSH-së lexon llogarinë e konfiguruar, jo
    `445` të hardkoduar kur konfigurimi përdor `444`; testi izolon transaksionet e veta.
    Nuk u ndryshua plani kontabël i përdoruesit për të bërë testin të kalojë.
16. **Lidhjet e peshimit** — modifikimi/anulimi/fshirja bllokohen kur ka FB të
    konfirmuar, mostër, lot fëmijë, përpunim, paketim, transferim ose lëvizje pasuese.
    Fshirja e draftit FB nuk e kthen mbrapsht peshimin fizik të konfirmuar.
17. **Paketimi** — mbyllja e modalit pastron edhe zgjedhësin e veçantë të loteve;
    nuk mbetet overlay që bllokon ekranin.
18. **OCR i eksportit** — numrat alfanumerikë të faturave lexohen; peshat neto/bruto
    të etiketuara nxirren nga dokumenti edhe kur nuk përputhen me regjistrin.
    Më parë nxjerrja favorizonte numrat që përputheshin me vlerën e pritur.
19. **Dështimi i skanimit** — PDF i dëmtuar shënohet “Dështuar”, jo sukses i rremë.
    Klikimet e dyfishta nuk nisin dy kontrolle; skedarët kapen para nisjes në background.
    Ngarkuesi i motorit mund të riprovohet pas një dështimi të rrjetit.
20. **Produkti** — butoni Ruaj lidhet menjëherë, jo pas timer-it 40 ms që mund
    të humbiste klikimin e shpejtë gjatë modifikimit.

## Çfarë provojnë skenarët browser

- Të 23 modulet nga sidebar; ikonat mobile dhe faqet nga paneli.
- Peshim me formular dhe kërkim live → Draft → konfirmim → një lot dhe një FB;
  linku i peshimit në listën FB; menu Hap/Modifiko/Printo/Anulo/Fshi/Dubliko.
- Krijimi/konfirmimi i FB me dhe pa peshim dhe i parapagimit nga FB.
- Mandat parapagimi, bilanci, katër KPI/tab-e, alokimi i përsëritur dhe kthimi.
- Transferim i pjesshëm dhe konfirmim inventari fizik.
- Hapja/mbyllja e kartelave dhe formularëve të produkteve, loteve, mostrave,
  porosive, përpunimit, paketimit, ngarkesave dhe administrimit.
- Tab-et e konfigurimit dhe ekzekutimi i Pastro/Erase në profil të izoluar: refuzim
  password-i të gabuar, ruajtje llogarish nga Pastro, fshirje llogarish nga Erase dhe backup para Erase.
- Backup JSON i shkarkuar, refuzim importi të pavlefshëm, roundtrip i backup-it dhe
  trajtim i skedarit të dëmtuar në restore të sigurt.
- Dokumente printimi të izoluara, eksport XLSX real, kërkim gjurmueshmërie dhe
  raport Alpha me rezultat, switch te Odoo.
- Skenarët e biznesit të suites E2E, përfshirë bllokimin e dosjes me mospërputhje.

## Mbyllja e kontrolleve të mbetura

- **Rregulli financiar i konfirmuar nga përdoruesi:** fatura konsumon parapagimin.
  15,000 ALL parapagim − 10,000 ALL faturë = 5,000 ALL të papërdorura.
  Kthimi 1,000 ALL e çon shumën në 6,000 ALL. Pagesa reale e re shton kredi.
- **Ruajtje përmes UI:** produkt me foto dhe modifikim, magazinë/raft, mostër e
  aprovuar, porosi me mostër, proces 60→50 kg, paketim 5×10 kg, modifikim etikete,
  ngarkesë 50 kg dhe kalime deri në Ngarkuar; refuzim i ngarkesës bosh.
- **Eksport/OCR:** Tesseract dhe PDF.js realë, PNG, PDF me tekst dhe PDF i skanuar;
  ngarkim seti, kontroll mospërputhjeje, hapje fushash, arkiv dhe shkarkim me byte
  identike; PDF i dëmtuar refuzohet pa sukses të rremë.
- **Rikuperimi:** backup automatik rikthen vlerën e ndryshuar; Pastro/Erase
  ekzekutohen me pohime mbi rezultatin; dy nisje të papërfunduara shkaktojnë rollback
  dhe të dhënat e ruajtura mbeten. Para rifreskimit u provua kandidati pa prekur kopjen e vjetër.
- **Printimi:** kartela me të dhëna reale prove del në një faqe A4 (~595×842 pt),
  katër KPI dhe historik. PNG-ja e PDF-së u kontrollua vizualisht; etiketa e lotit
  dhe dokumentet e peshimit/FB hapen të izoluara në një iframe.
- **Provat negative:** dokumentet e lidhura nuk ndryshohen nga Modifiko/Anulo/Fshi;
  çdo kategori lidhjeje kontrollohet veçmas. Rigresioni i plotë kaloi pas rregullimeve.

### Kufijtë e provës

Motorët OCR/PDF u shërbyen nga kopjet npm të paketave përmes interceptimit të
URL-ve CDN; **teksti i njohur nuk u simulua**. Disponueshmëria aktuale e CDN-ve
në internet nuk provohet nga kjo metodë. Pamja mobile është emulim Chromium,
jo test në një pajisje fizike Samsung.

**Nuk janë audituar API-ja e prodhimit, login/sync me serverin real ose printeri fizik.**
Këto nuk duhen raportuar si të testuara nga kjo suite lokale.

## Mbrojtja e rikuperimit

`index.known-good.html`, `snapshots/`, `RECOVERY.md` dhe script-i `__biobesBootGuard`
nuk u fshinë. Script-i Boot-Guard dhe snapshot-i i vjetër mbeten të pandryshuar.
Pas kalimit të plotë të testeve, kandidati u kopjua në `index.known-good.html` dhe
`snapshots/index-2026-09-13.html`; hash-et u regjistruan në
`snapshots/LATEST-KNOWN-GOOD.sha256`. Verifikimi i hash-eve, sintaksës së kopjeve dhe
prova me objektivin **real** known-good kaluan përpara commit/PR drejt `main`.
`RECOVERY.md` dhe snapshot-i i datës 12 shtator mbeten të pandryshuar.
