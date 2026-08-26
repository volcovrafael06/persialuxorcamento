import { openDB } from 'idb';

const DB_NAME = 'persifix_db';
const DB_VERSION = 3;

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion, newVersion) {
    // Criar stores para cada tipo de dado
    if (oldVersion < 1) {
      db.createObjectStore('orcamentos', { keyPath: 'id' });
      db.createObjectStore('clientes', { keyPath: 'id' });
      db.createObjectStore('produtos', { keyPath: 'id' });
      db.createObjectStore('accessories', { keyPath: 'id' });
      db.createObjectStore('configuracoes', { keyPath: 'id' });
      db.createObjectStore('visits', { keyPath: 'id' });
    }
    if (oldVersion < 3) {
      if (!db.objectStoreNames.contains('produtos_acessorios')) {
        db.createObjectStore('produtos_acessorios', { keyPath: 'id' });
      }
    }
  },
});

export const localDB = {
  async getAll(storeName) {
    const db = await dbPromise;
    return db.getAll(storeName);
  },

  async get(storeName, id) {
    const db = await dbPromise;
    return db.get(storeName, id);
  },

  async add(storeName, item) {
    const db = await dbPromise;
    return db.add(storeName, item);
  },

  async put(storeName, item) {
    const db = await dbPromise;
    return db.put(storeName, item);
  },

  async delete(storeName, id) {
    const db = await dbPromise;
    return db.delete(storeName, id);
  },

  async clear(storeName) {
    const db = await dbPromise;
    return db.clear(storeName);
  },

  async bulkPut(storeName, items) {
    const db = await dbPromise;
    const tx = db.transaction(storeName, 'readwrite');
    await Promise.all((items || []).map(item => tx.store.put(item)));
    await tx.done;
  },

  async replaceAll(storeName, items) {
    const db = await dbPromise;
    const tx = db.transaction(storeName, 'readwrite');
    await tx.store.clear();
    await Promise.all((items || []).map(item => tx.store.put(item)));
    await tx.done;
  },

  async update(storeName, id, changes) {
    const db = await dbPromise;
    const current = await db.get(storeName, id);
    if (!current) return null;
    const updated = { ...current, ...changes };
    await db.put(storeName, updated);
    return updated;
  }
};
