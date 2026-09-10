# Patch për `patch-html-coldstart.yml` — aplikim manual (nuk u shty via App për shkak të `workflows` permission)

> **Pse ky file?** `arena-ai-coding-agent[bot]` nuk ka `workflows: write`, ndaj `git push` i `.github/workflows/*.yml` refuzohet (`refusing to allow a GitHub App to create or update workflow without workflows permission`). PR #2 u hap me `index.html` + `render.yaml` (që mjaftojnë për Render). Ky patch duhet aplikuar **një herë manualisht** via GitHub UI (ose me PAT që ka `workflows`).

## Çfarë ndryshon

1. **Trigger edhe në `index.html`** — çdo `push` në `main` që prek `index.html` (si ky PR) do të ri-injektojë `coldstart v3` automatikisht. Aktualisht trigger ishte vetëm në `.github/coldstart-inline.js` + vetë workflow-n.

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'index.html'                     # ← SHTO këtë
      - '.github/coldstart-inline.js'
      - '.github/workflows/patch-html-coldstart.yml'
```

2. **Titull fleksibël** — mos e detyro `BioBes ERP` pa `— Prototip`. Kanoniku është `BioBes ERP — Prototip` (shih `61853b5`); `coldstart-inline.js` e vendos runtime `document.title='BioBes ERP'`.

```python
# Hiq:
s=s.replace('<title>BioBes ERP — Prototip</title>','<title>BioBes ERP</title>')

# Zëvendëso me:
s=s.replace('<script src="/render-wakeup.js"></script>','')
if '<title>BioBes ERP</title>' in s and '<title>BioBes ERP — Prototip</title>' not in s:
    s=s.replace('<title>BioBes ERP</title>','<title>BioBes ERP — Prototip</title>')
```

3. **Grep fleksibël**

```bash
grep -q '<title>BioBes ERP' index.html   # në vend të grep -q '<title>BioBes ERP</title>'
```

## Si ta aplikoni (30 sekonda)

**Opsioni A — via GitHub UI (rekomanduar):**
1. Hap `https://github.com/genilufra-droid/biobes-erp/edit/main/.github/workflows/patch-html-coldstart.yml`
2. Kopjo përmbajtjen e file-it nga `.tmp/new_workflow.yml` më poshtë ose nga `/tmp/new_workflow.yml` në këtë repo (shih `WORKFLOW-COLDSTART-PATCH.md` history)
3. Commit direkt në `main` me mesazhin: `Fix cold-start workflow — trigger on index.html, titull fleksibël`

**Opsioni B — via PAT lokal:**
```bash
git checkout main && git pull
# apliko patch-in me dorë, pastaj:
git add .github/workflows/patch-html-coldstart.yml
git commit -m "Fix cold-start workflow — trigger on index.html, titull fleksibël"
git push origin main
```

## File i gatshëm

Përmbajtja e plotë e workflow-it të korrigjuar ruhet në `https://github.com/genilufra-droid/biobes-erp/blob/arena/01a08a6b-biobes-erp/.tmp/new_workflow.yml` (nëse e shtoni) ose kopjojeni nga më poshtë:

```yaml
name: Patch BioBes HTML cold start
on:
  push:
    branches: [main]
    paths:
      - 'index.html'
      - '.github/coldstart-inline.js'
      - '.github/workflows/patch-html-coldstart.yml'
permissions:
  contents: write
jobs:
  patch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Inject cold-start recovery directly into index.html
        shell: bash
        run: |
          set -euo pipefail
          python3 - <<'PY'
          from pathlib import Path
          import re
          html_path=Path('index.html')
          helper_path=Path('.github/coldstart-inline.js')
          s=html_path.read_text(encoding='utf-8')
          helper=helper_path.read_text(encoding='utf-8').strip()
          s=s.replace('<script src="/render-wakeup.js"></script>','')
          if '<title>BioBes ERP</title>' in s and '<title>BioBes ERP — Prototip</title>' not in s:
              s=s.replace('<title>BioBes ERP</title>','<title>BioBes ERP — Prototip</title>')
          start='<script id="biobes-coldstart-v3">'
          inline=start+'\n'+helper+'\n</script>'
          pattern=r'<script id="biobes-coldstart-v3">.*?</script>'
          s=re.sub(pattern,'',s,flags=re.S)
          if '</body>' not in s:
              raise SystemExit('ERROR: </body> not found')
          before,after=s.rsplit('</body>',1)
          s=before+inline+'\n</body>'+after
          html_path.write_text(s,encoding='utf-8')
          PY
          grep -q 'id="biobes-coldstart-v3"' index.html
          grep -q '<title>BioBes ERP' index.html
          grep -q 'Duke u lidhur me serverin' index.html
          python3 - <<'PY'
          from pathlib import Path
          s=Path('index.html').read_text(encoding='utf-8')
          assert s.count('id="biobes-coldstart-v3"')==1, 'cold-start patch must appear exactly once'
          assert s.rfind('id="biobes-coldstart-v3"') > s.rfind('setTimeout(syncBoot,600)'), 'patch must be after app scripts'
          assert s.rfind('id="biobes-coldstart-v3"') < s.rfind('</body>'), 'patch must be before final body close'
          assert s.rstrip().endswith('</html>'), 'document must end with </html>'
          PY
          git diff --check
      - name: Commit patched HTML
        shell: bash
        run: |
          set -euo pipefail
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add index.html
          if git diff --cached --quiet; then
            echo 'HTML already patched'
            exit 0
          fi
          git commit -m 'Place Render cold-start recovery at final BioBes HTML body'
          git push
```

Pas aplikimit, çdo `push` në `main` që prek `index.html` do të sigurojë që `coldstart v3` mbetet i injektuar saktë para `</body>` — pa dublikime dhe pa thyer `Prototip` title.

---
*Ky file u krijua automatikisht nga `arena/01a08a6b-biobes-erp` — mund të fshihet pas aplikimit të patch-it në `main`.*
