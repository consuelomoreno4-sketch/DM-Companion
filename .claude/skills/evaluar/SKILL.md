---
name: evaluar
description: Evalúa una idea para DM Companion antes de construirla (valor en la mesa, costo, contras, alternativas y recomendación), sin escribir código. Solo cuando la dueña escribe /evaluar seguido de la idea.
disable-model-invocation: true
argument-hint: <idea>
---

# Evaluar una idea

Idea: $ARGUMENTS

**No escribas ni edites código ni archivos.** Solo lee lo necesario para estimar el costo (`SPEC.md`,
el mapa de módulos de `CLAUDE.md`, `grep` en `js/`). Si la idea es ambigua, di qué supones y sigue.

Responde en español, en términos simples, con estos cinco apartados en este orden:

1. **Qué resuelve**: qué problema real ataca y si vale la pena para dirigir en la mesa (tablet en
   horizontal, con dedo o S Pen, en plena partida). Si ya existe algo parecido en la app, dilo.
2. **Costo**: qué archivos toca, qué tan compleja es (pequeña / mediana / grande) y qué riesgo tiene
   (romper algo que ya funciona, migrar datos en IndexedDB, traducciones en tres idiomas, caché en
   `sw.js`).
3. **Contras**: problemas concretos, incluido cualquier choque con las restricciones fijas (sin
   internet, sin compilación, copyright, datos solo en el dispositivo) o con el diseño.
4. **Alternativas más simples**, si las hay: algo que ya existe en la app, una versión reducida o un
   cambio de hábito sin código. Si no hay, dilo en una línea.
5. **Recomendación**: una sola, clara: **hacerla**, **hacerla más pequeña** (di qué parte) o
   **no hacerla**. "No hacerla" es una respuesta válida y esperada cuando el costo o los contras
   pesan más que el beneficio.

Sigue la sección "Cómo opinar" de `CLAUDE.md`: sin elogios, y di cuándo no estás seguro. Termina
ahí; no ofrezcas empezar a construirla.
