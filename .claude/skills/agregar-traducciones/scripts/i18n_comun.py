"""Lectura de los diccionarios de idiomas (js/i18n/*.js), compartida por los scripts de la skill."""
import os
import re
import subprocess

LANGS = ('en', 'es', 'de')
ROOT = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip()
ENTRY = re.compile(r"^  '([^']+)': '((?:[^'\\]|\\.)*)',\s*$")
PARAM = re.compile(r'\{(\w+)\}')


def path(lang):
    return os.path.join(ROOT, 'js', 'i18n', f'{lang}.js')


def read_lines(lang):
    with open(path(lang), encoding='utf-8') as f:
        return f.read().split('\n')


def entries(lines):
    """[(índice de línea, clave, texto escapado)] en orden."""
    out = []
    for i, line in enumerate(lines):
        m = ENTRY.match(line)
        if m:
            out.append((i, m.group(1), m.group(2)))
    return out


def unescape(text):
    return re.sub(r'\\(.)', lambda m: {'n': '\n', 't': '\t'}.get(m.group(1), m.group(1)), text)


def escape(text):
    return text.replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n')


def params(text):
    return sorted(set(PARAM.findall(text)))
