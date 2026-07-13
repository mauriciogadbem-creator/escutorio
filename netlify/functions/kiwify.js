const https = require('https');

const SUPA_URL = 'https://qaytrvchoisjfpofjbkz.supabase.co';
const SUPA_KEY = 'sb_publishable_t23KG9nU3jggNcTxExJbwA_I5-PzUFv';

const KIWIFY_SECRET = process.env.KIWIFY_WEBHOOK_SECRET || '';

function supabaseRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'qaytrvchoisjfpofjbkz.supabase.co',
      path: path,
      method: method,
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function ativarAcesso(email) {
  const validade = new Date();
  validade.setDate(validade.getDate() + 33);

  const check = await supabaseRequest('GET',
    `/rest/v1/usuarios_autorizados?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id`,
    null
  );

  const existe = check.status === 200 && JSON.parse(check.body).length > 0;

  if (existe) {
    await supabaseRequest('PATCH',
      `/rest/v1/usuarios_autorizados?email=eq.${encodeURIComponent(email.toLowerCase())}`,
      { ativo: true, validade: validade.toISOString(), origem: 'kiwify' }
    );
  } else {
    await supabaseRequest('POST',
      `/rest/v1/usuarios_autorizados`,
      { email: email.toLowerCase(), ativo: true, validade: validade.toISOString(), origem: 'kiwify' }
    );
  }
}

async function suspenderAcesso(email) {
  await supabaseRequest('PATCH',
    `/rest/v1/usuarios_autorizados?email=eq.${encodeURIComponent(email.toLowerCase())}`,
    { ativo: false }
  );
}

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método não permitido' };
  }

  try {
    const body = JSON.parse(event.body);

    const email = body?.Customer?.email || body?.customer?.email || body?.email;
    const status = body?.order_status || body?.status || body?.event;

    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'E-mail não encontrado no payload' }) };
    }

    console.log(`Kiwify webhook: status=${status}, email=${email}`);

    const eventosAtivos = ['paid', 'approved', 'active', 'order_approved', 'subscription_active', 'subscription_renewed'];
    const eventosSuspensos = ['refunded', 'cancelled', 'chargeback', 'subscription_cancelled', 'subscription_overdue'];

    if (eventosAtivos.some(e => status && status.toLowerCase().includes(e))) {
      await ativarAcesso(email);
      return { statusCode: 200, body: JSON.stringify({ ok: true, acao: 'ativado', email }) };
    }

    if (eventosSuspensos.some(e => status && status.toLowerCase().includes(e))) {
      await suspenderAcesso(email);
      return { statusCode: 200, body: JSON.stringify({ ok: true, acao: 'suspenso', email }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, acao: 'ignorado', status }) };

  } catch (err) {
    console.error('Erro kiwify.js:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
