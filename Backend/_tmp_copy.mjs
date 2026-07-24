// Temporary one-shot: copy every collection + index from the .env source cluster
// to the destination cluster. Delete this file when done.
import { MongoClient } from 'mongodb';
import fs from 'fs';

const SCRATCH = 'C:/Users/ompar/AppData/Local/Temp/claude/D--food-backend/86b576e7-a0af-4c69-b697-c05fb239f85a/scratchpad/dst.uri';

const env = fs.readFileSync('.env', 'utf8');
const SRC = env.match(/^MONGODB_URI=(.+)$/m)[1].trim();
const DST = fs.readFileSync(SCRATCH, 'utf8').trim();
const DST_DB = 'latestBackup';
const BATCH = 500;

const src = new MongoClient(SRC, { serverSelectionTimeoutMS: 30000 });
const dst = new MongoClient(DST, { serverSelectionTimeoutMS: 30000 });
await src.connect();
await dst.connect();

const sdb = src.db();
const ddb = dst.db(DST_DB);

const cols = (await sdb.listCollections().toArray())
    .filter((c) => c.type !== 'view')
    .map((c) => c.name)
    .sort();

let grandTotal = 0;
const problems = [];

for (const name of cols) {
    const s = sdb.collection(name);
    const d = ddb.collection(name);
    const expected = await s.countDocuments();

    if (expected > 0) {
        let buf = [];
        for await (const doc of s.find({})) {
            buf.push(doc);
            if (buf.length >= BATCH) {
                await d.insertMany(buf, { ordered: false });
                buf = [];
            }
        }
        if (buf.length) await d.insertMany(buf, { ordered: false });
    } else {
        await ddb.createCollection(name).catch(() => {});
    }

    let idx = 0;
    for (const ix of await s.indexes()) {
        if (ix.name === '_id_') continue;
        const { key, name: ixName, v, ns, ...opts } = ix;
        try {
            await d.createIndex(key, { name: ixName, ...opts });
            idx += 1;
        } catch (e) {
            problems.push(`index ${name}.${ixName}: ${e.message}`);
        }
    }

    const actual = await d.countDocuments();
    grandTotal += actual;
    const verdict = actual === expected ? 'ok' : `MISMATCH (source ${expected})`;
    console.log(`${name.padEnd(45)} ${String(actual).padStart(6)} docs  ${String(idx).padStart(2)} idx  ${verdict}`);
}

problems.forEach((p) => console.log(`! ${p}`));
console.log(`\nTOTAL COPIED: ${grandTotal}`);

await src.close();
await dst.close();
