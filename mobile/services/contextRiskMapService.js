import { supabase } from "./supabase";
import { diaDaSemana, encontrarCelula, periodoDoHorario } from "../utils/contextLayer";

// O mapa só muda quando o importador roda de novo; dentro de uma sessão do app, a mesma
// fatia (município × dia × período) não precisa ser buscada duas vezes. São no máximo
// ~100 células por fatia em São Paulo, bem abaixo do teto de 1.000 linhas do Supabase.
const fatias = new Map();

async function buscarFatia(municipio, diaSemana, periodo) {
  const chave = `${municipio}|${diaSemana}|${periodo}`;
  if (fatias.has(chave)) return fatias.get(chave);

  const { data, error } = await supabase
    .from("context_risk_map")
    .select("municipio, bairro, dia_semana, periodo, registros_com_peso, escore_contexto, nivel_contexto, percentil_33, percentil_66")
    .eq("municipio", municipio)
    .eq("dia_semana", diaSemana)
    .eq("periodo", periodo);

  if (error) {
    console.error("ERRO SUPABASE (context_risk_map):", error);
    // Sem cache: na próxima leitura tenta de novo.
    return null;
  }

  fatias.set(chave, data || []);
  return data || [];
}

// Célula da Camada 1 para onde e quando a usuária está.
// { celula, erro }: celula null + erro false = o mapa não tem esse bairro nesse período
// (contexto indisponível, não baixo); erro true = não deu para consultar.
export async function buscarCelulaDeContexto({ municipio, bairro, data = new Date() }) {
  if (!municipio || !bairro) return { celula: null, erro: false };
  const celulas = await buscarFatia(municipio, diaDaSemana(data), periodoDoHorario(data));
  if (celulas === null) return { celula: null, erro: true };
  return { celula: encontrarCelula(celulas, bairro), erro: false };
}
