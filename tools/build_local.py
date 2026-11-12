"""Bundle web/ into one self-contained HTML that opens from disk (file://), no server needed.
Usage: python3 tools/build_local.py OUT.html"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / 'web'
def js(name):
    s = (root / 'js' / name).read_text(encoding='utf-8')
    s = re.sub(r"^import .*?;\n", "", s, flags=re.M)
    return re.sub(r"^export (const|function|async function) ", r"\1 ", s, flags=re.M)
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'style.css').read_text(encoding='utf-8')
ds = (root / 'ds' / 'kds.css').read_text(encoding='utf-8')
bundle = "(() => {\n" + js('pattern.js') + "\n" + js('i18n.js') + "\n" + js('icons.js') + "\n" + js('app.js') + "\n})();"
html = re.sub(r'<link rel="stylesheet" href="ds/kds\.css[^"]*">', lambda m: "<style>\n" + ds + "\n</style>", html)
html = re.sub(r'<link rel="stylesheet" href="style\.css[^"]*">', lambda m: "<style>\n" + css + "\n</style>", html)
html = re.sub(r'<script type="module" src="js/app\.js[^"]*"></script>', lambda m: "<script>\n" + bundle + "\n</script>", html)
pathlib.Path(sys.argv[1]).write_text(html, encoding='utf-8')
print('ok', len(html))
