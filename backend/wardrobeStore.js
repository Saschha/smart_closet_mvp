// backend/wardrobeStore.js
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags ?? '').split(',');
  return list.map((tag) => String(tag).trim()).filter(Boolean);
}

export function createWardrobeStore({ dataFile, uploadDir }) {
  // Promise-chain mutex: each read-modify-write of dataFile waits for the previous one.
  let writeQueue = Promise.resolve();

  function serialize(task) {
    const run = writeQueue.then(task);
    // Keep the chain alive even if this task fails.
    writeQueue = run.catch(() => {});
    return run;
  }

  // Write to a temp file and rename it over dataFile, so readers never see a half-written file.
  async function writeItems(items) {
    const tmpFile = `${dataFile}.tmp`;
    await writeFile(tmpFile, JSON.stringify(items, null, 2));
    await rename(tmpFile, dataFile);
  }

  async function readItems() {
    try {
      return JSON.parse(await readFile(dataFile, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  async function list() {
    // Stored oldest first; return newest first for display.
    return (await readItems()).reverse();
  }

  async function add({ buffer, originalname, title = '', note = '', tags, aiTags = null }) {
    await mkdir(uploadDir, { recursive: true });
    await mkdir(path.dirname(dataFile), { recursive: true });

    const id = randomUUID();
    const filename = id + path.extname(originalname).toLowerCase();
    await writeFile(path.join(uploadDir, filename), buffer);

    const item = {
      id,
      filename,
      filepath: `/uploads/${filename}`,
      aiTags,
      title: String(title).trim(),
      note: String(note).trim(),
      tags: normalizeTags(tags),
      createdAt: new Date().toISOString(),
    };

    await serialize(async () => {
      const items = await readItems();
      items.push(item);
      await writeItems(items);
    });
    return item;
  }

  return { list, add };
}
