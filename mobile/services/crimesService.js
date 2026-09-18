import { supabase } from "./supabase";

// Teto por consulta. 1.000 é o limite que o próprio Supabase impõe (db-max-rows):
// pedir mais que isso devolve 1.000 do mesmo jeito.
const MAX_RESULTADOS = 1000;

// As duas buscas rodam como função no banco (data/nearby_functions.sql e
// data/rls_comunidade.sql), que ordena por distância antes de aplicar o limite. Filtrar
// por caixa aqui no app e cortar em 1.000 devolvia uma tira estreitíssima de latitude —
// em Moema, 69 m de altura por 6 km de largura, que no mapa vira uma fileira de pinos.
// ano = null traz todos os anos (a base vai de 2022 a 2026).
export async function buscarCrimes(userLat, userLon, raioKm = 3, ano = null) {
  const { data, error } = await supabase.rpc("nearby_crimes", {
    user_lat: userLat,
    user_lon: userLon,
    raio_km: raioKm,
    max_resultados: MAX_RESULTADOS,
    ano,
  });

  if (error) {
    console.error("ERRO SUPABASE (nearby_crimes):", error);
    return [];
  }

  return data || [];
}

// Relatos da comunidade vêm pela função, não pela tabela: a RLS de occurrences só mostra
// à usuária os próprios relatos, e nearby_occurrences entrega os de todas sem revelar
// quem registrou.
export async function buscarOcorrencias(userLat, userLon, raioKm = 3) {
  const { data, error } = await supabase.rpc("nearby_occurrences", {
    user_lat: userLat,
    user_lon: userLon,
    raio_km: raioKm,
  });

  if (error) {
    console.error("ERRO SUPABASE (nearby_occurrences):", error);
    return [];
  }

  return data || [];
}
