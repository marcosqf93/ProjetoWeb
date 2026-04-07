window.PODBEN_DATA = {
  users: [
    { user: 'robinson', pass: '12345', role: 'alpha', name: 'Admin Alpha' },
    { user: 'fulano', pass: '1234', role: 'columnist', columnistId: 'fulano', name: 'Fulano' },
    { user: 'cicrano', pass: '123', role: 'columnist', columnistId: 'cicrano', name: 'Cicrano' },
  ],
  news: [
    { id: 1, title: 'Rio Aquidauana sobe para 8,39 metros e famílias recebem assistência', summary: 'Cheia levou prefeitura a decretar emergência e acolher famílias afetadas.', createdAt: '2026-02-07T07:44:00-04:00', source: 'Capital News', location: 'Aquidauana/MS', link: 'https://www.capitalnews.com.br/cotidiano/meio-ambiente/rio-aquidauana-sobe-para-839-metros-e-desalojados-recebem-assistencia/435412', image: 'https://www.casacivil.ms.gov.br/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-03-at-16.55.33-1024x239.jpeg' },
    { id: 2, title: 'MS Cidadão chega a Aquidauana com mutirão de serviços', summary: 'Programa estadual leva cidadania, saúde e inclusão social para a cidade.', createdAt: '2026-03-03T16:55:00-04:00', source: 'Casa Civil MS', location: 'Aquidauana/MS', link: 'https://www.casacivil.ms.gov.br/ms-cidadao-chega-a-aquidauana-neste-sabado/', image: 'https://www.casacivil.ms.gov.br/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-03-at-16.55.33-1024x239.jpeg' },
    { id: 3, title: 'CRA de Aquidauana vence e assume liderança da Série B estadual', summary: 'Equipe de Aquidauana alcança liderança em rodada da Série B do Sul-Mato-Grossense.', createdAt: '2025-10-20T21:00:00-04:00', source: 'ge.globo/ms', location: 'Aquidauana/MS', link: 'https://ge.globo.com/ms/futebol/campeonato-sul-mato-grossense/noticia/2025/10/20/cra-de-aquidauana-vence-e-assume-lideranca-da-serie-b.ghtml', image: 'https://s02.video.glbimg.com/x240/13931365.jpg' }
  ],
  photos: [
    { id: 1, url: 'https://www.casacivil.ms.gov.br/wp-content/uploads/2026/03/WhatsApp-Image-2026-03-03-at-16.55.33-1024x239.jpeg', caption: 'MS Cidadão em Aquidauana' },
    { id: 2, url: 'https://s02.video.glbimg.com/x240/13931365.jpg', caption: 'CRA de Aquidauana em campo' },
    { id: 3, url: 'https://picsum.photos/seed/aquidauana1/800/500', caption: 'Centro de Aquidauana' },
    { id: 4, url: 'https://picsum.photos/seed/aquidauana2/800/500', caption: 'Comunidade local' },
    { id: 5, url: 'https://picsum.photos/seed/aquidauana3/800/500', caption: 'Evento do PODBEN' }
  ],
  studies: [
    { id: 1, title: 'Fé e Esperança', bio: 'Panorama bíblico sobre perseverança em tempos difíceis.', cover: 'https://picsum.photos/seed/livro1/280/360', pdf: 'estudos/estudo-fe-esperanca.pdf' },
    { id: 2, title: 'Discipulado Cristão', bio: 'Fundamentos para crescimento espiritual e serviço cristão.', cover: 'https://picsum.photos/seed/livro2/280/360', pdf: 'estudos/estudo-discipulado.pdf' }
  ],
  columnists: [
    { id: 'fulano', name: 'Fulano', photo: 'https://i.pravatar.cc/240?img=68', bio: 'Reflexões sobre sociedade, fé e esperança.' },
    { id: 'cicrano', name: 'Cicrano', photo: 'https://i.pravatar.cc/240?img=12', bio: 'Coluna sobre família, Bíblia e discipulado.' },
    { id: 'maria', name: 'Maria de Lourdes Medeiros Bruno', photo: 'https://i.pravatar.cc/240?img=5', bio: 'Crônicas cristãs com foco no cotidiano.' }
  ],
  columns: [
    { id: 201, columnistId: 'fulano', title: 'Deus no controle em dias difíceis', content: 'Quando tudo parece incerto, Deus permanece soberano e fiel. Essa certeza nos move à oração, à esperança e ao serviço.', createdAt: '2026-03-31T04:49:00-04:00' },
    { id: 202, columnistId: 'fulano', title: 'Uma igreja viva em missão', content: 'A missão da igreja não se limita às quatro paredes: alcança ruas, lares e corações.', createdAt: '2026-03-30T04:50:00-04:00' },
    { id: 203, columnistId: 'fulano', title: 'Tenho fé para recomeçar', content: 'Recomeçar com Cristo não é voltar ao ponto zero, é avançar com nova direção.', createdAt: '2026-03-29T13:16:00-04:00' },
    { id: 204, columnistId: 'cicrano', title: 'Família no altar', content: 'A família fortalecida na Palavra atravessa crises com graça e maturidade.', createdAt: '2026-03-28T08:46:00-04:00' },
    { id: 205, columnistId: 'maria', title: 'Beijaflorando: pequenos gestos, grande amor', content: 'A ternura também é linguagem do Evangelho e transforma ambientes.', createdAt: '2026-03-27T13:58:00-04:00' }
  ],
  bible: {
    antigoTestamento: { 'Gênesis':50,'Êxodo':40,'Levítico':27,'Números':36,'Deuteronômio':34,'Josué':24,'Juízes':21,'Rute':4,'1 Samuel':31,'2 Samuel':24,'1 Reis':22,'2 Reis':25,'1 Crônicas':29,'2 Crônicas':36,'Esdras':10,'Neemias':13,'Ester':10,'Jó':42,'Salmos':150,'Provérbios':31,'Eclesiastes':12,'Cânticos':8,'Isaías':66,'Jeremias':52,'Lamentações':5,'Ezequiel':48,'Daniel':12,'Oseias':14,'Joel':3,'Amós':9,'Obadias':1,'Jonas':4,'Miqueias':7,'Naum':3,'Habacuque':3,'Sofonias':3,'Ageu':2,'Zacarias':14,'Malaquias':4 },
    novoTestamento: { 'Mateus':28,'Marcos':16,'Lucas':24,'João':21,'Atos':28,'Romanos':16,'1 Coríntios':16,'2 Coríntios':13,'Gálatas':6,'Efésios':6,'Filipenses':4,'Colossenses':4,'1 Tessalonicenses':5,'2 Tessalonicenses':3,'1 Timóteo':6,'2 Timóteo':4,'Tito':3,'Filemom':1,'Hebreus':13,'Tiago':5,'1 Pedro':5,'2 Pedro':3,'1 João':5,'2 João':1,'3 João':1,'Judas':1,'Apocalipse':22 }
  }
};
