// Entrada do app. Antes de qualquer tela:
// 1. o ajuste de fontes (fontesGlobais) passa a valer para todos os estilos;
// 2. a tarefa de localização em segundo plano é definida já na carga, como o TaskManager
//    exige (o Android pode acordar o app só para ela, sem abrir tela nenhuma).
// As telas (App.js) só são carregadas pela Raiz depois de ler o tamanho do texto.
import './utils/fontesGlobais'
import './services/monitoramentoEmSegundoPlano'
import { AppRegistry } from 'react-native'
// O mesmo import do AppEntry.js do Expo: a entrada principal do pacote 'expo' carrega
// módulos nativos extras (como o ExpoAsset), que nem todo build do app tem.
import registerRootComponent from 'expo/src/launch/registerRootComponent'
import Raiz from './Raiz'

// Tarefa que nunca termina: enquanto ela roda, o Android não pausa os timers do JS com o
// app em segundo plano. O módulo ampara-watch a liga e desliga junto com o monitoramento.
AppRegistry.registerHeadlessTask('AmparaMonitor', () => () => new Promise(() => {}))

registerRootComponent(Raiz)
