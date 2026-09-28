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
    req.onsuccess = () => {
      // iOS Safari はバックグラウンド中などに接続を切ることがある。切れたら次の操作で開き直す
      req.result.onclose = () => (dbPromise = undefined);
      resolve(req.result);
    };
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
    let t: IDBTransaction;
    try {
      t = db.transaction(STORE, mode);
    } catch (e) {
      // 接続が閉じていると例外になる（onclose が来ない場合もある）。次は開き直す
      dbPromise = undefined;
      return reject(e);
    }
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
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
