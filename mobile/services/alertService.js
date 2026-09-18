import { supabase } from "./supabase";

// Lambda ampara-alert-trigger (conta 471112979531, us-east-2). O código está em
// aws/ampara-alert-trigger. O sandbox do SNS é por região: os números de teste precisam
// estar verificados em us-east-2.
const URL_AWS_GATEWAY = "https://qmlbzb5gholsqef7ggyzc74wle0lweya.lambda-url.us-east-2.on.aws/";

// Sem resposta nesse prazo o alerta é tratado como falha: a usuária precisa saber logo
// que deve pedir ajuda por outro meio, em vez de ficar olhando uma tela de carregamento.
const TIMEOUT_MS = 15000;

export async function getRecentAlerts(userId, days = 7) {
  const desde = new Date();
  desde.setDate(desde.getDate() - days);

  const { data, error } = await supabase
    .from("alert_logs")
    .select("id, created_at, message, recipient_names, status")
    .eq("user_id", userId)
    .in("status", ["enviado", "legado"])
    .gte("created_at", desde.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    console.log(error);
    return [];
  }

  return data || [];
}

async function chamarAws(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const resposta = await fetch(URL_AWS_GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const corpo = await resposta.json().catch(() => ({}));

    // A Lambda antiga respondia HTTP 200 até quando recusava o pedido ({"erro": "..."}),
    // então o status HTTP sozinho não prova que a mensagem saiu.
    if (!resposta.ok || corpo?.erro) {
      return { enviado: false, detalhe: corpo?.erro || `HTTP ${resposta.status}` };
    }

    const enviados = (corpo?.enviados ?? []).map((e) => e.telefone);
    const falhas = (corpo?.falhas ?? []).map((f) => f.telefone);
    const detalhe = JSON.stringify({ enviados: corpo?.enviados, falhas: corpo?.falhas }).slice(0, 1000);
    return { enviado: enviados.length > 0, enviados, falhas, detalhe };
  } catch (erro) {
    const detalhe = erro.name === "AbortError" ? "sem resposta da AWS" : `falha de rede: ${erro.message}`;
    return { enviado: false, detalhe };
  } finally {
    clearTimeout(timer);
  }
}

// Grava o alerta antes de chamar a AWS e atualiza com o resultado, para que um app
// fechado no meio do envio deixe rastro ("pendente") em vez de sumir.
//
// Os destinatários registrados vêm da resposta da Lambda, não da lista que o app tem em
// memória: a Lambda lê os contatos direto do banco no momento do envio, e a lista do app
// pode estar desatualizada (contato cadastrado depois que a tela abriu).
export async function dispararAlerta({ userId, nomeUsuario, endereco, latitude, longitude, nivelRisco, mensagem }) {
  let logId = null;
  if (userId) {
    const { data, error } = await supabase
      .from("alert_logs")
      .insert([{
        user_id: userId,
        message: mensagem,
        status: "pendente",
        latitude,
        longitude,
        nivel_risco: nivelRisco,
      }])
      .select("id")
      .single();
    if (error) console.error("❌ [Alerta] Falha ao gravar log:", error.message);
    else logId = data.id;
  }

  const resposta = await chamarAws({ nomeUsuario, endereco, latitude, longitude, nivelRisco });
  const resultado = { enviados: [], falhas: [], ...resposta };

  if (logId) {
    const { error } = await supabase
      .from("alert_logs")
      .update({
        status: resultado.enviado ? "enviado" : "falhou",
        recipient_names: resultado.enviados.join(", "),
        detalhe: resultado.detalhe,
      })
      .eq("id", logId);
    if (error) console.error("❌ [Alerta] Falha ao atualizar status:", error.message);
  }

  return resultado;
}
