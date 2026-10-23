"""
Adds <link rel="stylesheet" href=".../glass.css"> as the LAST stylesheet in every
page that already loads assets/css/responsive.css. Idempotent. Run from the
`frontend/` folder:   python install_glass.py          (add)
                      python install_glass.py --remove (revert)
"""
import re, sys, pathlib

root = pathlib.Path(__file__).parent
remove = '--remove' in sys.argv
link_re = re.compile(r'[ \t]*<link[^>]+rel=["\']stylesheet["\'][^>]*>\r?\n?', re.I)
resp_re = re.compile(r'href=["\']([^"\']*)responsive\.css["\']')
done = 0

for f in root.rglob('*.html'):
    txt = f.read_text(encoding='utf-8')
    m = resp_re.search(txt)
    if not m:
        continue
    href = m.group(1) + 'glass.css'
    tag_re = re.compile(r'[ \t]*<link[^>]*glass\.css[^>]*>\r?\n?')
    if remove:
        new = tag_re.sub('', txt)
    else:
        if 'glass.css' in txt:
            continue
        links = list(link_re.finditer(txt))
        last = links[-1]                      # last stylesheet in the document
        nl = '\r\n' if '\r\n' in txt else '\n'
        tag = f'  <link rel="stylesheet" href="{href}">{nl}'
        end = last.end()
        if not txt[last.start():end].endswith('\n'):
            tag = nl + tag.rstrip('\r\n')
        new = txt[:end] + tag + txt[end:]
    if new != txt:
        f.write_text(new, encoding='utf-8', newline='')
        done += 1
        print(('removed from ' if remove else 'linked in ') + str(f.relative_to(root)))

print(f'{done} file(s) changed')
