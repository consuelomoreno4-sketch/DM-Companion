# Publicar — detalles

## Qué hace cada script

| Script | Qué hace | Cambia archivos |
|---|---|---|
| `verificar.sh` | `node --check` de todos los JS; `archivos_app.py`; si existe la skill `agregar-traducciones`, que los tres diccionarios tengan las mismas claves | No |
| `archivos_app.py` | Lee lo que la app carga (`index.html`, iconos del manifest, `url()` del CSS, `import` de los JS, rutas a `data/`, `fonts/`, `icons/`) y comprueba que exista y esté en `FILES` de `sw.js`; también que cada archivo de esas carpetas esté en `FILES` y que nada de `FILES` falte en disco | No |
| `version.py` | Sube `VERSION` en `sw.js`, agrega `- **X.Y.Z** — nota` arriba de todo en `CHANGELOG.md` y cambia "versión X.Y.Z." en la línea **Estado** de `README.md` | Sí |
| `subir.sh` | Si no estás en `main`, se detiene con un aviso (sin commit ni push). En `main`: `git add -A`, commit con `PUBLICAR_NOMBRE` / `PUBLICAR_EMAIL`, push con hasta 4 reintentos (2, 4, 8, 16 s) y dice si cambió `data/packs/` | Git |
| `cambio_pack.sh` | Dice `PACK CAMBIADO: sí/no` comparando con lo último publicado | No |
| `comprobar_deploy.sh` | Espera (máx. ~5 min) el workflow de Pages del commit actual y compara la `VERSION` publicada con la local | No |
| `prueba.sh` | Modo prueba: verificar + versión en una copia temporal + qué se subiría y si cambió el pack. Sin commit, push ni cambios | No |

## Cuándo subir qué número

- `patch` (4.0.1 → 4.0.2): arreglos y ajustes pequeños.
- `minor` (4.0 → 4.1): una o más funciones nuevas.
- `major` (4 → 5): **solo si la dueña lo aprueba antes.**

## Si algo falla

Detente sin commit ni push. Dile a la dueña, en pocas líneas y sin jerga, en qué paso se detuvo y
qué significa (p. ej. "falta guardar un archivo nuevo para que funcione sin internet"), y pregúntale
si quiere que lo arregles. No arregles nada sin su permiso.

## Mensaje de commit

En inglés, título corto en imperativo y un párrafo breve del porqué. Al final, las líneas de
atribución que indique el contexto de la sesión (system reminder). Sin identificadores de modelo ni
datos personales. Ejemplo:

```
Fix session order: number by date and drag to reorder

Warn when session numbers do not follow the dates and let the DM drag
sessions by a handle to reorder them.

<líneas de atribución de la sesión>
```

## Identidad de git

El contenedor viene con una identidad genérica. Usa el nombre de usuario de GitHub y el correo de la
dueña de la cuenta (vienen en el contexto de la sesión) en `PUBLICAR_NOMBRE` y `PUBLICAR_EMAIL`.
No los guardes en ningún archivo del repo: es público.

## Problemas comunes

- **Push rechazado (403)**: falta instalar/permitir la GitHub App de Claude en el repo; usa la
  herramienta `read_documentation` (tema `github.access`) y explícale a la dueña el paso.
- **No se puede abrir `github.io` o la API de GitHub**: el dominio no está permitido en la red del
  entorno; `read_documentation` (tema `environment.network`).
- **El deploy tarda**: `comprobar_deploy.sh` espera ~5 min; si no termina, dile a la dueña que
  revise en unos minutos, sin inventar el resultado.
- **Rama equivocada**: `subir.sh` solo publica desde `main` (la app publicada sale de ahí). En otra
  rama se detiene antes del commit, avisa y no sube nada. Pregúntale a la dueña si quiere llevar los
  cambios a `main`.
