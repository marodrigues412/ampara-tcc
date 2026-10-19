import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { CorAbaInativa, CremeDoSite, TemaDaAba } from '../constants/brandTheme'

// O ícone é o mesmo com a aba aberta ou não: só a cor muda.
const ICONES = {
  'Proteção': 'home-outline',
  Mapa: 'map-outline',
  Dashboard: 'analytics-outline',
  Assistente: 'chatbubble-outline',
  Perfil: 'person-outline',
}

// Barra leve: só ícone e nome, sem caixas nem divisórias. A aba aberta fica na cor
// forte da própria página, com o nome em negrito e o ícone um pouco acima.
export default function AmparaTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.barra, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]
        const selecionada = state.index === index
        const rotulo = options.tabBarLabel ?? options.title ?? route.name
        const cor = selecionada ? (TemaDaAba[route.name]?.forte ?? CorAbaInativa) : CorAbaInativa

        const aoTocar = () => {
          const evento = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
          if (!selecionada && !evento.defaultPrevented) navigation.navigate(route.name, route.params)
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
            activeOpacity={0.7}
          >
            <Ionicons
              name={ICONES[route.name] ?? 'ellipse-outline'}
              size={23}
              color={cor}
              style={selecionada && styles.iconeAtivo}
            />
            <Text style={[styles.rotulo, { color: cor }, selecionada && styles.rotuloAtivo]} numberOfLines={1}>
              {rotulo}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  barra: { flexDirection: 'row', backgroundColor: CremeDoSite, paddingTop: 10, paddingHorizontal: 6 },
  aba: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 48 },
  iconeAtivo: { transform: [{ translateY: -2 }] },
  rotulo: { fontSize: 11, fontWeight: '500' },
  rotuloAtivo: { fontWeight: '700' },
})
