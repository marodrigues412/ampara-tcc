import React, { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import LiaAvatar from './LiaAvatar'

const CirculoAnimado = Animated.createAnimatedComponent(Circle)

// A Lia dentro do anel de risco: o anel enche devagar até o score (0 a 10) na cor do
// nível. Encher devagar é de propósito: o número "chega" em vez de aparecer pronto.
const DURACAO_MS = 2400
const ESPESSURA = 7

export default function AnelDaLia({ tamanho = 118, score, cor, reacao }) {
  const raio = (tamanho - ESPESSURA) / 2
  const circunferencia = 2 * Math.PI * raio
  const progresso = useSharedValue(0)

  useEffect(() => {
    // Nulo enquanto calcula: o anel fica vazio. Um mínimo visível quando o score é 0,
    // para o anel não parecer quebrado.
    const alvo = score == null ? 0 : Math.max(Math.min(score, 10), 0.15) / 10
    progresso.value = withTiming(alvo, { duration: DURACAO_MS, easing: Easing.bezier(0.4, 0, 0.2, 1) })
  }, [score])

  const propsAnimadas = useAnimatedProps(() => ({ strokeDashoffset: circunferencia * (1 - progresso.value) }))
  const avatar = tamanho - ESPESSURA * 2 - 14

  return (
    <View style={{ width: tamanho, height: tamanho, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={tamanho} height={tamanho} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={tamanho / 2} cy={tamanho / 2} r={raio} stroke="#FFFFFF" strokeOpacity={0.75} strokeWidth={ESPESSURA} fill="none" />
        <CirculoAnimado
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          stroke={cor}
          strokeWidth={ESPESSURA}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circunferencia}
          animatedProps={propsAnimadas}
        />
      </Svg>
      <LiaAvatar size={avatar} reaction={reacao} showRing={false} showBadge={false} />
    </View>
  )
}
