#!/usr/bin/env python3
"""Bundle src/*.js + css + cases + rules into one self-contained index.html.
Run:  python3 build.py      (no dependencies)"""
import json, re, pathlib
ROOT = pathlib.Path(__file__).parent
ORDER = ['llm-core', 'caps', 'case', 'data', 'redact', 'bundle', 'settings', 'engine', 'interview-ui', 'badges', 'board', 'studio', 'practice', 'app']

def module(name):
    src = (ROOT / 'src' / f'{name}.js').read_text()
    pre, exports = [], []
    def imp(m):
        names = [n.strip() for n in m.group(1).split(',') if n.strip()]
        pre.append('const { ' + ', '.join(n.replace(' as ', ': ') for n in names) + ' } = __M;')
        return ''
    src = re.sub(r"^import\s*\{([^}]*)\}\s*from\s*'[^']+';\s*$", imp, src, flags=re.M)
    assert not re.search(r'^import ', src, re.M), f'unsupported import in {name}'
    for m in re.finditer(r'^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)', src, re.M):
        exports.append(m.group(1))
    src = re.sub(r'^export\s+', '', src, flags=re.M)
    return f"// ---- {name}.js ----\n(() => {{\n{chr(10).join(pre)}\n{src}\nObject.assign(__M, {{ {', '.join(exports)} }});\n}})();\n"

cases = [{'file': f, 'md': (ROOT / 'cases' / f).read_text()} for f in json.loads((ROOT / 'cases' / 'index.json').read_text())]
rules = {p.stem: p.read_text() for p in sorted((ROOT / 'rules').glob('*.md'))}
data = json.dumps({'cases': cases, 'rules': rules}, ensure_ascii=False).replace('<', '\\u003c')
js = 'const __M = {};\n' + ''.join(module(n) for n in ORDER)
html = (ROOT / 'shell.html').read_text()
html = html.replace('/*CSS*/', (ROOT / 'css' / 'app.css').read_text())
html = html.replace('<!--DATA-->', f'<script type="application/json" id="vil-data">{data}</script>')
html = html.replace('/*JS*/', '{\n' + js.replace('</script', '<\\/script') + '\n}')
(ROOT / 'index.html').write_text(html)
print(f'index.html  {len(html)/1024:.0f} KB  · {len(cases)} cases · {len(rules)} rule files')
