const fs = require('fs');
const path = require('path');

const pngFile = path.join(__dirname, '..', 'icons', 'blinter-logo.png');
const base64File = path.join(__dirname, '..', 'icons', 'blinter-logo.png.base64');

if (!fs.existsSync(pngFile)) {
  console.error('PNG icon file not found:', pngFile);
  process.exit(1);
}

const buf = fs.readFileSync(pngFile);
const b64 = buf.toString('base64');
fs.writeFileSync(base64File, `${b64}\n`, 'utf8');
console.log('Wrote', base64File);
