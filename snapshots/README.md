# snapshots/ — kopje sigurie të frontend-it BioBes ERP

Kjo dosje ruan **snapshots** (kopje të plota) të `index.html` në momente të
njohura si të qëndrueshme. Ato shërbejnë si pikë rikthimi nëse një version i ri
prish aplikacionin.

## Rregulli i përditësimit (workflow)

1. Punoni ndryshimet në një degë, testoni dhe bashkojeni te `main`.
2. **Vetëm pasi versioni i ri provohet i qëndrueshëm**, bëni një snapshot të ri:

   ```bash
   cp index.html snapshots/index.YYYY-MM-DD-snapshot.html
   cp index.html index.known-good.html
   ```

3. Commitoni të dyja dhe bëni push. Kështu `index.known-good.html` mbetet
   gjithmonë "versioni i fundit i njohur si i mirë" dhe Boot-Guard ka një
   destinacion real për rollback.

## Emërtimi

`index.YYYY-MM-DD-snapshot.html` — p.sh. `index.2026-09-12-bootguard-baseline.html`

Snapshots janë kopje **statike** të plota të aplikacionit (single-file), të
hapshme direkt në shfletues ose të zëvendësueshme si `index.html` për rikthim
manual. Shih `../RECOVERY.md` për hapat e plotë të rikthimit.
