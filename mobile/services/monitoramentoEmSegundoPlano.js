import { AppState, Platform } from 'react-native'
import { EventEmitter } from 'expo-modules-core'
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { getWatchHeartRateModule } from '../modules/ampara-watch'

// Monitoramento com o app minimizado ou a tela apagada (só Android, por enquanto).
//
// Com o app em segundo plano o Android congela o que a Home usa: o expo-location para o
// watchPositionAsync, os sensores param e os timers do JS deixam de disparar. Aqui ficam
// as três peças que seguram o monitoramento:
// - o serviço em primeiro plano do expo-location (a notificação fixa), que mantém o
//   processo vivo e entrega a localização numa tarefa do TaskManager;
// - o tique nativo do módulo ampara-watch, uma vez por segundo, que move o nível
//   sustentado e a contagem do alerta mesmo sem os timers do JS;
// - o wake lock parcial que acompanha o tique, para a CPU não dormir com a tela apagada.
// O acelerômetro do celular continua parado em segundo plano; o relógio segue chegando.

export const TAREFA_LOCALIZACAO = 'ampara-localizacao-segundo-plano'
const INTERVALO_DO_TIQUE_MS = 1000

const ouvintesDeLocalizacao = new Set()

// Precisa rodar quando o módulo é carregado (App.js o importa), antes de o Android
// entregar a primeira posição.
TaskManager.defineTask(TAREFA_LOCALIZACAO, ({ data, error }) => {
  if (error || !data?.locations?.length) return
  const maisRecente = data.locations[data.locations.length - 1]
  if (AppState.currentState !== 'active') console.log('[segundo plano] posição recebida')
  ouvintesDeLocalizacao.forEach((ouvinte) => ouvinte(maisRecente))
})

let emissor
function emissorDoModulo() {
  const modulo = getWatchHeartRateModule()
  if (!modulo) return null
  if (!emissor) emissor = new EventEmitter(modulo)
  return emissor
}

export function assinarLocalizacaoEmSegundoPlano(ouvinte) {
  ouvintesDeLocalizacao.add(ouvinte)
  return () => ouvintesDeLocalizacao.delete(ouvinte)
}

export function assinarTiqueDoMonitor(ouvinte) {
  try {
    const assinatura = emissorDoModulo()?.addListener('onMonitorTick', ouvinte)
    return () => assinatura?.remove()
  } catch {
    return () => {}
  }
}

// Tem que ser chamado com o app aberto: o Android não deixa ligar o serviço de
// localização em primeiro plano a partir do segundo plano.
export async function ligarMonitoramentoEmSegundoPlano() {
  if (Platform.OS !== 'android') return false
  try {
    const { status } = await Location.getForegroundPermissionsAsync()
    if (status !== 'granted') return false

    const jaLigado = await Location.hasStartedLocationUpdatesAsync(TAREFA_LOCALIZACAO)
    if (!jaLigado) {
      await Location.startLocationUpdatesAsync(TAREFA_LOCALIZACAO, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 50,
        timeInterval: 60 * 1000,
        foregroundService: {
          notificationTitle: 'Ampara está com você',
          notificationBody: 'Monitoramento ativo. Toque para abrir.',
          notificationColor: '#283D68',
          killServiceOnDestroy: true,
        },
      })
    }
    getWatchHeartRateModule()?.startBackgroundKeepAlive(INTERVALO_DO_TIQUE_MS)
    return true
  } catch (erro) {
    console.log('[segundo plano] não foi possível ligar:', erro?.message)
    return false
  }
}

export async function desligarMonitoramentoEmSegundoPlano() {
  if (Platform.OS !== 'android') return
  try {
    getWatchHeartRateModule()?.stopBackgroundKeepAlive()
    if (await Location.hasStartedLocationUpdatesAsync(TAREFA_LOCALIZACAO)) {
      await Location.stopLocationUpdatesAsync(TAREFA_LOCALIZACAO)
    }
  } catch (erro) {
    console.log('[segundo plano] não foi possível desligar:', erro?.message)
  }
}
