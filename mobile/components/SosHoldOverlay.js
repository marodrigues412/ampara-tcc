import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'

// Contagem que aparece enquanto a usuária segura o SOS.
//
// Fica num componente próprio de propósito: a contagem muda a cada 100 ms, e quando esse
// estado morava na Home, cada tique redesenhava a tela inteira — no iPhone, milhares de
// círculos do mapa de calor. O aparelho não dava conta, o número ficava parado em 3 e
// pulava direto para o envio. Aqui, só este pedaço da tela é redesenhado.
//
// O tempo restante é calculado a partir de fimMs (o instante em que o alerta dispara), e
// não decrementado de um em um: se um tique atrasar, o próximo já mostra o valor certo.
export default function SosHoldOverlay({ fimMs, totalMs }) {
  const [restanteMs, setRestanteMs] = useState(() => Math.max(0, fimMs - Date.now()))

  useEffect(() => {
    let segundoAnterior = Math.ceil((fimMs - Date.now()) / 1_000)
    // 100 ms, e não 1 s: a barra de progresso precisa andar de forma contínua.
    const intervalo = setInterval(() => {
      const restante = Math.max(0, fimMs - Date.now())
      setRestanteMs(restante)
      // Vibra a cada segundo que passa, para a usuária acompanhar sem olhar a tela.
      const segundo = Math.ceil(restante / 1_000)
      if (segundo !== segundoAnterior && segundo > 0) {
        void Haptics.selectionAsync().catch(() => {})
      }
      segundoAnterior = segundo
    }, 100)
    return () => clearInterval(intervalo)
  }, [fimMs])

  const progresso = Math.min(100, 100 - (restanteMs / totalMs) * 100)

  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.centro}>
        <View style={styles.circulo}>
          <Text style={styles.contagem}>{Math.ceil(restanteMs / 1_000)}</Text>
          <Text style={styles.segundos}>seg</Text>
        </View>
        <View style={styles.trilha}>
          <View style={[styles.progresso, { width: `${progresso}%` }]} />
        </View>
        <Text style={styles.titulo}>Continue segurando SOS</Text>
        <Text style={styles.mensagem}>Seu alerta será enviado à rede de apoio</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, backgroundColor: 'rgba(38, 25, 31, 0.78)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  centro: { alignItems: 'center', gap: 10 },
  circulo: { width: 174, height: 174, borderRadius: 87, borderWidth: 5, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  contagem: { color: '#FFF', fontSize: 64, lineHeight: 72, fontWeight: '800', fontVariant: ['tabular-nums'] },
  segundos: { color: '#F9DEE6', fontSize: 15, fontWeight: '700' },
  trilha: { width: 174, height: 6, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.28)', overflow: 'hidden', marginTop: 6 },
  progresso: { height: '100%', borderRadius: 3, backgroundColor: '#FFF' },
  titulo: { color: '#FFF', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  mensagem: { color: '#F9DEE6', fontSize: 14, textAlign: 'center' },
})
