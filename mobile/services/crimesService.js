import { supabase } from "./supabase";

// ~70 m: é a resolução da grade gravada no banco, não adianta pedir menos que isso.
const CELULA_MINIMA_GRAUS = 0.00063;

// 57014 é o código do Postgres para consulta cancelada por tempo. Acontece na primeira
// leitura de uma região que ainda não está em cache.
const TEMPO_ESGOTADO = "57014";

// Abaixo disso não vale reduzir mais: a área fica menor que a tela e o mapa aparece
// cortado, o que é pior do que mostrar o que já estava desenhado.
const RAIO_MINIMO_KM = 0.6;

// Densidade por célula para o mapa de calor, somada no banco (data/mapa_calor.sql).
//
// Buscar ocorrência por ocorrência custava de 1 a 4 segundos e vinha truncado em 1.000
// registros — o que, numa visão de 12 km, mostrava uma fração do que existe. A grade
// pré-calculada responde em menos de meio segundo e cobre a área inteira.
export async function buscarMapaCalor(userLat, userLon, raioKm, ano = null, grupos = null) {
  // O Supabase corta qualquer resposta em 1.000 linhas, inclusive de função. Se a célula
  // for fina demais para a área pedida, o calor volta truncado e some metade do mapa —
  // medimos 6.461 crimes no lugar de 66 mil numa visão de 6 km. Dimensionar a célula pela
  // área mantém a grade em ~780 células, abaixo do teto, com o detalhe máximo possível.
  const ladoMetros = raioKm * 2 * 1000;
  const celulaGraus = Math.max(CELULA_MINIMA_GRAUS, ladoMetros / 28 / 111000);

  const { data, error } = await supabase.rpc("crimes_mapa_calor", {
    user_lat: userLat,
    user_lon: userLon,
    raio_km: raioKm,
    ano_filtro: ano,
    grupos_filtro: grupos?.length ? grupos : null,
    celula_graus: celulaGraus,
  });

  if (error) {
    // Em vez de desistir, tenta de novo com metade da área: a consulta menor costuma
    // caber no tempo, e meio mapa colorido é melhor que mapa em branco. Uma tentativa
    // só — insistir empilharia consultas lentas e deixaria o app travado.
    if (error.code === TEMPO_ESGOTADO && raioKm > RAIO_MINIMO_KM) {
      return buscarMapaCalor(userLat, userLon, raioKm / 2, ano, grupos);
    }
    console.error("ERRO SUPABASE (crimes_mapa_calor):", error);
    // Nulo, e não lista vazia: quem chama distingue "deu erro, mantenha o que tem" de
    // "esta região realmente não tem ocorrência".
    return { celulas: null, celulaGraus };
  }

  return { celulas: data || [], celulaGraus };
}

// Contagem por tipo na região, para o score, os números dos filtros e a faixa de status.
//
// Antes isso saía de nearby_crimes, que traz ocorrência por ocorrência e ordena por
// distância — 4,3 segundos para algo que é só uma soma, e ainda truncado em 1.000
// registros, o que fazia o score enxergar no máximo mil ocorrências por mais densa que
// fosse a região. Lendo da grade já somada, são 150 ms e o total é real.
export async function buscarResumoCrimes(userLat, userLon, raioKm = 3, ano = null, jaTentou = false) {
  const { data, error } = await supabase.rpc("crimes_resumo", {
    user_lat: userLat,
    user_lon: userLon,
    raio_km: raioKm,
    ano_filtro: ano,
  });

  if (error) {
    // A primeira chamada depois de um tempo parado leva alguns segundos enquanto a
    // conexão "acorda"; a seguinte costuma responder em menos de um. Por isso uma
    // tentativa extra resolve, em vez de deixar a tela sem score.
    if (error.code === TEMPO_ESGOTADO && !jaTentou) {
      return buscarResumoCrimes(userLat, userLon, raioKm, ano, true);
    }
    console.error("ERRO SUPABASE (crimes_resumo):", error);
    return null;
  }

  return Object.fromEntries((data || []).map((linha) => [linha.grupo, linha.total]));
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
