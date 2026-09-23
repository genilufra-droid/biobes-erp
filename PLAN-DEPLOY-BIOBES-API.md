# PLAN — Deploy i backend-it `biobes-api` në Render + pastrim i kompanisë së tretë (C3)

> Dokumentim operacional. **Asgjë këtu nuk është ekzekutuar** nga ky sesion: nuk është
> dërguar asnjë POST/PUT/DELETE te `https://biobes-api.onrender.com`, nuk është prekur
> Render Dashboard dhe nuk është bërë push në repo-n `biobes-api`.
>
> Gjendja e verifikuar më 2026-09-22 21:16 UTC gjendet në `VERIFIKIM-LIVE-2026-09-22.md`.
> Përmbledhje: LIVE `db:true` por kodi i deployuar është `main` (`f9590ff`) — pa `/api/manual`,
> pa `/api/export/xlsx`, pa RLS/JWT/bcrypt/helmet, pa migrimet `009/010`; commit-i `ac6bfc5`
> (Faza 2 + P1/P2/P3, 100 file) **nuk ekziston në GitHub** dhe duhet ribërë në një sesion
> të lidhur me repo-n `biobes-api`.

---

## Pjesa 1 — Ribërja e punës P1/P2/P3 (parakusht për deploy)

Repo: `genilufra-droid/biobes-api` · Branch: `arena/01a0be23-biobes-api` (head aktual `0ca0ccc`) → PR drejt `main`.

Lista e punëve për t'u rindërtuar (nga përshkrimi i fazave, të gjitha në `backend/`):

| # | Puna | File kryesorë | Si verifikohet lokalisht |
|---|---|---|---|
| P1 | RLS (Row Level Security) per `company_id` | `migrations/009_rls.sql`, `db.js` (`SET app.company_id`), `company.js` | dy tokenë C1/C2: C1 nuk lexon/shkruan asnjë rresht të C2 |
| P1 | JWT access (15 min) + refresh (7 ditë) + bcrypt | `auth.js`, `middleware/auth.js` | `POST /api/auth/login` → `accessToken`+`refreshToken`; `POST /api/auth/refresh` |
| P2 | Pooling + `SET LOCAL` per transaksion | `db.js` (pg Pool, `application_name`) | 20 lidhje konkurrente, pa `SET app.company_id` të rrjedhur |
| P2 | Sekuenca e dokumenteve me `SELECT … FOR UPDATE` | `sequences.js`, `state.js` | dy pajisje njëkohësisht → numra të ndryshëm (409 `conflict:'number'`) |
| P2 | helmet + CORS multi-origin + rate limit | `server.js` | headerët `X-Content-Type-Options`, `Access-Control-Allow-Origin` sipas origjinës |
| P3 | Cache për N+1, Excel server-side `slice(20)`, `numFmt` | `export.js`, `cache.js` | `GET /api/export/xlsx?module=customerReturns` → 20 rreshta/faqe, formate numerike |
| P3 | `validateState` + advisory lock për backup | `validateState.js`, `backups.js` | PUT me gjendje të pavlefshme → 400; dy backup njëkohësisht → i dyti pret |
| P3 | Indekset `010_p3_indexes.sql` | `migrations/010_p3_indexes.sql` | `EXPLAIN` përdor indeksin për `(company_id, …)` |
| P3 | `/api/manual` | `server.js` | `GET /api/manual` → JSON me modulet (jo `Endpoint i panjohur`) |

Rregullat e pandryshueshme: **100 % cloud** (asnjë e dhënë biznesi në browser), **izolim C1 ≠ C2**,
**`company_id` realtime**, **20 përdorues konkurrent pa konflikt**, **asgjë nuk humbet me pastrim browseri**.

Kontrata që frontend-i (`biobes-erp/index.html`) tashmë e zbaton dhe backend-i duhet ta njohë:

```
GET/PUT   /api/state?company=<ID>            header: X-Company-Id: <ID>
POST      /api/state/patch?company=<ID>      header: X-Company-Id: <ID>
GET       /api/state/version?company=<ID>    header: X-Company-Id: <ID>
GET       /api/auth/me?company=<ID>          header: X-Company-Id: <ID>
GET       /api/events?token=<JWT>&company=<ID>      (SSE — company me query, EventSource nuk dërgon headerë)
GET/POST  /api/backups?company=<ID> · POST /api/backups/:id/restore · DELETE /api/backups/:id
GET       /api/manual · GET /api/export/xlsx?module=<mod>&company=<ID>
```

