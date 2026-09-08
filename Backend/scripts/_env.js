/**
 * Loads Backend/.env regardless of where the script was started from.
 *
 * `import 'dotenv/config'` resolves .env against the process working directory,
 * so running a script from the repo root instead of Backend/ found no file, left
 * MONGO_URI unset, and the script exited before doing anything. The failure
 * looks like a misconfigured server rather than a wrong directory, which is a
 * bad way to spend ten minutes.
 *
 * Import this instead of 'dotenv/config' in anything under scripts/.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({
    path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'),
});
