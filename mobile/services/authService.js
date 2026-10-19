import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

// Para onde o provedor devolve a usuária depois do login: sempre o mesmo endereço,
// mobile://auth-callback (o "scheme" do app.json), liberado nas Redirect URLs do Supabase.
//
// Antes vinha de Linking.createURL, que no Expo Go e no build de desenvolvimento dá
// exp://<IP do Mac>:8081/--/auth-callback: muda com a rede e não batia com a lista, então
// o Supabase devolvia para o Site URL (localhost) e a janela nunca voltava ao app. Um
// endereço fixo funciona em todos os builds: no iPhone, a janela de login do sistema
// (ASWebAuthenticationSession) fecha sozinha ao chegar no esquema "mobile", mesmo no
// Expo Go; no Android, o build registra o esquema pelo app.json.
export const URL_DE_RETORNO = "mobile://auth-callback";
export const urlDeRetorno = () => URL_DE_RETORNO;

// Log do login social no Metro (só em desenvolvimento), sem tokens nem códigos: mostra
// para onde o app pediu a volta e como a janela do provedor fechou.
const semSegredos = (url) => String(url ?? "")
  .replace(/(code|access_token|refresh_token|provider_token|provider_refresh_token)=[^&#]*/g, "$1=…");
const registrar = (titulo, dados) => {
  if (typeof __DEV__ !== "undefined" && __DEV__) console.log(titulo, JSON.stringify(dados));
};

// Marca no AsyncStorage que a boas-vindas já foi vista neste celular. Sair da conta
// apaga a marca, e a boas-vindas volta a aparecer.
export const CHAVE_BOAS_VINDAS = "ampara:boasVindasVista";

// O Supabase pode devolver a sessão de duas formas: um "code" para trocar (fluxo PKCE)
// ou os tokens direto no fragmento da URL. Tratamos as duas para não depender de como o
// cliente foi configurado.
export async function sessaoDaUrl(url) {
  const { queryParams } = Linking.parse(url);
  if (queryParams?.error_description) throw new Error(queryParams.error_description);

  if (queryParams?.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(String(queryParams.code));
    if (error) throw error;
    return data.session;
  }

  const fragmento = new URLSearchParams(url.split("#")[1] ?? "");
  const access_token = fragmento.get("access_token");
  const refresh_token = fragmento.get("refresh_token");
  if (!access_token || !refresh_token) throw new Error("O provedor não devolveu a sessão.");

  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  return data.session;
}

// Quem entra por Google ou Apple nunca passou pela tela de cadastro, então não tem linha
// em user_profiles — sem isso a Home mostraria "Usuária" no lugar do nome.
async function garantirPerfil(sessao) {
  const usuario = sessao?.user;
  if (!usuario) return;

  const { data: perfil } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("id", usuario.id)
    .maybeSingle();
  if (perfil) return;

  const nome = usuario.user_metadata?.full_name
    || usuario.user_metadata?.name
    || usuario.email?.split("@")[0]
    || "Usuária";

  const { error } = await supabase.from("user_profiles").insert([{ id: usuario.id, nome }]);
  if (error) console.error("❌ [Auth] Falha ao criar perfil:", error.message);
}

export async function entrarComProvedor(provider) {
  const redirectTo = urlDeRetorno();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      // Sem isso o provedor reaproveita a sessão aberta no navegador e entra direto, sem
      // perguntar nada — inclusive criando conta nova em silêncio se a anterior sumiu.
      queryParams: { prompt: "select_account" },
    },
  });
  // O redirect_to que vai dentro da URL do provedor é o que o Supabase compara com a lista
  // de Redirect URLs; se não bater, ele devolve para o Site URL (localhost).
  // Leitura manual: o URL do React Native não implementa searchParams por completo.
  const achado = /[?&]redirect_to=([^&#]*)/.exec(data?.url ?? "");
  const redirectToNaUrl = achado ? decodeURIComponent(achado[1]) : null;
  registrar("[login] pedido", {
    provider,
    urlDeRetorno: redirectTo,
    redirectToNaUrl,
    urlDoProvedor: semSegredos(data?.url),
    erro: error?.message ?? null,
  });
  if (error) throw error;

  const resultado = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  registrar("[login] janela fechou", { tipo: resultado.type, voltouPara: semSegredos(resultado.url) });
  // "cancel" e "dismiss" são a usuária fechando a janela: não é erro, só não entrou.
  if (resultado.type !== "success") return null;

  const sessao = await sessaoDaUrl(resultado.url).catch((erro) => {
    registrar("[login] erro ao abrir a sessão", { mensagem: erro?.message });
    throw erro;
  });
  registrar("[login] sessão aberta", { temSessao: Boolean(sessao) });
  await garantirPerfil(sessao);
  return sessao;
}

// "Esqueci minha senha": o Supabase manda um e-mail com um link que volta para o app
// (mesmo endereço de retorno do login com Google, já liberado nas Redirect URLs).
export async function pedirNovaSenha(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: urlDeRetorno() });
  if (error) throw error;
}

// O link de recuperação chega com type=recovery no fragmento (#...) da URL.
export const ehLinkDeNovaSenha = (url) => typeof url === "string" && /[#&?]type=recovery/.test(url);
