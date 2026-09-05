import { readFileSync } from 'node:fs';
import { auditFrontendArchive } from '../src/patcher/frontend-audit.js';

const archivePath = process.env.LINLI_ORIGINAL_FEAPP
  ?? 'C:/Users/jwl42/AppData/Roaming/OliviaSoul/client-backups/7cc61827b436631c58cbb32677e7b169.feapp.dat';
console.log(JSON.stringify({ archivePath, ...auditFrontendArchive(readFileSync(archivePath)) }, null, 2));