Përgjigjet duhet të kthejnë fushën `company` (p.sh. `{ok:true, state, version, company:"C1"}`) —
frontend-i e përdor për të mësuar/mirëmbajtur `company_id` aktive edhe kur moduli multi-company është i fjetur.

---

## Pjesa 2 — Deploy në Render (backend)

### 2.1 Para deploy-it
1. Në GitHub: PR nga `arena/01a0be23-biobes-api` → `main` (bashkoje pasi kalon CI/testet lokale).
2. Render → shërbimi `biobes-api` → **Settings**:
   - **Branch**: `main` (ose përkohësisht branch-i i punës për provë, pastaj ktheje në `main`).
   - **Root Directory**: `backend` (atje është `package.json`).
   - **Build**: `npm ci` · **Start**: `node server.js`.
   - **Health Check Path**: `/api/health`.
3. **Environment** (të gjitha si `Secret`, jo në Git):

| Variabël | Vlera / shënim |
|---|---|
| `DATABASE_URL` | Aiven Postgres, **përdor `-pooler`** (port 6543, `pgbouncer`) për 20 përdorues |
| `PGSSLMODE` | `require` |
| `JWT_SECRET` | ≥ 64 shenja, e rastësishme (`openssl rand -hex 48`) — **jo** e njëjtë me atë të dev |
| `JWT_REFRESH_SECRET` | e dytë, e veçantë |
| `JWT_TTL` / `JWT_REFRESH_TTL` | `15m` / `7d` |
| `CORS_ORIGINS` | `https://biobes-erp.onrender.com,https://<preview-host>` (lista, pa yll `*`) |
| `SYNC_ALL_MODULES` | `1` |
| `BCRYPT_ROUNDS` | `12` |
| `RATE_LIMIT_*` | sipas `render.yaml` (login: 5/15 min) |
| `SMTP_*` | opsionale (rikthim fjalëkalimi) |

4. **Migrimet**: nëse `render.yaml`/`package.json` nuk e bën vetë, shto në Build Command:
   `npm ci && node migrate.js` (aplikon `009_rls.sql`, `010_p3_indexes.sql`).
   Verifiko në psql: `SELECT name FROM schema_migrations ORDER BY id DESC LIMIT 3;`
5. **Restart** (Manual Deploy → *Clear build cache & deploy*) — Render mban `pg` pool-in të ngrohtë.

### 2.2 Pas deploy-it — verifikim LIVE (vetëm GET, asnjë shkrim)

```bash
curl -s https://biobes-api.onrender.com/api/health
# prit: {"ok":true,"db":true,"version":…,"syncPolicy":"all-modules","defaultCompany":"C1","companies":2}

curl -s https://biobes-api.onrender.com/api/manual | head -c 400
# prit: JSON me modulet — JO {"ok":false,"error":"Endpoint i panjohur"}

curl -sI "https://biobes-api.onrender.com/api/export/xlsx?module=customerReturns"
# prit: 200 + Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

Kontrolli i izolimit (me dy llogari provë, C1 dhe C2 — **jo** me të dhëna reale):
```bash
T1=$(curl -s -XPOST $URL/api/auth/login -H 'content-type: application/json' -d '{"username":"provac1","password":"…"}' | jq -r .accessToken)
curl -s "$URL/api/state" -H "Authorization: Bearer $T1" -H "X-Company-Id: C2"   # → 403/404, KURRË gjendja e C2
```
Sigurohu që politikat RLS ekzistojnë:
```sql
SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' ORDER BY 1;
```

### 2.3 Frontend-i
`biobes-erp` (ky repo) është **static** në Render (shih `render.yaml`): push në `main` → build automatik.
Pas deploy-it të backend-it, në aplikacion: Konfigurime → Zona e rrezikut → **Lidhja me serverit** = `https://biobes-api.onrender.com`
(vlera e parazgjedhur tashmë është kjo). Treguesi poshtë-majtas duhet të thotë `☁ I sinkronizuar … · v… · C1`.

### 2.4 Ndalohet
- `npm run test:live` kundër LIVE → bën **WIPE** të të dhënave reale.
- Çdo POST/DELETE provë me kompanitë reale C1/C2.
- Testet e reja të izolimit të ekzekutohen kundër serverit të rremë (siç bën `tests/cloud-isolation-audit.cjs`).

---

## Pjesa 3 — `companies:3` në LIVE: pastrim i kompanisë së tretë (C3) **pa prekur C1/C2**

Verifikimi LIVE tregoi `companies:3`, ndërsa priten 2. Hapat më poshtë janë **për t'u ekzekutuar
nga pronari** (ose nga një sesion i lidhur me `biobes-api`), jo nga ky sesion.

