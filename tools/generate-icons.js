const fs = require('fs');
const path = require('path');

const base64File = path.join(__dirname, '..', 'icons', 'blinter-logo.png.base64');
const outFile = path.join(__dirname, '..', 'icons', 'blinter-logo.png');

if (!fs.existsSync(base64File)) {
  console.error('Base64 icon file not found:', base64File);
  process.exit(1);
}

const b64 = fs.readFileSync(base64File, 'utf8').trim();
const buf = Buffer.from(b64, 'base64');
fs.writeFileSync(outFile, buf);
console.log('Wrote', outFile);
