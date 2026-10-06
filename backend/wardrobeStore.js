// backend/wardrobeStore.js
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags ?? '').split(',');
  return list.map((tag) => String(tag).trim()).filter(Boolean);
}

export function createWardrobeStore({ dataFile, uploadDir }) {
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

  async function add({ buffer, originalname, title = '', note = '', tags }) {
    await mkdir(uploadDir, { recursive: true });
    await mkdir(path.dirname(dataFile), { recursive: true });

    const id = randomUUID();
    const filename = id + path.extname(originalname).toLowerCase();
    await writeFile(path.join(uploadDir, filename), buffer);

    const item = {
      id,
      filename,
      filepath: `/uploads/${filename}`,
      title: String(title).trim(),
      note: String(note).trim(),
      tags: normalizeTags(tags),
      createdAt: new Date().toISOString(),
    };

    const items = await readItems();
    items.push(item);
    await writeFile(dataFile, JSON.stringify(items, null, 2));
    return item;
  }

  return { list, add };
}
