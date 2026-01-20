// Upload history storage using IndexedDB
// Stores last 10 uploaded images with metadata

const DB_NAME = 'photo-upload-history';
const DB_VERSION = 1;
const STORE_NAME = 'uploads';
const MAX_HISTORY_ITEMS = 10;

export interface UploadHistoryItem {
  id: string;
  imageData: string;      // Base64 data URL
  thumbnailData: string;  // Compressed thumbnail
  timestamp: number;
  tokenId: string;
  overlayName?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize the IndexedDB database
 */
function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open upload history database');
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('tokenId', 'tokenId', { unique: false });
      }
    };
  });

  return dbPromise;
}

/**
 * Generate a thumbnail from an image data URL
 */
async function generateThumbnail(imageData: string, maxSize: number = 150): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Calculate thumbnail dimensions
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;

      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(imageData); // Fallback to original
    img.src = imageData;
  });
}

/**
 * Save an upload to history
 */
export async function saveToHistory(
  imageData: string,
  tokenId: string,
  overlayName?: string
): Promise<void> {
  try {
    const db = await getDB();
    const thumbnail = await generateThumbnail(imageData);

    const item: UploadHistoryItem = {
      id: `upload-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      imageData,
      thumbnailData: thumbnail,
      timestamp: Date.now(),
      tokenId,
      overlayName,
    };

    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Add the new item
    store.add(item);

    // Clean up old items if we exceed the limit
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      const count = countRequest.result;
      if (count > MAX_HISTORY_ITEMS) {
        // Get oldest items and delete them
        const index = store.index('timestamp');
        const cursorRequest = index.openCursor();
        let deleteCount = count - MAX_HISTORY_ITEMS;

        cursorRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor && deleteCount > 0) {
            store.delete(cursor.primaryKey);
            deleteCount--;
            cursor.continue();
          }
        };
      }
    };

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Failed to save to history:', error);
  }
}

/**
 * Get all uploads from history, sorted by newest first
 */
export async function getHistory(): Promise<UploadHistoryItem[]> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('timestamp');

    return new Promise((resolve, reject) => {
      const items: UploadHistoryItem[] = [];
      const cursorRequest = index.openCursor(null, 'prev'); // Descending order

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          resolve(items);
        }
      };

      cursorRequest.onerror = () => reject(cursorRequest.error);
    });
  } catch (error) {
    console.error('Failed to get history:', error);
    return [];
  }
}

/**
 * Get history items for a specific token
 */
export async function getHistoryByToken(tokenId: string): Promise<UploadHistoryItem[]> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('tokenId');

    return new Promise((resolve, reject) => {
      const items: UploadHistoryItem[] = [];
      const cursorRequest = index.openCursor(IDBKeyRange.only(tokenId), 'prev');

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          resolve(items);
        }
      };

      cursorRequest.onerror = () => reject(cursorRequest.error);
    });
  } catch (error) {
    console.error('Failed to get history by token:', error);
    return [];
  }
}

/**
 * Delete a specific item from history
 */
export async function deleteFromHistory(id: string): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Failed to delete from history:', error);
  }
}

/**
 * Clear all history
 */
export async function clearHistory(): Promise<void> {
  try {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Failed to clear history:', error);
  }
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
