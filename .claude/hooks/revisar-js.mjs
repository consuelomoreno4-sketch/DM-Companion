// Hook PostToolUse (Edit/Write): revisa la sintaxis del .js recién editado con `node --check`.
// Silencioso si está bien. Si hay un error, lo muestra a Claude (código 2) para que lo corrija.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;
let file = '';
try {
  const data = JSON.parse(input);
  file = data.tool_input?.file_path || data.tool_response?.filePath || '';
} catch {
  process.exit(0); // sin datos válidos no hay nada que revisar
}
if (!/\.m?js$/.test(file)) process.exit(0);

// Los módulos de la app usan import/export: se revisan como .mjs.
const dir = mkdtempSync(join(tmpdir(), 'revisar-js-'));
try {
  copyFileSync(file, join(dir, 'archivo.mjs'));
  execFileSync(process.execPath, ['--check', join(dir, 'archivo.mjs')], { stdio: 'pipe' });
} catch (err) {
  const detalle = String(err.stderr || err.message).replaceAll(join(dir, 'archivo.mjs'), file).trim();
  process.stderr.write(`Error de sintaxis en ${file}:\n${detalle}\n`);
  process.exitCode = 2;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
