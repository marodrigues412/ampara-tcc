import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

// Para onde o provedor devolve a usuária depois do login. No Expo Go vira um endereço
// exp://..., no app instalado vira mobile://auth-callback (o "scheme" do app.json).
// Os dois precisam estar liberados nas Redirect URLs do Supabase.
export const urlDeRetorno = () => Linking.createURL("auth-callback");

// O Supabase pode devolver a sessão de duas formas: um "code" para trocar (fluxo PKCE)
// ou os tokens direto no fragmento da URL. Tratamos as duas para não depender de como o
// cliente foi configurado.
async function sessaoDaUrl(url) {
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
  if (error) throw error;

  const resultado = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  // "cancel" e "dismiss" são a usuária fechando a janela: não é erro, só não entrou.
  if (resultado.type !== "success") return null;

  const sessao = await sessaoDaUrl(resultado.url);
  await garantirPerfil(sessao);
  return sessao;
}
