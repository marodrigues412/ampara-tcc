import React, { useCallback, useState } from 'react'
import { LayoutAnimation, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../services/supabase'
import { listarCompromissos, listarLocaisSeguros } from '../services/routineService'
import { fecharPrimeirosPassos, primeirosPassosFechados, treinoDoSosFeito } from '../services/tutorial'
import { Brand, TemaDaAba } from '../constants/brandTheme'

const TEMA = TemaDaAba['Proteção']

// Primeiros passos na Proteção: o que deixa o Ampara pronto para agir, com progresso. O
// ✓ vem de dados reais (contato salvo, casa cadastrada, treino feito, rotina criada). Os
// três primeiros são os mesmos do "próximo passo" do Perfil. A lista some quando tudo
// estiver feito ou quando ela fechar.
export default function PrimeirosPassos({ navigation }) {
  const [passos, setPassos] = useState(null)
  const [fechada, setFechada] = useState(true)

  useFocusEffect(useCallback(() => {
    let ativo = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const id = data?.user?.id
      if (!id) return
      const [rede, locais, rotina, treino, foiFechada] = await Promise.all([
        supabase.from('emergency_contacts').select('id').eq('user_id', id),
        listarLocaisSeguros(id),
        listarCompromissos(id),
        treinoDoSosFeito(),
        primeirosPassosFechados(),
      ])
      if (!ativo) return
      const temCasa = locais.some((l) => String(l.tipo ?? l.nome ?? '').toLowerCase().includes('casa'))
      setPassos([
        { id: 'rede', feito: (rede.data ?? []).length > 0, texto: 'Escolher quem recebe seu alerta', tela: 'EmergencyContacts' },
        { id: 'casa', feito: temCasa, texto: 'Cadastrar sua casa como local seguro', tela: 'SafeLocations' },
        { id: 'treino', feito: treino, texto: 'Treinar o SOS', tela: 'TreinoSos' },
        { id: 'rotina', feito: rotina.some((c) => c.ativo !== false), texto: 'Montar sua rotina', tela: 'Routine' },
      ])
      setFechada(foiFechada)
    })()
    return () => { ativo = false }
  }, []))

  if (!passos || fechada) return null
  const feitos = passos.filter((p) => p.feito).length
  if (feitos === passos.length) return null
  const proximo = passos.find((p) => !p.feito)

  const fechar = () => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'))
    setFechada(true)
    fecharPrimeirosPassos()
  }

  return (
    <View style={styles.secao}>
      <View style={styles.cabecalho}>
        <Text style={styles.titulo}>Primeiros passos</Text>
        <Text style={styles.contagem}>{feitos} de {passos.length}</Text>
        <TouchableOpacity onPress={fechar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fechar primeiros passos">
          <Ionicons name="close" size={18} color="#8A8590" />
        </TouchableOpacity>
      </View>
      <View style={styles.trilha}><View style={[styles.barra, { width: `${(feitos / passos.length) * 100}%` }]} /></View>
      {passos.map((p, i) => (
        <TouchableOpacity
          key={p.id}
          style={styles.passo}
          onPress={p.feito ? undefined : () => navigation.navigate(p.tela)}
          disabled={p.feito}
          accessibilityRole="button"
          accessibilityState={{ checked: p.feito, disabled: p.feito }}
          accessibilityLabel={`${p.texto}${p.feito ? ', feito' : ''}`}
        >
          <View style={[styles.marca, p.feito ? styles.marcaFeita : p === proximo ? styles.marcaProxima : null]}>
            {p.feito
              ? <Ionicons name="checkmark" size={14} color={Brand.green} />
              : <Text style={[styles.numero, p === proximo && { color: TEMA.forte }]}>{i + 1}</Text>}
          </View>
          <Text style={[styles.texto, p.feito && styles.textoFeito, p === proximo && styles.textoProximo]}>{p.texto}</Text>
          {!p.feito && <Ionicons name="chevron-forward" size={16} color={p === proximo ? TEMA.forte : '#C9C2C6'} />}
        </TouchableOpacity>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  secao: { marginHorizontal: 20, marginTop: 20 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  titulo: { flex: 1, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: '700', color: '#8A8590' },
  contagem: { fontSize: 12, fontWeight: '800', color: TEMA.forte },
  trilha: { height: 6, borderRadius: 3, backgroundColor: '#EFE4E8', overflow: 'hidden', marginBottom: 4 },
  barra: { height: 6, borderRadius: 3, backgroundColor: TEMA.forte },
  passo: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  marca: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3EFF1', alignItems: 'center', justifyContent: 'center' },
  marcaFeita: { backgroundColor: Brand.mint },
  marcaProxima: { backgroundColor: TEMA.fundo },
  numero: { fontSize: 13, fontWeight: '800', color: '#8A8590' },
  texto: { flex: 1, fontSize: 15, color: Brand.ink },
  textoFeito: { color: '#8A8590' },
  textoProximo: { fontWeight: '700' },
})
