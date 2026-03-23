const SOURCES = {
  natureza: 'https://docs.google.com/spreadsheets/d/1Ein2rd1fPkEokqBwkOu_eJrG9NpYEh5Qp_2QfCUrfJU/export?format=xlsx',
  principal: 'https://docs.google.com/spreadsheets/d/1Ce_dIxYwNhwD4fEduQe72F0PlBJNbB5SGprzDCHfm_o/export?format=xlsx'
};

export default async (request) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const source = SOURCES[id];

  if (!source) {
    return json({ error: 'Planilha remota não encontrada.' }, 404);
  }

  try {
    const response = await fetch(source, {
      headers: {
        'User-Agent': 'consulta-aderencia-sesc-ms'
      }
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return new Response(buffer, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error) {
    return json({ error: 'Falha ao consultar a planilha remota.', details: error.message }, 502);
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
