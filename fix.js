const fs = require('fs');
const f = 'C:/Users/marcosfigueiredo/Downloads/PodBen/app.js';
let c = fs.readFileSync(f, 'utf8');
const i = c.indexOf('columnist-hero-quote');
const start = c.lastIndexOf('\n', i) + 1;
const end = c.indexOf('\n', i);
const line = c.substring(start, end);
// Replace the bio display to use bio with fallback
let n = line.replace(/\$\{columnist\.bio\}/g, "${columnist.bio || 'Colunista PODBEN'}");
// Replace the hardcoded quote with bio fallback  
const quotePattern = /\u201cEscrevo para conectar.*?\u201d/g;
n = n.replace(quotePattern, "${columnist.bio || 'Escrevo para conectar fé, consciência e prática diária com esperança e responsabilidade cristã.'}");
if (line !== n) {
  c = c.substring(0, start) + n + c.substring(end);
  fs.writeFileSync(f, c, 'utf8');
  console.log('done');
} else {
  console.log('no change');
}
