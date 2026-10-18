import { supabase } from "./supabase";
import { encontrarCelula, periodoDoHorario } from "../utils/contextLayer";

// O mapa só muda quando o importador roda de novo; dentro de uma sessão do app, a mesma
// fatia (município × período) não precisa ser buscada duas vezes.
const fatias = new Map();
const COLUNAS = "municipio, bairro, periodo, registros_com_peso, escore_contexto, nivel_contexto, percentil_33, percentil_66";
const COLUNAS_CIDADE = "municipio, periodo, registros_com_peso, bairros_com_registro, escore_contexto, nivel_contexto, percentil_33, percentil_66";
// O Supabase corta qualquer resposta em 1.000 linhas, e a maior fatia (São Paulo, um
// período) tem ~1.400: sem paginar, bairros do fim da lista sumiriam e cairiam na
// estimativa da cidade sem ninguém perceber.
const PAGINA = 1000;

async function buscarTodasAsCelulas(municipio, periodo) {
  const celulas = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from("context_risk_map")
      .select(COLUNAS)
      .eq("municipio", municipio)
      .eq("periodo", periodo)
      .order("bairro")
      .range(inicio, inicio + PAGINA - 1);
    if (error) return { data: null, error };
    celulas.push(...(data || []));
    if (!data || data.length < PAGINA) return { data: celulas, error: null };
  }
}

async function buscarFatia(municipio, periodo) {
  const chave = `${municipio}|${periodo}`;
  if (fatias.has(chave)) return fatias.get(chave);

  const [bairros, cidade] = await Promise.all([
    buscarTodasAsCelulas(municipio, periodo),
    supabase.from("context_risk_map_cidade").select(COLUNAS_CIDADE).eq("municipio", municipio).eq("periodo", periodo).maybeSingle(),
  ]);

  if (bairros.error || cidade.error) {
    console.error("ERRO SUPABASE (context_risk_map):", bairros.error ?? cidade.error);
    // Sem cache: na próxima leitura tenta de novo.
    return null;
  }

  const fatia = { celulas: bairros.data || [], celulaDaCidade: cidade.data ?? null };
  fatias.set(chave, fatia);
  return fatia;
}

// Células da Camada 1 para onde e quando a usuária está.
// { celula, celulaDaCidade, erro }: celula é a do bairro (null se o mapa não tem esse
// bairro no período); celulaDaCidade é a reserva do município; erro true = não deu para
// consultar.
export async function buscarCelulaDeContexto({ municipio, bairro, data = new Date() }) {
  if (!municipio) return { celula: null, celulaDaCidade: null, erro: false };
  const fatia = await buscarFatia(municipio, periodoDoHorario(data));
  if (fatia === null) return { celula: null, celulaDaCidade: null, erro: true };
  return {
    celula: bairro ? encontrarCelula(fatia.celulas, bairro) : null,
    celulaDaCidade: fatia.celulaDaCidade,
    erro: false,
  };
}
