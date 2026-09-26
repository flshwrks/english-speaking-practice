/**
 * 自分の発話の録音は端末の IndexedDB にだけ保存する（サーバー容量・費用ゼロ）。
 * 30日より古いものは起動時に削除する。
 */
const DB_NAME = "esp-audio";
const STORE = "utterances";
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type Entry = { blob: Blob; at: number };

let dbPromise: Promise<IDBDatabase> | undefined;

/** 接続は1つを使い回す（発話ごとに開き直さない） */
function open() {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = undefined;
      reject(req.error);
    };
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void) {
  const db = await open();
  return new Promise<T | undefined>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

const key = (sessionId: number, seq: number) => `${sessionId}:${seq}`;

export async function saveUtterance(sessionId: number, seq: number, blob: Blob) {
  try {
    await tx("readwrite", (s) => s.put({ blob, at: Date.now() } satisfies Entry, key(sessionId, seq)));
  } catch {
    // プライベートモード等では保存できないが、練習自体は続けられる
  }
}

export async function loadUtterance(sessionId: number, seq: number) {
  try {
    return ((await tx("readonly", (s) => s.get(key(sessionId, seq)))) as Entry | undefined)?.blob;
  } catch {
    return undefined;
  }
}

export async function purgeOldUtterances() {
  try {
    await tx("readwrite", (s) => {
      const cursor = s.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        if (Date.now() - (c.value as Entry).at > RETENTION_MS) c.delete();
        c.continue();
      };
    });
  } catch {}
}