### 3.1 Diagnoza (read-only)
```bash
curl -s $URL/api/health | jq '{companies, defaultCompany}'
curl -s $URL/api/admin/companies -H "Authorization: Bearer $ADMIN" | jq '.companies[]|{id,code,name,active,users,stateVersion,hasState}'
```
```sql
SELECT id, code, name, active, created_at FROM companies ORDER BY id;
SELECT company_id, count(*) FROM company_users GROUP BY 1 ORDER BY 1;
```
Vendos: a është C3 kompani test-e mbetur (p.sh. `TR`/`XX` nga provat multi-company) apo e vërtetë?

### 3.2 Nëse është test-e mbetur — dy rrugë (zgjidh NJËRËN)

**Rruga A (e rekomanduar): çaktivizo, mos fshi**
```bash
curl -s -XPATCH $URL/api/admin/companies/C3 -H "Authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' -d '{"active":false}'
```
→ `companies` në health numëron vetëm aktivet; të dhënat mbeten për auditim; asnjë rrezik për C1/C2.

**Rruga B: wipe per kompani (i pakthyeshëm)**
```bash
# 1) backup i plotë i serverit PËRPARA (kthehet vetëm për C1/C2 nëse nevojitet)
curl -s -XPOST $URL/api/backups -H "Authorization: Bearer $ADMIN" -H 'content-type: application/json' \
  -d '{"label":"para-wipe-C3"}'
# 2) verifiko që C1/C2 kanë gjendje + version
curl -s "$URL/api/state?company=C1" -H "Authorization: Bearer $ADMIN" | jq '{version, n:(.state.suppliers|length)}'
curl -s "$URL/api/state?company=C2" -H "Authorization: Bearer $ADMIN" | jq '{version, n:(.state.suppliers|length)}'
# 3) wipe VETËM për C3 (endpoint-i per kompani — KURRË /api/admin/wipe, ai fshin gjithçka)
curl -s -XPOST $URL/api/admin/company/C3/wipe -H "Authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' -d '{"confirm":"C3"}'
# 4) pas wipe-it: riprovo C1/C2 (duhet të jenë të pandryshuara) dhe health
curl -s $URL/api/health | jq '{ok,db,companies}'
```

### 3.3 Rregulla sigurie për wipe
- **Kurrë** `POST /api/admin/wipe` (fshin të gjitha kompanitë + përdoruesit) dhe **kurrë** `npm run test:live`.
- Wipe bëhet vetëm me `company_id` të shprehur dhe vetëm pasi ekziston backup i serverit.
- Pas wipe-it, `company_wipe_epoch` e asaj kompanie rritet → pajisjet që kishin cache të vjetër
  e marrin gjendjen bosh nga serveri (frontend-i `honorServerWipe` e zbaton vetë, pa dialog për përdoruesin normal).
- Shenja e pranimit të wipe-it është per kompani (`biobesWipeAck:C3`) → C1/C2 nuk preken.

---

## Pjesa 4 — Çka u bë në KËTË repo (`biobes-erp`) për të plotësuar kërkesat fikse

Shih `tests/cloud-isolation-audit.cjs` (22 prova) dhe modulin `biobes-cloud-isolation-v1` në `index.html`:

1. `company_id` në çdo kërkesë: header `X-Company-Id` + `?company=`, edhe në SSE (`/api/events?token=…&company=…`)
   e cila **rihapet** me kompaninë e re sapo ndërron kompania.
2. Izolim C1 ≠ C2: shenja e punës së paruajtur (`biobesDirty:<ID>`), baza e bashkimit (`cloud:syncbase:<ID>`)
   dhe cache-t janë per kompani; event-et e kompanive të tjera shpërfillen.
3. Puna e paruajtur nuk humbet në ndërrim kompanie: kopja vendore bashkohet me `mergeStates` (server/bazë/vendore)
   dhe dërgohet sapo kthehet lidhja.
4. Browseri është vetëm cache: `localStorage` nuk mban më gjendje/backup (`biobesPreSyncSnapshot`,
   `biobesAutoBackup` u hoqën → IndexedDB per kompani); backup-i ditor është **server-first** (`POST /api/backups`).
5. Serveri para cache-it: gjendja tërhiqet gjithmonë në hyrje dhe në çdo ndërrim kompanie → me pastrim
   të plotë të browserit asgjë nuk humbet.
6. Shkrimet e një pajisjeje renditen (mutex) → më pak vetë-konflikte për 20 përdorues; konfliktet midis
   pajisjeve zgjidhen me op-e per dokument (`prev`/CAS) dhe numërim të ri automatik.
