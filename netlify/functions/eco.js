const https = require('https');

function verificarToken(token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'qaytrvchoisjfpofjbkz.supabase.co',
      path: '/auth/v1/user',
      method: 'GET',
      headers: {
        'apikey': 'sb_publishable_t23KG9nU3jggNcTxExJbwA_I5-PzUFv',
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(new Error('Resposta inválida')); }
        } else {
          reject(new Error('Token inválido'));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método não permitido' };
  }

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const body = JSON.parse(event.body);
    const { messages, system, token } = body;

    if (token) {
      try {
        await verificarToken(token);
      } catch(e) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: { message: 'Sessão expirada. Faça login novamente.' } })
        };
      }
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'API não configurada' }) };
    }

    const payload = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: system,
      messages: messages
    });

    const resposta = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload, 'utf8')
        }
      }, (res) => {
        let chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, body: data });
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    return {
      statusCode: resposta.status,
      headers,
      body: resposta.body
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
