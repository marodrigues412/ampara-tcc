import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const sns = new SNSClient({});
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

// WhatsApp é opcional: sem as variáveis abaixo a Lambda envia só SMS.
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TEMPLATE = process.env.WHATSAPP_TEMPLATE || "ampara_alerta_seguranca";
const WHATSAPP_ATIVO = Boolean(WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID);

const E164 = /^\+[1-9]\d{7,14}$/;

const resposta = (statusCode, corpo) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corpo),
});

// Consulta o Supabase com o token da própria usuária: a RLS garante que só voltam os
// dados dela, então a Lambda não precisa (nem deve) guardar a chave secreta.
async function supabase(caminho, token) {
  const r = await fetch(`${SUPABASE_URL}${caminho}`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  });
  return r.ok ? r.json() : null;
}

// Acento ou emoji faz o SMS sair em UCS-2, que corta cada parte de 160 para 70
// caracteres — a mesma mensagem passa a custar duas ou três vezes mais. No WhatsApp não
// há essa limitação, então lá o texto vai completo.
const semAcento = (texto) =>
  String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "");

const mascarar = (telefone) => telefone.slice(0, 5) + "****" + telefone.slice(-2);

async function enviarWhatsapp({ telefone, nome, risco, endereco, coordenadas }) {
  const r = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      // A API não aceita o "+" do formato E.164.
      to: telefone.replace("+", ""),
      type: "template",
      template: {
        name: WHATSAPP_TEMPLATE,
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: nome },
              { type: "text", text: risco },
              { type: "text", text: endereco },
            ],
          },
          {
            // O botão "Ver no mapa" tem URL dinâmica: este valor é o trecho que a Meta
            // acrescenta ao final do endereço cadastrado no template.
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: coordenadas }],
          },
        ],
      },
    }),
  });

  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo?.error?.message || `HTTP ${r.status}`);
  return corpo?.messages?.[0]?.id;
}

async function enviarSms({ telefone, mensagem }) {
  const saida = await sns.send(
    new PublishCommand({
      PhoneNumber: telefone,
      Message: mensagem,
      MessageAttributes: {
        "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
      },
    })
  );
  return saida.MessageId;
}

export const handler = async (event) => {
  if (event.requestContext?.http?.method !== "POST") {
    return resposta(405, { erro: "use POST" });
  }

  const token = (event.headers?.authorization || "").replace(/^Bearer\s+/i, "");
  const usuario = token ? await supabase("/auth/v1/user", token) : null;
  if (!usuario?.id) {
    return resposta(401, { erro: "login necessario" });
  }

  let dados;
  try {
    const bruto = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString() : event.body;
    dados = JSON.parse(bruto || "{}");
  } catch {
    return resposta(400, { erro: "corpo invalido" });
  }

  const latitude = Number(dados.latitude);
  const longitude = Number(dados.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return resposta(400, { erro: "localizacao invalida" });
  }

  // Os destinatários vêm do banco, nunca do corpo da requisição: aceitar a lista do app
  // deixaria qualquer conta logada mandar mensagem para números arbitrários.
  const contatos = await supabase(`/rest/v1/emergency_contacts?select=telefone&user_id=eq.${usuario.id}`, token);
  const telefones = [...new Set((contatos || []).map((c) => c.telefone).filter((t) => E164.test(t)))];
  if (telefones.length === 0) {
    return resposta(422, { erro: "nenhum contato de emergencia cadastrado" });
  }

  const perfil = await supabase(`/rest/v1/user_profiles?select=nome&id=eq.${usuario.id}`, token);
  const nomeCompleto = (perfil?.[0]?.nome || "Uma usuária do Ampara").slice(0, 40);
  const riscoCompleto = String(dados.nivelRisco ?? "").slice(0, 12);
  const enderecoCompleto = String(dados.endereco ?? "").slice(0, 80);
  const coordenadas = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const mensagemSms = `ALERTA AMPARA: ${semAcento(nomeCompleto)} pode estar em perigo. Risco: ${semAcento(riscoCompleto)}. ${semAcento(enderecoCompleto)} https://maps.google.com/?q=${coordenadas}`;

  // Os dois canais saem em paralelo. Um contato conta como avisado se PELO MENOS UM
  // chegou: WhatsApp falha para quem não tem conta, e SMS falha fora do sandbox — mandar
  // pelos dois aumenta muito a chance de alguém ver o alerta.
  const tentativas = telefones.flatMap((telefone) => {
    const canais = [
      enviarSms({ telefone, mensagem: mensagemSms })
        .then((id) => ({ telefone, canal: "sms", id }))
        .catch((e) => Promise.reject({ telefone, canal: "sms", erro: e?.name || String(e) })),
    ];
    if (WHATSAPP_ATIVO) {
      canais.push(
        enviarWhatsapp({
          telefone,
          nome: nomeCompleto,
          risco: riscoCompleto,
          endereco: enderecoCompleto,
          coordenadas,
        })
          .then((id) => ({ telefone, canal: "whatsapp", id }))
          .catch((e) => Promise.reject({ telefone, canal: "whatsapp", erro: e?.message || String(e) }))
      );
    }
    return canais;
  });

  const resultados = await Promise.allSettled(tentativas);
  const sucessos = resultados.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const erros = resultados.filter((r) => r.status === "rejected").map((r) => r.reason);

  const enviados = telefones
    .filter((t) => sucessos.some((s) => s.telefone === t))
    .map((telefone) => ({
      telefone,
      canais: sucessos.filter((s) => s.telefone === telefone).map((s) => s.canal),
    }));
  const falhas = telefones
    .filter((t) => !sucessos.some((s) => s.telefone === t))
    .map((telefone) => ({
      telefone,
      erro: erros.filter((e) => e.telefone === telefone).map((e) => `${e.canal}: ${e.erro}`).join(" | "),
    }));

  console.log(JSON.stringify({
    usuario: usuario.id,
    whatsapp: WHATSAPP_ATIVO,
    enviados: enviados.map((e) => ({ telefone: mascarar(e.telefone), canais: e.canais })),
    falhas: falhas.map((f) => ({ telefone: mascarar(f.telefone), erro: f.erro })),
  }));

  return resposta(enviados.length > 0 ? 200 : 502, { enviados, falhas });
};
