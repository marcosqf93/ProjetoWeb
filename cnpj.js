const BRASIL_API_URL = 'https://brasilapi.com.br/api/cnpj/v1';

export default async (request) => {
  const url = new URL(request.url);
  const cnpj = (url.searchParams.get('cnpj') || '').replace(/\D/g, '');

  if (cnpj.length !== 14) {
    return json({ error: 'Informe um CNPJ válido com 14 dígitos.' }, 400);
  }

  try {
    const response = await fetch(`${BRASIL_API_URL}/${cnpj}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'consulta-aderencia-sesc-ms'
      }
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error) {
    return json({ error: 'Falha ao consultar a BrasilAPI.', details: error.message }, 502);
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
