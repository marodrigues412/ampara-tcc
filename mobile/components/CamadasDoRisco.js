import React, { useState } from 'react'
import { LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Brand } from '../constants/brandTheme'
import { ROTULOS_DO_MODO } from '../services/threeLayerRisk'

// "Por que seu risco está assim", no score de 3 camadas: contexto da região (mapa SSP
// por bairro, dia e período), corpo (sensores disponíveis agora) e o cruzamento das
// duas na matriz 3×3. Fechada, mostra as duas faixas numa linha só.
const ROTULO_DA_FAIXA = { baixo: 'baixo', medio: 'médio', alto: 'alto' }
const COR_DA_FAIXA = { baixo: Brand.green, medio: Brand.amber, alto: Brand.danger }
const MOTIVO_SEM_CONTEXTO = {
  fora_da_cobertura: 'Município fora do mapa',
  bairro_nao_identificado: 'Bairro não identificado e sem estimativa da cidade',
  sem_celula: 'Sem dados deste bairro nem da cidade neste período',
}
const MOTIVO_DA_ESTIMATIVA = {
  bairro_nao_identificado: 'bairro não identificado',
  sem_celula: 'bairro com poucos registros',
}
const PERIODO = { madrugada: 'madrugada', manha: 'manhã', tarde: 'tarde', noite: 'noite' }

const porcento = (valor) => (valor == null ? '—' : `${Math.round(valor * 100)}%`)

function Linha({ icone, cor, fundo, nome, detalhe, faixa }) {
  return (
    <View style={styles.linha}>
      <View style={[styles.icone, { backgroundColor: fundo }]}>
        <Ionicons name={icone} size={16} color={cor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.nome}>{nome}</Text>
        {!!detalhe && <Text style={styles.detalhe}>{detalhe}</Text>}
      </View>
      <Text style={[styles.faixa, { color: faixa ? COR_DA_FAIXA[faixa] : '#8A8590' }]}>
        {faixa ? ROTULO_DA_FAIXA[faixa] : '—'}
      </Text>
    </View>
  )
}

export default function CamadasDoRisco({ contexto, corpo, resultado, rotuloDoNivel, corDoNivel, corDaAba, monitoramentoReforcado }) {
  const [aberta, setAberta] = useState(false)
  const textoContexto = !contexto
    ? 'calculando'
    : contexto.disponivel
      ? `${ROTULO_DA_FAIXA[contexto.faixa]}${contexto.origem === 'cidade' ? ' (estimativa da cidade)' : ''}`
      : 'sem dados'
  const textoCorpo = !corpo?.disponivel ? 'calculando' : ROTULO_DA_FAIXA[corpo.faixa]
  const resumo = `Região ${textoContexto} · corpo ${textoCorpo}`

  const alternar = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(240, 'easeInEaseOut', 'opacity'))
    setAberta((a) => !a)
  }

  const celula = contexto?.celula
  const detalheContexto = !contexto
    ? 'Buscando o bairro…'
    : !contexto.disponivel
      ? MOTIVO_SEM_CONTEXTO[contexto.motivo]
      : `${contexto.origem === 'cidade' ? `Estimativa da cidade (${MOTIVO_DA_ESTIMATIVA[contexto.motivo]})` : celula.bairro.toLowerCase()} · ${PERIODO[celula.periodo]}${contexto.localSeguroAplicado ? ' · local seguro baixou uma faixa' : ''}`

  const s = corpo?.sinais ?? {}
  const sinais = [
    s.bpm != null && `BPM ${porcento(s.bpm)}`,
    s.movimentoCelular != null && `celular ${porcento(s.movimentoCelular)}`,
    s.movimentoRelogio != null && `relógio ${porcento(s.movimentoRelogio)}`,
  ].filter(Boolean).join(' · ')
  const detalheCorpo = corpo?.disponivel
    ? `Sensores: ${ROTULOS_DO_MODO[corpo.modo]} · ${sinais} · escore ${porcento(corpo.escore)}`
    : 'Aguardando os primeiros segundos de movimento'

  return (
    <View style={styles.secao}>
      <TouchableOpacity
        style={styles.cabecalho}
        onPress={alternar}
        accessibilityRole="button"
        accessibilityState={{ expanded: aberta }}
        accessibilityLabel={`Por que seu risco está assim. ${resumo}`}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>Por que seu risco está assim</Text>
          <Text style={styles.resumo}>{resumo}</Text>
        </View>
        <Ionicons name={aberta ? 'chevron-up' : 'chevron-down'} size={18} color={corDaAba} />
      </TouchableOpacity>

      {aberta && (
        <View>
          <Linha icone="map-outline" cor="#3F6A86" fundo="#E9EFF2" nome="Região e horário" detalhe={detalheContexto} faixa={contexto?.disponivel ? contexto.faixa : null} />
          <Linha icone="pulse-outline" cor={Brand.amber} fundo={Brand.amberSoft} nome="Corpo" detalhe={detalheCorpo} faixa={corpo?.disponivel ? corpo.faixa : null} />
          <View style={styles.linha}>
            <Text style={[styles.nome, styles.total]}>Resultado</Text>
            <Text style={[styles.faixa, styles.totalValor, { color: corDoNivel }]}>{rotuloDoNivel}</Text>
          </View>
          {monitoramentoReforcado && (
            <Text style={styles.nota}>Monitoramento reforçado: o app registra sua posição com mais frequência, sem alertas.</Text>
          )}
          <Text style={styles.nota}>
            O resultado cruza as duas faixas numa matriz 3×3. A região vem de registros públicos da SSP; o movimento do celular é avaliado por um modelo de detecção de anomalia, e o relógio, por limites fixos. É uma estimativa, não um diagnóstico.
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  secao: { marginHorizontal: 20, marginTop: 18 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  titulo: { fontSize: 15, fontWeight: '700', color: Brand.ink },
  resumo: { fontSize: 12, color: '#8A8590', marginTop: 2 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 },
  icone: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  nome: { fontSize: 14, color: Brand.ink },
  detalhe: { fontSize: 12, color: '#8A8590', marginTop: 2 },
  faixa: { fontSize: 14, fontWeight: '700' },
  total: { flex: 1, fontWeight: '700' },
  totalValor: { fontSize: 15 },
  nota: { fontSize: 12, color: '#8A8590', marginTop: 4 },
})
