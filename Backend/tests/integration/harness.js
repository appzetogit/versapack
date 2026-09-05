import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * A real MongoDB for the tests that cannot be answered without one.
 *
 * Everything else in tests/ is pure logic, stubbed at the model boundary. That covers
 * the arithmetic but says nothing about the half of this system that IS the database:
 * whether a $geoNear pipeline actually returns what the code assumes, whether a
 * conditional update really does stop two concurrent orders buying the same unit,
 * whether an aggregation groups the way it reads.
 *
 * mongodb-memory-server runs an actual mongod, so these are not mocks. Note it is a
 * standalone, not a replica set: multi-document transactions are unavailable, which is
 * fine because nothing here uses them, but it is why the concurrency tests lean on
 * conditional updates rather than sessions -- exactly as the production code does.
 */

let server = null;

export async function startTestDb() {
    server = await MongoMemoryServer.create();
    await mongoose.connect(server.getUri());
    return mongoose.connection;
}

export async function stopTestDb() {
    await mongoose.disconnect();
    if (server) await server.stop();
    server = null;
}

/** Wipes every collection between tests so one cannot leak into the next. */
export async function clearDb() {
    const { collections } = mongoose.connection;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

/**
 * Builds the indexes the code relies on.
 *
 * Mongoose creates these lazily in the background, and $geoNear FAILS outright
 * without a 2dsphere index rather than falling back to a scan -- so a test that did
 * not wait for them would fail for a reason that has nothing to do with the logic.
 */
export async function ensureIndexes(...models) {
    await Promise.all(models.map((m) => m.createIndexes()));
}

export const oid = () => new mongoose.Types.ObjectId();

/** Indore, as [lng, lat] — the order GeoJSON wants and the one that is easy to get backwards. */
export const point = (lng, lat) => ({ type: 'Point', coordinates: [lng, lat] });

/** ~1 km north / east of the Indore anchor, for readable geo fixtures. */
export const near = (kmNorth = 0, kmEast = 0) =>
    point(75.8577 + kmEast * 0.0097, 22.7196 + kmNorth * 0.009);
