// Acceso a IndexedDB (la "base de datos" del navegador, guardada en el dispositivo).
// Los errores usan claves de traducción (por ejemplo 'backup.invalid'); app.js las traduce.
// Fases futuras: añadir almacenes en STORES y subir DB_VERSION.

const DB_NAME = 'dm-companion';
const DB_VERSION = 1;
const STORES = ['kv'];

export const BACKUP_APP = 'dm-companion';
export const BACKUP_FORMAT = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('db.blocked'));
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Operación cancelada'));
  });
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function kvGet(key) {
  const db = await open();
  return request(db.transaction('kv').objectStore('kv').get(key));
}

export async function kvSet(key, value) {
  const db = await open();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put(value, key);
  return done(tx);
}

// Copia de seguridad: todos los almacenes como lista de { key, value }.
export async function exportAll() {
  const db = await open();
  const stores = {};
  const tx = db.transaction(STORES);
  for (const name of STORES) {
    const store = tx.objectStore(name);
    const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
    stores[name] = keys.map((key, i) => ({ key, value: values[i] }));
  }
  return { app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), stores };
}

export function validateBackup(data) {
  if (!data || data.app !== BACKUP_APP || typeof data.stores !== 'object') {
    throw new Error('backup.invalid');
  }
  if (data.format > BACKUP_FORMAT) {
    throw new Error('backup.tooNew');
  }
}

// Reemplaza todos los datos por los de la copia.
export async function importAll(data) {
  validateBackup(data);
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const name of STORES) {
    const store = tx.objectStore(name);
    store.clear();
    for (const row of data.stores[name] || []) store.put(row.value, row.key);
  }
  return done(tx);
}
