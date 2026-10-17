import type { BackupPiece } from '@/lib/captions/desk-recorder';

/**
 * The sound desk's backup recordings on this computer, in IndexedDB (`pic-desk`): one record per
 * piece in `pieces`, and the piece's audio as it arrived, a blob per 5 s chunk keyed by
 * (pieceId, index) in `chunks`. Every call is guarded: where storage is missing, full or refused,
 * the desk keeps recording and holds the audio in memory for this visit instead.
 */
const DB_NAME = 'pic-desk';
const DB_VERSION = 1;

type StoredChunk = { pieceId: string; index: number; blob: Blob };

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

function openDb(): Promise<IDBDatabase | null> {
  try {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('pieces')) db.createObjectStore('pieces', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks', { keyPath: ['pieceId', 'index'] });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    });
  } catch {
    return Promise.resolve(null);
  }
}

/** A piece's chunks, from the first to the last. */
const chunkRange = (pieceId: string) => IDBKeyRange.bound([pieceId, 0], [pieceId, Number.MAX_SAFE_INTEGER]);

export class DeskStore {
  private readonly db: Promise<IDBDatabase | null>;
  /** Chunks that could not be stored (no IndexedDB, or it is full): kept for this visit only. */
  private readonly memory = new Map<string, Map<number, Blob>>();

  constructor(open: () => Promise<IDBDatabase | null> = openDb) {
    this.db = open().catch(() => null);
  }

  /** Whether recordings outlive a reload here. */
  async durable(): Promise<boolean> {
    return !!(await this.db);
  }

  async listPieces(): Promise<BackupPiece[]> {
    const db = await this.db;
    if (!db) return [];
    try {
      return await request(db.transaction('pieces').objectStore('pieces').getAll());
    } catch {
      return [];
    }
  }

  async putPiece(piece: BackupPiece): Promise<void> {
    const db = await this.db;
    if (!db) return;
    try {
      const tx = db.transaction('pieces', 'readwrite');
      tx.objectStore('pieces').put(piece);
      await finished(tx);
    } catch {
      // the desk's own copy of the record carries on for this visit
    }
  }

  async putChunk(pieceId: string, index: number, blob: Blob): Promise<void> {
    const db = await this.db;
    if (db) {
      try {
        const tx = db.transaction('chunks', 'readwrite');
        tx.objectStore('chunks').put({ pieceId, index, blob } satisfies StoredChunk);
        await finished(tx);
        return;
      } catch {
        // full or refused: keep it in memory below
      }
    }
    if (!this.memory.has(pieceId)) this.memory.set(pieceId, new Map());
    this.memory.get(pieceId)!.set(index, blob);
  }

  /** A piece's audio in order: stored chunks and any held in memory. */
  async chunks(pieceId: string): Promise<Blob[]> {
    const all = new Map<number, Blob>(this.memory.get(pieceId));
    const db = await this.db;
    if (db) {
      try {
        const stored = (await request(db.transaction('chunks').objectStore('chunks').getAll(chunkRange(pieceId)))) as StoredChunk[];
        stored.forEach((c) => all.set(c.index, c.blob));
      } catch {
        // only what is in memory
      }
    }
    return [...all.entries()].sort((a, b) => a[0] - b[0]).map(([, blob]) => blob);
  }

  async deletePiece(pieceId: string): Promise<void> {
    this.memory.delete(pieceId);
    const db = await this.db;
    if (!db) return;
    try {
      const tx = db.transaction(['pieces', 'chunks'], 'readwrite');
      tx.objectStore('pieces').delete(pieceId);
      tx.objectStore('chunks').delete(chunkRange(pieceId));
      await finished(tx);
    } catch {
      // left behind; harmless
    }
  }
}
