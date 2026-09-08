# BioBes ERP — Vendosja Online në Render

Aplikacioni është **një file i vetëm statik** (`index.html`) — nuk kërkon server, databazë apo build.

## Hapat (5 minuta)

### Opsioni A — me Blueprint (më i lehtë)
1. Krijo një repository të ri në **GitHub** (p.sh. `biobes-erp`).
2. Ngarko në të këta 2 file-a: `index.html` dhe `render.yaml`.
3. Hyr në **Render Dashboard** → **New** → **Blueprint**.
4. Zgjidh repository-n → **Apply**.
5. Prisni ~1 minutë → merrni URL-në live (`https://biobes-erp.onrender.com`).

### Opsioni B — Static Site manual
1. Ngarko `index.html` në një repo GitHub.
2. Render Dashboard → **New** → **Static Site** → lidh repo-n.
3. **Build Command:** lëre bosh (ose `echo ok`)
4. **Publish Directory:** `./` (ose lëre bosh)
5. **Deploy** → merr URL-në live.

## ⚠️ Shumë e rëndësishme — të dhënat

- Të dhënat ruhen në **shfletuesin e çdo pajisjeje** (IndexedDB), **JO** në server.
- Kjo do të thotë: telefoni, PC-ja dhe çdo përdorues tjetër kanë **kopje të veçanta** — ndryshimet nuk sinkronizohen automatikisht.
- Për të transferuar të dhënat: **Backup (⇩)** në krye → shkarkon JSON → **Import (⇧)** në pajisjen tjetër.
- Render-i e bën aplikacionin të arritshëm online, por **nuk** e kthen në sistem me shumë përdorues me databazë të përbashkët. Për këtë shërben backend-i **biobes-api** (repo më vete — shih `README-BACKEND.md`): pasi të vendoset URL-ja e tij te Konfigurime → Zona e rrezikut → Lidhja me serverin, butoni **Reset** fshin edhe serverin, edhe pajisjen.

## Reset-i me password (lokal + server)

Butoni i vetëm **Reset** te Konfigurime → Zona e rrezikut:
1. Kërkon **passwordin e adminit** (nëse nuk ka admin, e krijon herën e parë).
2. Nëse është vendosur **URL e backend-it**, fshin fillimisht **serverin**, pastaj pajisjen.
3. Pa backend të konfiguruar, fshin vetëm pajisjen (IndexedDB).

### Kontrata API për backend-in e ardhshëm (Aiven Postgres + Render)

Kur të ndërtohet backend-i, duhet të ekspozojë:

```
POST {BACKEND_URL}/api/admin/wipe
Content-Type: application/json

{ "password": "passwordi-i-adminit" }
```

Përgjigjet:
- Sukses → HTTP 200 `{ "ok": true }` (serveri ka fshirë të gjitha tabelat e biznesit)
- Password gabim → HTTP 401 `{ "ok": false, "error": "Password i gabuar" }`

Aplikacioni e thërret këtë endpoint automatikisht kur URL-ja ruhet te Konfigurime →
Zona e rrezikut → Lidhja me serverin. Nëse serveri refuzon ose nuk lidhet,
fshirja lokale **anulohet** (nuk fshihet asgjë).

## Hyrja dhe sinkronizimi online

Kur URL-ja e backend-it është vendosur (shih kartelën "Lidhja me serverin"):
dilni dhe hyni me kredencialet e **serverit** — gjendja tërhiqet automatikisht
dhe çdo ruajtje shkon në Postgres. Po kjo në çdo pajisje = të dhëna të përbashkëta.
Konfliktet zgjidhen me dritare; pa internet punohet lokalisht dhe sinkronizohet më vonë.

## Përditësime të ardhshme

Zëvendësoni `index.html` në repo → Render ribën deploy automatikisht.
**Kujdes:** përditësimi i file-it NUK i fshin të dhënat e ruajtura në shfletues.
