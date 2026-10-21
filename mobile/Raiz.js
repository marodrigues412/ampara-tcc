import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { CHAVE_TAMANHO_DO_TEXTO, aplicarTamanhoDoTexto, definirTamanhoDoTexto } from './utils/fontesGlobais'
import { aoReiniciarTelas } from './utils/reiniciarTelas'

const CREME = '#F8F4F1'

// Lê o "Tamanho do texto" escolhido no Perfil e só então carrega o App: as telas criam
// os estilos ao serem carregadas, e o tamanho precisa estar definido antes disso.
//
// Quando ela troca o tamanho no Perfil, a Raiz mostra "Ajustando o tamanho do texto",
// aplica o tamanho novo nos estilos e remonta o App já no Perfil, sem passar de novo
// pela abertura nem pela boas-vindas.
export default function Raiz() {
  const [App, setApp] = useState(null)
  const [montagem, setMontagem] = useState(0)
  const [ajustando, setAjustando] = useState(false)
  const [reaberto, setReaberto] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(CHAVE_TAMANHO_DO_TEXTO)
      .catch(() => null)
      .then((tamanho) => {
        definirTamanhoDoTexto(tamanho)
        setApp(() => require('./App').default)
      })
  }, [])

  useEffect(() => aoReiniciarTelas(({ tamanho }) => {
    setAjustando(true)
    // Um quadro para a tela de "ajustando" aparecer antes do trabalho.
    setTimeout(() => {
      aplicarTamanhoDoTexto(tamanho)
      setReaberto(true)
      setMontagem((m) => m + 1)
      setTimeout(() => setAjustando(false), 450)
    }, 60)
  }), [])

  if (!App) return <View style={{ flex: 1, backgroundColor: CREME }} />

  return (
    <View style={{ flex: 1 }}>
      <App key={montagem} reaberto={reaberto} />
      {ajustando && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: CREME, alignItems: 'center', justifyContent: 'center', gap: 14 }} accessibilityLiveRegion="polite">
          <Image source={require('./assets/images/maos-ampara-azul.png')} style={{ width: 84, height: 84 }} resizeMode="contain" />
          <ActivityIndicator color="#273963" />
          <Text style={{ fontFamily: 'Nunito_700Bold', fontSize: 17, color: '#273963' }}>Ajustando o tamanho do texto…</Text>
        </View>
      )}
    </View>
  )
}
