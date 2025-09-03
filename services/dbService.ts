import type { GeneratedVideo, ClipMetadata } from '../types';

const DB_NAME = 'AIMusicVideoDB';
const DB_VERSION = 3;
const HISTORY_STORE = 'history';
const CLIPS_STORE = 'clips';

let db: IDBDatabase;

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('IndexedDB error:', request.error);
            reject(new Error('Failed to open database.'));
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const tempDb = (event.target as IDBOpenDBRequest).result;
            const oldVersion = event.oldVersion;
            
            if (oldVersion < 1) {
                // Initial schema
                tempDb.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
                const clipStore = tempDb.createObjectStore(CLIPS_STORE, { keyPath: 'id' });
                clipStore.createIndex('createdAt', 'createdAt', { unique: false });
            } else {
                 // Non-destructive migration for users with existing databases
                if (!tempDb.objectStoreNames.contains(HISTORY_STORE)) {
                    tempDb.createObjectStore(HISTORY_STORE, { keyPath: 'id' });
                }
                if (!tempDb.objectStoreNames.contains(CLIPS_STORE)) {
                    const clipStore = tempDb.createObjectStore(CLIPS_STORE, { keyPath: 'id' });
                    clipStore.createIndex('createdAt', 'createdAt', { unique: false });
                } else {
                    const transaction = (event.target as IDBOpenDBRequest).transaction;
                    if(transaction){
                        const clipStore = transaction.objectStore(CLIPS_STORE);
                        if (!clipStore.indexNames.contains('createdAt')) {
                            clipStore.createIndex('createdAt', 'createdAt', { unique: false });
                        }
                    }
                }
            }
        };
    });
};

export const addHistory = async (video: GeneratedVideo): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(HISTORY_STORE, 'readwrite');
        const store = transaction.objectStore(HISTORY_STORE);
        const request = store.put(video);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};


export const getAllHistory = async (): Promise<GeneratedVideo[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(HISTORY_STORE, 'readonly');
        const store = transaction.objectStore(HISTORY_STORE);
        const request = store.getAll();
        
        request.onsuccess = () => {
             // IndexedDB doesn't store methods, so Date objects become strings. We need to convert them back.
            const results = request.result.map(item => ({
                ...item,
                createdAt: new Date(item.createdAt),
            }));
            resolve(results);
        }
        request.onerror = () => reject(request.error);
    });
};

export const addClip = async (clip: ClipMetadata): Promise<void> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(CLIPS_STORE, 'readwrite');
        const store = transaction.objectStore(CLIPS_STORE);
        // Use `put` to add or update the clip based on its unique id
        const request = store.put(clip);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

export const getAllClips = async (): Promise<ClipMetadata[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(CLIPS_STORE, 'readonly');
        const store = transaction.objectStore(CLIPS_STORE);
        const request = store.getAll();
        
        request.onsuccess = () => {
            // Ensure createdAt is a valid Date object, falling back to file's lastModified for older records
             const results = request.result.map(item => ({
                ...item,
                createdAt: new Date(item.createdAt || item.file.lastModified),
            }));
            resolve(results);
        }
        request.onerror = () => reject(request.error);
    });
};