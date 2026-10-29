"""Bundle the checked-in learning data and sources into offline HTML."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
src = ROOT / 'src'
template = (src/'shell.html').read_text(encoding='utf8')
css = '\n'.join((src/name).read_text(encoding='utf8') for name in ['app.css','learning.css','journey.css','sandbox.css'])
core = '\n'.join((src/name).read_text(encoding='utf8') for name in ['journey-core.js','learning.js','core.js'])
app = (src/'app.js').read_text(encoding='utf8')
for marker, name in [('CARDS','cards.js'),('ROUNDS','rounds.js'),('JOURNEY','journey.js'),('SANDBOX','sandbox.js')]:
    app = app.replace('/* INLINE_'+marker+' */', (src/name).read_text(encoding='utf8'))
data = json.dumps(json.loads((ROOT/'data/payload.json').read_text(encoding='utf8')),ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
html = template.replace('/* INLINE_STYLES */',css).replace('/* INLINE_CORE */',core).replace('/* INLINE_APP */',app).replace('/* INLINE_DATA */',data)
(ROOT/'index.html').write_text(html,encoding='utf8')
(ROOT/'sandbox.html').write_text(html.replace('name="vocab-preview" content="false"','name="vocab-preview" content="true"'),encoding='utf8')
print('Built offline web app and isolated preview.')
