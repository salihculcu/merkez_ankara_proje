// APK icin web dosyalarini www/ klasorune toplar (Capacitor webDir).
// Kullanim: node build-www.mjs   (sonra: npx cap sync android)
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'www');

// Kiosk icin gereken her sey; editor/sunucu dosyalari ve gelistirme artiklari haric.
const ITEMS = ['index.html', 'styles', 'src', 'lib', 'assets'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);

for (const item of ITEMS) {
  const from = join(ROOT, item);
  if (!existsSync(from)) {
    console.error(`EKSIK: ${item} bulunamadi, paket eksik olur!`);
    process.exitCode = 1;
    continue;
  }
  cpSync(from, join(OUT, item), {
    recursive: true,
    filter: (src) => !src.endsWith('.bak'), // graph.json.bak gibi yedekler APK'ya girmesin
  });
  console.log(`kopyalandi: ${item}`);
}

console.log('www/ hazir. Simdi: npx cap sync android');
