import {spawnSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const studioRoot = join(root, 'sanity-studio');
const result = spawnSync(process.execPath, [join(studioRoot, 'node_modules', 'sanity', 'bin', 'sanity'), 'build', join(root, '.tmp-studio-output'), '--yes'], {
  cwd: studioRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    SANITY_STUDIO_PROJECT_ID: process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || 'qgyys6fw',
    SANITY_STUDIO_DATASET: process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production',
    SANITY_STUDIO_TITLE: process.env.SANITY_STUDIO_TITLE || 'Fiskum Sveiseservice',
    SANITY_STUDIO_PRESENTATION_URL: process.env.SANITY_STUDIO_PRESENTATION_URL || process.env.SITE_URL || 'https://www.fiskum-sveis.no',
  },
});
if (result.status !== 0) process.exit(result.status || 1);
