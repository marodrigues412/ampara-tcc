import { supabase } from './supabase'
import { linhaNoFormatoAntigo, montarLinhaDaAvaliacao } from './riskAssessmentRow'

export const RISK_ASSESSMENT_SAMPLE_INTERVAL_MS = 30_000

export async function getRecentHeartRateSamples(userId, now = Date.now()) {
  if (!userId) return []

  const { data, error } = await supabase
    .from('risk_assessments')
    .select('bpm, measured_at')
    .eq('user_id', userId)
    // Avaliações só com o celular (cenários 1 e 2) não têm BPM.
    .not('bpm', 'is', null)
    .gte('measured_at', new Date(now - 60 * 60 * 1000).toISOString())
    .lte('measured_at', new Date(now + 10_000).toISOString())
    .order('measured_at', { ascending: true })
    .limit(200)

  if (error) throw error
  return (data || []).map(row => ({
    bpm: Number(row.bpm),
    timestamp: Date.parse(row.measured_at),
  }))
}

const COLUNA_INEXISTENTE = 'PGRST204'
const VALOR_NULO_PROIBIDO = '23502'
let bancoSemMigracao = false

export async function saveRiskAssessment(userId, assessment) {
  if (!userId || !assessment?.measuredAt) return

  const linha = montarLinhaDaAvaliacao(userId, assessment)

  if (!bancoSemMigracao) {
    const { error } = await upsert(linha)
    if (!error) return
    if (error.code !== COLUNA_INEXISTENTE && error.code !== VALOR_NULO_PROIBIDO) throw error
    bancoSemMigracao = true
    console.warn('risk_assessments sem a migração do score de 3 camadas; gravando no formato antigo.')
  }

  if (linha.bpm == null) return
  const { error } = await upsert(linhaNoFormatoAntigo(linha))
  if (error) throw error
}

function upsert(linha) {
  return supabase.from('risk_assessments').upsert(linha, { onConflict: 'user_id,measured_at' })
}

export async function getDailyRiskAssessmentReport(days = 7) {
  const from = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase.rpc('risk_assessment_daily_report', { p_from: from })
  if (error) throw error
  return data || []
}
