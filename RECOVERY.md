# 🛡️ RECOVERY — Mbrojtja & Rikuperimi i BioBes ERP

Ky dokument shpjegon sistemin **Boot-Guard** dhe hapat për të rikthyer aplikacionin
kur një version i ri i `index.html` del me defekt (crash në nisje).

BioBes ERP është një file i vetëm statik (`index.html`). Nëse një ndryshim i ardhshëm
e thyen nisjen (gabim sintakse / runtime që bllokon boot-in), përdoruesi rrezikon të
mbetet para një faqeje bosh. Boot-Guard e parandalon këtë.

---

## 1. Çfarë ekziston në repo

| File / element | Roli |
|---|---|
| `index.html` | Aplikacioni kryesor (versioni aktual). |
| `index.known-good.html` | **Kopja e qëndrueshme** — identike 1:1 me `index.html` në momentin e last-verified. Përdoret për rollback automatik. |
| `snapshots/index-YYYY-MM-DD.html` | Snapshot i datuar i versionit të verifikuar (sot: `index-2026-09-12.html`). |
| `snapshots/LATEST-KNOWN-GOOD.sha256` | Verafishi SHA-256 i `index.known-good.html` dhe i snapshot-it të datuar. Verifiko me: `sha256sum -c snapshots/LATEST-KNOWN-GOOD.sha256` |
| `<script id="__biobesBootGuard">` | Skripti në **fillim të `<body>`** te `index.html` (dhe te kopja known-good): numëron crash-et dhe bën rollback. |
| `window.__biobesBootOk()` | Thirret pas `syncBoot` kur nisja sukseson — zeron crash-counter-in. |
| Seksioni **"🛡️ Mbrojtje & Rikuperim"** | Te *Konfigurime → Përdoruesit & Siguria* (modali `usersSecurityCenter`): tregon crash-counter-in dhe butonat e rikuperimit. |

## 2. Si punon Boot-Guard (logjika)

1. Në çdo nisje, skripti `__biobesBootGuard` (i vendosur menjëherë pas `<body>`)
   rrit counter-in `localStorage.__biobesBootCrashes` me 1.
2. Kur aplikacioni niset me sukses (`syncBoot` gjen `state` dhe e normalizon),
   thirret `window.__biobesBootOk()` → counter-i shkon në **0**.
3. Nëse nisja dështon (crash, gabim sintakse, screen bosh), counter-i **mbetet i rritur**.
4. Kur counter-i arrin **2** (dy nisje të dështuara rresht), nisja tjetër:
   - shfaq një banner të kuq `⚠️ BioBes: 2 nisje të dështuara…`,
   - bën `location.replace('index.known-good.html?bootguard=rollback')`,
   - known-good shfaq banner-in jeshil `🛡️ Boot-Guard: u krye rollback automatik…` për 9 sekonda.
5. Mbrojtje kundër unazës: një flag `sessionStorage.__biobesBootRolled` garanton që
   rollback provohet **vetëm një herë për sesion**; nëse edhe `index.known-good.html`
   dështon 2 herë, shfaqet udhëzimi për rikuperim manual (ky dokument) pa redirect të mëtejshëm.

> Crash-counter-i ruhet **lokalisht në pajisje** (localStorage) — rollback është për
> pajisjen që crash-on, jo global.

## 3. Rikuperimi manual (kur rollback automatik s'mjafton)

### A. Në pajisjen tënde (shfletues)
1. Hap direkt: `https://<url-e-render>/index.known-good.html`
2. Të dhënat nuk humbin: ato ruhen në IndexedDB të shfletuesit, jo në file.
3. Për të zeruar counter-in: *Konfigurime → Përdoruesit & Siguria → 🛡️ Mbrojtje & Rikuperim → **Zero crash-counter***.

### B. Në deploy (Render / repo)
Nëse versioni i fundit në `main` është i dëmtuar:

```bash
git checkout main && git pull
# rikthe kopjen e qëndrueshme si version aktual:
cp index.known-good.html index.html
# ose një snapshot më të vjetër të datuar:
cp snapshots/index-2026-09-12.html index.html
# verifiko integritetin:
sha256sum -c snapshots/LATEST-KNOWN-GOOD.sha256
node --check   # çdo bllok <script> duhet të japë 0 gabime
git add index.html && git commit -m "recovery: rikthe index.html te known-good" && git push
```

Render ribën deploy automatikisht pas push-it në `main`.

## 4. Pas çdo deploy-i të suksesshëm (mirëmbajtja)

Kur një version i ri verifikohet që punon (login, ruajtje, modale OK):

```bash
cp index.html index.known-good.html                 # kopje 1:1
cp index.html snapshots/index-$(date +%F).html      # snapshot i datuar
sha256sum index.known-good.html > snapshots/LATEST-KNOWN-GOOD.sha256
sha256sum snapshots/index-$(date +%F).html >> snapshots/LATEST-KNOWN-GOOD.sha256
git add index.known-good.html snapshots/ && git commit -m "snapshot: known-good i ri" && git push
```

**Kujdes:** `index.known-good.html` duhet të jetë gjithmonë **identike 1:1** me
`index.html` të verifikuar (`cmp index.html index.known-good.html` → pa dallime).
Mos i fshi: `index.known-good.html`, `snapshots/`, `RECOVERY.md`, skriptin `__biobesBootGuard`.

## 5. CSP & lidhja me API-n

`<meta Content-Security-Policy>` te `index.html` përmban:

```
connect-src 'self' https://biobes-api.onrender.com https://*.onrender.com wss: https://api.github.com data: blob:;
```

kështu fetch te backend-i (`biobes-api.onrender.com`, çdo host `*.onrender.com`) dhe
WebSocket nuk bllokohen nga shfletuesi (p.sh. login nga telefoni).

## 6. Kontrolli i shpejtë (checklist)

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/index.html              # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/index.known-good.html   # 200
grep -o 'Content-Security-Policy[^>]*' index.html | grep -c 'biobes-api.onrender.com'  # 1
grep -c 'id="__biobesBootGuard"' index.html                                            # 1
grep -c '__biobesBootOk' index.html                                                    # >= 2 (def + thirrje)
sha256sum -c snapshots/LATEST-KNOWN-GOOD.sha256                                        # OK
```

---
*Përditësuar: 2026-09-12 — Boot-Guard v1 + CSP connect-src (arena/01a096fc-biobes-erp).*
