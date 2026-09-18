import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const sns = new SNSClient({});
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
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
// caracteres — a mesma mensagem passa a custar duas ou três vezes mais.
const semAcento = (texto) =>
  String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "");

const mascarar = (telefone) => telefone.slice(0, 5) + "****" + telefone.slice(-2);

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
  // deixaria qualquer conta logada mandar SMS para números arbitrários.
  const contatos = await supabase(`/rest/v1/emergency_contacts?select=telefone&user_id=eq.${usuario.id}`, token);
  const telefones = [...new Set((contatos || []).map((c) => c.telefone).filter((t) => E164.test(t)))];
  if (telefones.length === 0) {
    return resposta(422, { erro: "nenhum contato de emergencia cadastrado" });
  }

  const perfil = await supabase(`/rest/v1/user_profiles?select=nome&id=eq.${usuario.id}`, token);
  const nome = semAcento(perfil?.[0]?.nome || "Uma usuaria do Ampara").slice(0, 40);
  const risco = semAcento(dados.nivelRisco).slice(0, 12);
  const endereco = semAcento(dados.endereco).slice(0, 80);
  const mapa = `https://maps.google.com/?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  const mensagem = `ALERTA AMPARA: ${nome} pode estar em perigo. Risco: ${risco}. ${endereco} ${mapa}`;

  const resultados = await Promise.allSettled(
    telefones.map((telefone) =>
      sns.send(
        new PublishCommand({
          PhoneNumber: telefone,
          Message: mensagem,
          MessageAttributes: {
            "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
          },
        })
      )
    )
  );

  const enviados = [];
  const falhas = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") enviados.push({ telefone: telefones[i], messageId: r.value.MessageId });
    else falhas.push({ telefone: telefones[i], erro: r.reason?.name || String(r.reason) });
  });

  console.log(JSON.stringify({
    usuario: usuario.id,
    enviados: enviados.map((e) => mascarar(e.telefone)),
    falhas: falhas.map((f) => ({ telefone: mascarar(f.telefone), erro: f.erro })),
  }));

  return resposta(enviados.length > 0 ? 200 : 502, { enviados, falhas });
};
