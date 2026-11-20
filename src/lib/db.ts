// Chunks live in IndexedDB (Chrome keeps the blobs on disk), so a 2 h class never sits in RAM and survives a crash.
import type { Meta } from "./types";

type Store = "chunks" | "meta";

const open = () =>
  new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open("meetle", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("chunks", { keyPath: ["sid", "seq"] });
      r.result.createObjectStore("meta", { keyPath: "sid" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

const run = async <T>(
  store: Store,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
) => {
  const db = await open();
  return new Promise<T>((res, rej) => {
    const tx = db.transaction(store, mode);
    const out = fn(tx.objectStore(store));
    tx.oncomplete = () => res(out.result);
    tx.onerror = () => rej(tx.error);
  });
};

const ofSession = (sid: string) => IDBKeyRange.bound([sid, 0], [sid, Infinity]);

export const putChunk = (sid: string, seq: number, blob: Blob) =>
  run("chunks", "readwrite", (s) => s.put({ sid, seq, blob }));
export const getChunks = async (sid: string) =>
  (await run<{ blob: Blob }[]>("chunks", "readonly", (s) => s.getAll(ofSession(sid)))).map(
    (c) => c.blob,
  );
export const dropChunks = (sid: string) =>
  run("chunks", "readwrite", (s) => s.delete(ofSession(sid)));
export const putMeta = (m: Meta) => run("meta", "readwrite", (s) => s.put(m));
export const allMeta = () => run<Meta[]>("meta", "readonly", (s) => s.getAll());
