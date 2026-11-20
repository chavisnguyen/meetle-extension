// Chunks live in IndexedDB (Chrome keeps the blobs on disk), so a 2 h class never sits in RAM and survives a crash.
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open('meetle', 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore('chunks', { keyPath: ['sid', 'seq'] });
    r.result.createObjectStore('meta', { keyPath: 'sid' });
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const run = async (store, mode, fn) => {
  const db = await open();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, mode);
    const out = fn(tx.objectStore(store));
    tx.oncomplete = () => res(out.result);
    tx.onerror = () => rej(tx.error);
  });
};
export const putChunk = (sid, seq, blob) => run('chunks', 'readwrite', (s) => s.put({ sid, seq, blob }));
export const getChunks = async (sid) =>
  (await run('chunks', 'readonly', (s) => s.getAll(IDBKeyRange.bound([sid, 0], [sid, Infinity])))).map((c) => c.blob);
export const dropChunks = (sid) => run('chunks', 'readwrite', (s) => s.delete(IDBKeyRange.bound([sid, 0], [sid, Infinity])));
export const putMeta = (m) => run('meta', 'readwrite', (s) => s.put(m));
export const allMeta = () => run('meta', 'readonly', (s) => s.getAll());
