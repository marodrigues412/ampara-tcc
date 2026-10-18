import React, { useState } from 'react'
import { LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Brand } from '../constants/brandTheme'

// "Por que seu risco está assim": só o que está pesando, em palavras do dia a dia. Como o
// cálculo funciona (camadas, matriz, modelo, regras dos sensores) fica para o artigo e a
// banca (docs/score_bpm_ml.md), não para a usuária.
const REGIAO = {
  baixo: { texto: 'poucas ocorrências', cor: Brand.green },
  medio: { texto: 'algumas ocorrências', cor: Brand.amber },
  alto: { texto: 'muitas ocorrências', cor: Brand.danger },
}

function linhas(contexto, corpo) {
  const itens = []
  if (contexto?.emLocalSeguro) {
    itens.push({ id: 'local', icone: 'home-outline', nome: 'Local seguro', valor: 'você está nele', cor: Brand.green })
  } else if (!contexto) {
    itens.push({ id: 'regiao', icone: 'map-outline', nome: 'Região', valor: 'calculando', cor: Brand.muted })
  } else if (!contexto.disponivel) {
    itens.push({ id: 'regiao', icone: 'map-outline', nome: 'Região', valor: 'sem dados', cor: Brand.muted })
  } else {
    itens.push({ id: 'regiao', icone: 'map-outline', nome: 'Região', valor: REGIAO[contexto.faixa].texto, cor: REGIAO[contexto.faixa].cor, pesa: contexto.faixa !== 'baixo' })
  }

  const s = corpo?.sinais ?? {}
  if (!corpo?.disponivel) {
    itens.push({ id: 'movimento', icone: 'walk-outline', nome: 'Movimento', valor: 'calculando', cor: Brand.muted })
  } else {
    const agitado = Boolean(corpo.movimentoSustentado) || (s.movimentoRelogio != null && s.movimentoRelogio >= 0.5)
    itens.push({ id: 'movimento', icone: 'walk-outline', nome: 'Movimento', valor: agitado ? 'agitado' : 'normal', cor: agitado ? Brand.amber : Brand.green, pesa: agitado })
    if (s.bpm != null) {
      const acelerado = s.bpm > 0.33
      itens.push({ id: 'batimento', icone: 'heart-outline', nome: 'Batimento', valor: acelerado ? 'acelerado' : 'normal', cor: acelerado ? Brand.amber : Brand.green, pesa: acelerado })
    }
  }
  return itens
}

// Fechada: uma linha com o que está pesando agora.
function resumir(contexto, itens) {
  if (contexto?.emLocalSeguro) return 'Você está em um local seguro'
  const pesando = itens.filter((i) => i.pesa)
  if (!pesando.length) return itens.some((i) => i.valor === 'calculando') ? 'Calculando' : 'Nada pesando agora'
  return pesando.map((i) => (i.id === 'regiao' ? `Região com ${i.valor} agora` : `${i.nome} ${i.valor}`)).join(' · ')
}

export default function CamadasDoRisco({ contexto, corpo, corDaAba }) {
  const [aberta, setAberta] = useState(false)
  const itens = linhas(contexto, corpo)
  const resumo = resumir(contexto, itens)

  const alternar = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(240, 'easeInEaseOut', 'opacity'))
    setAberta((a) => !a)
  }

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

      {aberta && itens.map((i) => (
        <View key={i.id} style={styles.linha}>
          <Ionicons name={i.icone} size={18} color={Brand.muted} />
          <Text style={styles.nome}>{i.nome}</Text>
          <Text style={[styles.valor, { color: i.cor }]}>{i.valor}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  secao: { marginHorizontal: 20, marginTop: 18 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  titulo: { fontSize: 15, fontWeight: '700', color: Brand.ink },
  resumo: { fontSize: 12, color: '#8A8590', marginTop: 2 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  nome: { flex: 1, fontSize: 14, color: Brand.ink },
  valor: { fontSize: 14, fontWeight: '700' },
})
