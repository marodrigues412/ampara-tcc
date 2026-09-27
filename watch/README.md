# Ampara no Galaxy Watch

O app Wear OS usa o Samsung Health Sensor SDK para receber `HEART_RATE_CONTINUOUS` no relogio e o Wearable Data Layer para enviar cada amostra ao Ampara no celular. O celular recebe o evento diretamente, sem esperar a sincronizacao do Samsung Health/Health Connect. A tela inicial aceita como atual somente uma amostra dos ultimos 10 segundos; leituras antigas nao aparecem como batimento ao vivo.

## Dependencia Samsung

O SDK e distribuido pela Samsung sob licenca propria e nao deve ser versionado junto com o projeto. Baixe o Samsung Health Sensor SDK 1.4.1 e coloque `samsung-health-sensor-api-1.4.1.aar` em `watch/app/libs/`. Esse arquivo e ignorado pelo Git.

## Preparar e instalar

1. Baixe o Samsung Health Sensor SDK 1.4.1 e coloque `samsung-health-sensor-api-1.4.1.aar` em `watch/app/libs/`.
2. No Galaxy Watch 5, habilite o modo de desenvolvedor do Health Platform para testes. No Wear OS 6, a tela pode aparecer como **Health Platform [Dev mode]**. Essa configuracao e apenas para desenvolvimento; a Samsung exige validacao de pacote/assinatura para distribuicao de producao.
3. No Moto G7, conecte o USB e execute `npx expo run:android` dentro de `mobile/`. Expo Go nao inclui o modulo nativo desta integracao. Esse build cria a chave de depuracao compartilhada pelo app do relogio.
4. Abra `watch/` no Android Studio, sincronize o Gradle e execute o app no Galaxy Watch 5. Os dois builds usam o pacote `com.anonymous.amparaapp` e a mesma assinatura; o Wearable Data Layer exige isso e que os dois dispositivos estejam conectados pelo Galaxy Wearable.
5. Abra Ampara no relogio, toque em **Ativar monitoramento** e aceite as permissoes de frequencia cardiaca e atividade em segundo plano quando solicitadas. Em Wear OS 6, elas sao permissao de leitura de frequencia cardiaca e de dados de saude em segundo plano; em versoes anteriores, os nomes podem ser diferentes.
6. Deixe o Ampara aberto no Moto G7. O status e o batimento aparecem na tela inicial quando chega uma amostra recente.

O app do relogio mantem um servico em primeiro plano e uma notificacao persistente, tenta retomar depois de reiniciar quando as permissoes estao concedidas e solicita ao Sensor SDK a entrega de dados agrupados a cada cinco segundos. O sensor e o sistema ainda controlam a cadencia real; bloqueio, economia de bateria, falta de contato com a pele, desconexao Bluetooth ou limitacoes do Health Sensor Service podem atrasar a leitura. Isso e monitoramento de bem-estar, nao dispositivo medico nem garantia de resposta de emergencia.

## Teste

- Com relogio e telefone conectados, confirme que o numero muda sem abrir o Samsung Health.
- Apague a tela do relogio e confirme que a leitura continua chegando; compare o horario exibido no Ampara.
- Desconecte o relogio: o valor ao vivo deve desaparecer apos 10 segundos. O Health Connect continua como alternativa, mas e exibido com a idade real da amostra.
- No iPhone, a integracao direta Wear OS nao e ativada; a aplicacao e mantida sem essa funcionalidade Android.

Referencias oficiais: [Samsung Health Sensor SDK: Getting Started](https://developer.samsung.com/health/sensor/guide/getting-started.html), [permissoes do Sensor SDK](https://developer.samsung.com/health/sensor/guide/permission-request.html), [transferencia de batimentos do Galaxy Watch para o celular](https://developer.samsung.com/codelab/health/heart-rate-data-transfer.html).
