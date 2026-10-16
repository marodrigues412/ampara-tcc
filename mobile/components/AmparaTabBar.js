import React from 'react'
import { LayoutAnimation, Platform, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Brand } from '../constants/brandTheme'

// Ícone de cada aba: [selecionada, normal].
const ICONES = {
  // Escudo: a aba reúne o que protege a usuária (score, monitoramento, rotina e SOS).
  'Proteção': ['shield-checkmark', 'shield-checkmark-outline'],
  Mapa: ['map', 'map-outline'],
  Dashboard: ['stats-chart', 'stats-chart-outline'],
  Assistente: ['chatbubble-ellipses', 'chatbubble-ellipses-outline'],
  Perfil: ['person-circle', 'person-circle-outline'],
}

const BOLHA = 54
// O recorte é um círculo da cor do fundo da tela, um pouco maior que a bolha, que "come"
// a borda de cima da barra. Só a metade de baixo aparece (a de cima se confunde com o
// fundo), e o contorno dela continua a borda da barra: é o efeito de encaixe da referência.
const RECORTE = BOLHA + 12
const ALTURA_BARRA = 64

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

// Barra de navegação no estilo "bolha": a aba selecionada sobe num círculo com o ícone
// azul do app, encaixado num recorte da barra; as outras ficam em linha, em cinza.
export default function AmparaTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.area, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.barra}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]
          const selecionada = state.index === index
          const rotulo = options.tabBarLabel ?? options.title ?? route.name
          const [iconeAtivo, iconeNormal] = ICONES[route.name] ?? ['ellipse', 'ellipse-outline']

          const aoTocar = () => {
            const evento = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
            if (!selecionada && !evento.defaultPrevented) {
              // A bolha "pula" de uma aba para outra em vez de sumir e aparecer.
              LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'))
              navigation.navigate(route.name, route.params)
            }
          }

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.aba}
              onPress={aoTocar}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: selecionada }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? rotulo}
              activeOpacity={0.8}
            >
              {selecionada ? (
                <>
                  <View style={styles.recorteJanela}>
                    <View style={styles.recorte} />
                  </View>
                  <View style={styles.bolha}>
                    <Ionicons name={iconeAtivo} size={26} color={Brand.blue} />
                  </View>
                  <Text style={[styles.rotulo, styles.rotuloAtivo]} numberOfLines={1}>{rotulo}</Text>
                </>
              ) : (
                <>
                  <Ionicons name={iconeNormal} size={23} color="#9A8C93" />
                  <Text style={styles.rotulo} numberOfLines={1}>{rotulo}</Text>
                </>
              )}
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Fundo igual ao da tela, para a barra parecer flutuar e o recorte se confundir com ele.
  area: { backgroundColor: Brand.canvas, paddingHorizontal: 12, paddingTop: 22 },
  barra: {
    height: ALTURA_BARRA,
    flexDirection: 'row',
    backgroundColor: Brand.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Brand.line,
    shadowColor: '#291D23',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  aba: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  // -1 para cobrir também a linha da borda da barra, que fica fora da área da aba.
  recorteJanela: { position: 'absolute', top: -1, width: RECORTE, height: RECORTE / 2 + 1, overflow: 'hidden' },
  recorte: {
    width: RECORTE,
    height: RECORTE,
    marginTop: -RECORTE / 2,
    borderRadius: RECORTE / 2,
    backgroundColor: Brand.canvas,
    borderWidth: 1,
    borderColor: Brand.line,
  },
  bolha: {
    position: 'absolute',
    top: -BOLHA / 2 - 4,
    width: BOLHA,
    height: BOLHA,
    borderRadius: BOLHA / 2,
    backgroundColor: Brand.blueSoft,
    borderWidth: 1.5,
    borderColor: Brand.blue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Brand.blue,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  rotulo: { fontSize: 11, fontWeight: '600', color: '#9A8C93' },
  // Fica embaixo da bolha, no lugar onde o ícone estaria.
  rotuloAtivo: { color: Brand.ink, fontWeight: '800', marginTop: 26 },
})
