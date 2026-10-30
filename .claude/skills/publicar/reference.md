# Publicar — detalles

## Qué hace cada script

| Script | Qué hace | Cambia archivos |
|---|---|---|
| `verificar.sh` | `node --check` de todos los JS; que cada archivo de `js/`, `css/`, `data/`, `fonts/` e `icons/` esté en `FILES` de `sw.js` (y que nada de `FILES` falte en disco); si existe la skill `agregar-traducciones`, que los tres diccionarios tengan las mismas claves | No |
| `version.py` | Sube `VERSION` en `sw.js`, agrega `- **X.Y.Z** — nota` al final de "Historial de cambios" en `SPEC.md` y cambia "versión X.Y.Z." en la línea **Estado** de `README.md` | Sí |
| `subir.sh` | Exige estar en `main`; `git add -A`, commit con el mensaje del archivo y la identidad de `PUBLICAR_NOMBRE` / `PUBLICAR_EMAIL`, y `git push -u origin main` con hasta 4 reintentos (2, 4, 8, 16 s) si falla la red | Git |
| `comprobar_deploy.sh` | Espera (máx. ~5 min) a que termine el workflow de Pages del commit actual y compara `VERSION` del `sw.js` publicado con el local | No |

## Cuándo subir qué número

- `patch` (4.0.1 → 4.0.2): arreglos y ajustes pequeños.
- `minor` (4.0 → 4.1): una función nueva.
- `major` (4 → 5): una fase nueva o un cambio grande de datos.

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
- **Rama equivocada**: `subir.sh` solo publica desde `main`. Si el trabajo está en otra rama,
  primero llévalo a `main` (con el permiso de la dueña).
