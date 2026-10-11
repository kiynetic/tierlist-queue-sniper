## 2024-05-24 - Synchronous Disk I/O Blocking Main Thread
**Learning:** Using synchronous `fs.readFileSync` and `fs.writeFileSync` on every access to `readStore` inside heavily called Electron IPC handlers causes unnecessary micro-freezes, blocking the main UI thread.
**Action:** Implement an in-memory variable to cache the store state and return it instantly for reads. Ensure that writes update both the cache and the disk file.
