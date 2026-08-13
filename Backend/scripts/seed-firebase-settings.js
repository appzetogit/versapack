/**
 * Copies the Firebase configuration out of .env and the service-account file
 * into business settings, so the admin panel opens populated instead of blank.
 *
 *   node scripts/seed-firebase-settings.js          (report only)
 *   node scripts/seed-firebase-settings.js --apply  (write)
 *
 * One-time: after this, the panel is the source of truth and the env values
 * are only a fallback. Existing saved values are never overwritten -- a blank
 * field is filled, a set one is left alone, so re-running cannot undo an edit
 * somebody made in the panel.
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import mongoose from 'mongoose';
import { FoodBusinessSettings } from '../src/modules/food/admin/models/businessSettings.model.js';

const APPLY = process.argv.includes('--apply');

const WEB_FIELDS = {
    apiKey: 'VITE_FIREBASE_API_KEY',
    authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
    projectId: 'VITE_FIREBASE_PROJECT_ID',
    storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
    appId: 'VITE_FIREBASE_APP_ID',
    measurementId: 'VITE_FIREBASE_MEASUREMENT_ID',
    databaseURL: 'VITE_FIREBASE_DATABASE_URL',
    vapidKey: 'VITE_FIREBASE_VAPID_KEY',
};

/** Only ever prints the shape of a secret, never the secret. */
const preview = (value) => {
    const s = String(value || '');
    if (!s) return '(empty)';
    return s.length <= 12 ? s : `${s.slice(0, 8)}…${s.slice(-4)} (${s.length} chars)`;
};

async function main() {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
    console.log(`connected -> ${mongoose.connection.name}${APPLY ? '' : '  (dry run)'}\n`);

    const settings =
        (await FoodBusinessSettings.findOne().select('+firebaseServiceAccount')) ||
        new FoodBusinessSettings({ companyName: 'Suvio', email: 'admin@suvio.com' });

    console.log('web config:');
    let webChanges = 0;
    for (const [field, envVar] of Object.entries(WEB_FIELDS)) {
        const current = String(settings.firebase?.[field] || '').trim();
        const fromEnv = String(process.env[envVar] || '').trim();

        if (current) {
            console.log(`  =  ${field.padEnd(19)} already set, left alone`);
            continue;
        }
        if (!fromEnv) {
            console.log(`  -  ${field.padEnd(19)} nothing in ${envVar}`);
            continue;
        }
        console.log(`  ->  ${field.padEnd(19)} ${preview(fromEnv)}`);
        if (APPLY) settings.firebase[field] = fromEnv;
        webChanges += 1;
    }

    console.log('\nservice account:');
    let accountChange = false;
    if (String(settings.firebaseServiceAccount || '').trim()) {
        console.log('  =  already saved, left alone');
    } else {
        const inline = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
        const pathValue = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();

        let raw = inline;
        if (!raw && pathValue) {
            const filePath = resolve(process.cwd(), pathValue);
            if (existsSync(filePath)) {
                raw = readFileSync(filePath, 'utf8').trim();
                console.log(`  read from ${pathValue}`);
            } else {
                console.log(`  !  ${pathValue} does not exist`);
            }
        }

        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                // Validated before storing: an unparseable credential saved here
                // would report as "configured" in the panel while push failed.
                for (const field of ['project_id', 'client_email', 'private_key']) {
                    if (!parsed[field]) throw new Error(`missing "${field}"`);
                }
                console.log(`  ->  project ${parsed.project_id}, ${parsed.client_email}`);
                console.log(`      private_key ${preview(parsed.private_key)}`);
                if (APPLY) settings.firebaseServiceAccount = JSON.stringify(parsed);
                accountChange = true;
            } catch (err) {
                console.log(`  !  not usable: ${err.message}`);
            }
        } else {
            console.log('  -  nothing configured in the environment');
        }
    }

    if (APPLY && (webChanges > 0 || accountChange)) {
        await settings.save();
        console.log('\nsaved.');
    } else if (!APPLY) {
        console.log('\nre-run with --apply to write these.');
    } else {
        console.log('\nnothing to change.');
    }

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error('seed failed:', err.message);
    process.exit(1);
});
