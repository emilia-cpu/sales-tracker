// Storage: Redis when REDIS_URL is set (Vercel "Redis" integration), otherwise a local JSON file for development.
// Everything lives under "st:" keys so it can share a Redis database with other apps.
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "redis";

// Vercel's Redis connect screen may add a prefix or suffix (REDIS_URL_URL, REDIS_URL_REDIS_URL…), so accept any REDIS…URL holding a redis:// address.
const REDIS_URL =
  process.env.REDIS_URL ||
  Object.entries(process.env).find(([k, v]) => /REDIS.*URL/i.test(k) && /^rediss?:\/\//.test(v || ""))?.[1];
const FILE = path.join(process.cwd(), ".data", "sales-target.json");
let tcp;

async function redis(...cmd) {
  if (!tcp) tcp = createClient({ url: REDIS_URL }).connect();
  return (await tcp).sendCommand(cmd.map(String));
}

async function readFile() {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    return {};
  }
}
async function writeFile(data) {
  // On Vercel the app's files are read-only, so without Redis nothing can be saved.
  if (process.env.VERCEL) throw new Error("Redis isn't connected to this Vercel project yet (Storage → Connect Project), so nothing can be saved.");
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data, null, 1));
}

const parse = (v) => {
  try {
    return v == null ? null : JSON.parse(v);
  } catch {
    return null;
  }
};

// A hash of JSON values: { field: value }.
export async function hGetAll(key) {
  if (REDIS_URL) {
    const flat = (await redis("HGETALL", key)) || [];
    const out = {};
    for (let i = 0; i < flat.length; i += 2) out[flat[i]] = parse(flat[i + 1]);
    return out;
  }
  return (await readFile())[key] || {};
}

export async function hGet(key, field) {
  if (REDIS_URL) return parse(await redis("HGET", key, field));
  return (await readFile())[key]?.[field] ?? null;
}

export async function hSet(key, field, value) {
  if (REDIS_URL) {
    if (value == null) await redis("HDEL", key, field);
    else await redis("HSET", key, field, JSON.stringify(value));
    return;
  }
  const all = await readFile();
  all[key] = all[key] || {};
  if (value == null) delete all[key][field];
  else all[key][field] = value;
  await writeFile(all);
}

// Many fields at once (used for the first import).
export async function hSetMany(key, entries) {
  if (!entries.length) return;
  if (REDIS_URL) {
    await redis("HSET", key, ...entries.flatMap(([f, v]) => [f, JSON.stringify(v)]));
    return;
  }
  const all = await readFile();
  all[key] = { ...(all[key] || {}), ...Object.fromEntries(entries) };
  await writeFile(all);
}

// A short lock so only one sheet sync runs at a time: true if taken, false if someone else holds it.
export async function tryLock(name, ms) {
  if (REDIS_URL) return (await redis("SET", name, "1", "NX", "PX", ms)) === "OK";
  const all = await readFile();
  if (all[name] && all[name] > Date.now()) return false;
  all[name] = Date.now() + ms;
  await writeFile(all);
  return true;
}

export async function unlock(name) {
  if (REDIS_URL) return redis("DEL", name);
  const all = await readFile();
  delete all[name];
  await writeFile(all);
}
