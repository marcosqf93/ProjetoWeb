const fs = require('fs');
const p = String.raw`C:\Users\marcosfigueiredo\Downloads\PodBen\app.js`;
const content = fs.readFileSync(p, 'utf8');

// Find line 1253 (0-indexed: 1252)
const lines = content.split('\n');
const oldLine = lines[1252];
console.log('Old line length:', oldLine.length);
console.log('Old line (first 100):', oldLine.substring(0, 100));

const newLine = `    head.innerHTML = \`<img class="avatar" src="\${columnist.photo}" alt="\${columnist.name}"/><div class="stack"><p class="meta"><span class="news-badge">\${editorial}</span> \${posts.length} \${posts.length === 1 ? 'publicação' : 'publicações'}</p><h1>\${columnist.name}</h1><p class="columnist-hero-bio">\${columnist.bio || 'Colunista PODBEN'}</p><p class="columnist-hero-quote">\${columnist.bio || 'Escrevo para conectar fé, consciência e prática diária com esperança e responsabilidade cristã.'}</p></div>\`;`;

lines[1252] = newLine;
fs.writeFileSync(p, lines.join('\n'), 'utf8');
console.log('Fixed! New line length:', newLine.length);
