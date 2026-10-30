# Agregar traducciones — detalles

## Formato del JSON para `agregar_claves.py`

```json
{
  "camp.renumber": { "en": "Number by date", "es": "Numerar por fecha", "de": "Nach Datum nummerieren" },
  "camp.outOfOrder": {
    "en": { "one": "{n} session is out of order.", "other": "{n} sessions are out of order." },
    "es": { "one": "{n} sesión está fuera de orden.", "other": "{n} sesiones están fuera de orden." },
    "de": { "one": "{n} Sitzung ist nicht in Reihenfolge.", "other": "{n} Sitzungen sind nicht in Reihenfolge." }
  }
}
```

- Texto simple: `{"en": …, "es": …, "de": …}` → una clave.
- Plural (para `tn('clave', n)`): cada idioma con `one` y `other` → crea `clave.one` y `clave.other`.
- Escribe el texto tal cual: el script escapa `'`, `\` y saltos de línea.
- Se inserta después de la última clave con el mismo prefijo (`camp.` junto a `camp.`), en los tres
  archivos a la vez. Si algo falla, no se cambia ningún archivo.

## Qué rechaza `agregar_claves.py`

- Falta un idioma, o un plural sin `one` / `other`.
- `{parámetros}` distintos entre idiomas (p. ej. `{n}` en inglés y no en alemán).
- Una clave que ya existe (salvo con `--reemplazar`), o un plural mezclado con texto simple.

## Qué revisa `verificar_claves.py` (también lo corre `/publicar`)

- Que `en`, `es` y `de` tengan exactamente las mismas claves y ninguna repetida.
- Que cada clave tenga los mismos `{parámetros}` en los tres idiomas.
- Que las claves usadas en el código con texto fijo (`t('…')`, `tn('…')`, `data-i18n…="…"`) existan
  (para `tn`, como `.one` y `.other`). Las claves armadas con `${…}` no se pueden revisar.

## Estilo

- Español neutro y claro, de "tú"; alemán con "du"; frases cortas. Abreviaturas de juego como en el
  glosario (HP, CA, VD en español; TP, RK, HG en alemán).
- `-html` solo cuando el texto lleva `<strong>`, `<br>` o `<kbd>`.
