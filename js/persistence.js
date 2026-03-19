// js/persistence.js

const DB_NAME = "whisper_asr";
const DB_VERSION = 1;
const STORE_NAME = "transcriptions";

/** @type {IDBDatabase|null} */
let _db = null;

/**
 * Open (or reuse) the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("timestamp", "timestamp");
        store.createIndex("email", "email");
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = (e) => {
      reject(new Error(`IndexedDB error: ${e.target.error}`));
    };
  });
}

/**
 * Save a transcription record.
 * @param {{ name: string, text: string, email: string, task: string }} record
 * @returns {Promise<number>} The new record id
 */
export async function saveTranscription({ name, text, email, task }) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.add({
      name,
      text,
      email,
      task,
      timestamp: Date.now(),
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(new Error(`Erro ao guardar: ${e.target.error}`));
  });
}

/**
 * Retrieve all saved transcriptions, newest first.
 * @returns {Promise<Array>}
 */
export async function getHistory() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result ?? []).reverse());
    req.onerror = (e) => reject(new Error(`Erro ao ler histórico: ${e.target.error}`));
  });
}
