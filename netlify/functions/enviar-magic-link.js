const https = require('https');

const SUPABASE_URL = 'https://qaytrvchoisjfpofjbkz.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

const EMAIL_TEMPLATE = `
<div style="background:#1E0E06;padding:40px 32px;font-family:Georgia,serif;max-width:480px;margin:0 auto;">
  <p style="color:#C4956A;font-size:22px;font-weight:300;font-style:italic;margin:0 0 24px;">Escutório</p>
  <p style="color:#F2E8D9;font-size:16px;font-weight:300;line-height:1.8;margin:0 0 16px;">Alguém pediu acesso ao Escutório com este endereço de e-mail.</p>
  <p style="color:#F2E8D9;font-size:16px;font-weight:300;line-height:1.8;margin:0 0 32px;">Se foi você, clique no botão abaixo para entrar. O link expira em 15 minutos.</p>
  <a href="{{LINK}}" style="display:inline-block;background:transparent;border:1px solid #C4956A;color:#E8C87A;font-family:'Courier New',monospace;font-size:11px;letter-spacing:3px;text-transform:uppercase;padding:14px 28px;text-decoration:none;">Entrar no Escutório</a>
  <p style="color:rgba(242,232,217,.25);font-size:12px;line-height:1.8;margin:32px 0 0;">Se não foi você quem pediu este acesso, ignore este e-mail.</p>
</div>`;

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function gerarMagicLink(email, redirectTo) {
  const res = await httpsRequest({
    hostname: 'qaytrvchoisjfpofjbkz.supabase.co',
    path: '/auth/v1/admin/generate-link',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  }, {
    type: 'magiclink',
    email: email,
    options: { redirect_to: redirectTo }
  });

  if (res.status !== 200) throw new Error('Erro ao gerar magic link: ' + res.body);
  const data = JSON.parse(res.body);
  return data.action_link;
}

async function enviarEmail(email, link) {
  const html = EMAIL_TEMPLATE.replace('{{LINK}}', link);
  const res = await httpsRequest({
    hostname: 'api.brevo.com',
    path: '/v3/smtp/email',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': BREVO_API_KEY
    }
  }, {
    sender: { name: 'Escutório', email: 'contato@escutorio.com.br' },
    to: [{ email: email }],
    subject: 'Seu acesso ao Escutório',
    htmlContent: html
  });

  if (res.status !== 201) throw new Error('Erro ao enviar e-mail: ' + res.body);
  return true;
}

async function verificarEmailAutorizado(email) {
  const res = await httpsRequest({
    hostname: 'qaytrvchoisjfpofjbkz.supabase.co',
    path: `/rest/v1/rpc/verificar_email_autorizado`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  }, { email_input: email.toLowerCase() });

  if (res.status !== 200) return false;
  return res.body === 'true';
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
    const { email, redirectTo } = JSON.parse(event.body);

    if (!email || !email.includes('@')) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'E-mail inválido' }) };
    }

    const autorizado = await verificarEmailAutorizado(email);
    if (!autorizado) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Este e-mail não tem acesso ao Escutório.' }) };
    }

    const link = await gerarMagicLink(email, redirectTo || 'https://escutorio.com.br/conselheiro_sentimental.html');
    await enviarEmail(email, link);

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error('Erro enviar-magic-link:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
