const fs = require('fs');
const path = 'C:/Users/marcosfigueiredo/Downloads/PodBen/app.js';
let content = fs.readFileSync(path, 'utf8');

// The duplicate paragraph has Unicode curly quotes \u201c and \u201d
// Remove the second (duplicate) columnist-hero-quote paragraph
const pattern = /<\/p><p class="columnist-hero-quote">\u201cEscrevo para conectar.*?\u201d<\/p><\/div>`;/;
const replacement = `</p></div>\`;`;

if (pattern.test(content)) {
  content = content.replace(pattern, replacement);
  fs.writeFileSync(path, content, 'utf8');
  console.log('CORRIGIDO: paragrafo duplicado removido com sucesso!');
} else {
  // Try alternate pattern
  const alt = /<\/p><p class="columnist-hero-quote">[\u201c""]Escrevo[^<]*<\/p><\/div>`;/;
  if (alt.test(content)) {
    content = content.replace(alt, `</p></div>\`;`);
    fs.writeFileSync(path, content, 'utf8');
    console.log('CORRIGIDO (padrao alternativo)!');
  } else {
    console.log('PADRAO NAO ENCONTRADO - verifique manualmente a linha 1253');
  }
}
