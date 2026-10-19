import * as Location from 'expo-location'

// O pedido de localização do sistema só pode ser recusado uma vez sem custo: depois
// disso o Android e o iPhone deixam de mostrá-lo e a usuária precisa ir às
// configurações. Por isso o app explica antes (tela PermissaoLocalizacao), e o
// monitoramento da Proteção espera aqui a liberação em vez de disparar o pedido sozinho.

const quemEspera = new Set()

const avisar = () => {
  quemEspera.forEach((resolver) => resolver())
  quemEspera.clear()
}

// Ainda dá para mostrar o pedido do sistema e ninguém respondeu: hora de explicar.
export async function precisaExplicarLocalizacao() {
  const { status, canAskAgain } = await Location.getForegroundPermissionsAsync()
  return status === 'undetermined' && canAskAgain !== false
}

// Mostra o pedido do sistema. Devolve true se ela liberou.
export async function pedirLocalizacao() {
  const { status } = await Location.requestForegroundPermissionsAsync()
  if (status === 'granted') avisar()
  return status === 'granted'
}

// Resolve quando a localização estiver liberada: na hora, se já estiver; senão, quando
// ela liberar pela explicação ou pelo aviso da Proteção.
export async function aguardarLocalizacao() {
  const { status } = await Location.getForegroundPermissionsAsync()
  if (status === 'granted') return
  await new Promise((resolver) => quemEspera.add(resolver))
}

// Para o aviso da Proteção: liberada, bloqueada (só pelas configurações) ou ainda dá
// para pedir.
export async function situacaoDaLocalizacao() {
  const { status, canAskAgain } = await Location.getForegroundPermissionsAsync()
  if (status === 'granted') return 'liberada'
  return canAskAgain === false ? 'bloqueada' : 'pode-pedir'
}
