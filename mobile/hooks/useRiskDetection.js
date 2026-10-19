import { useState, useEffect, useRef } from 'react';
import { Accelerometer, Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { appendPhoneMotionSample, summarizePhoneMotionWindow } from '../utils/motionWindowFeatures';
import { extractPhoneMotionFeatures, scoreIsolationForest } from '../services/isolationForestMotion';
import { PICO_FORTE_DO_CELULAR_G, acompanharMovimento, movimentoAtipico } from '../services/threeLayerRisk';
import isolationForestMotionModel from '../models/isolationForestMotionModel.json';
import { assinarLocalizacaoEmSegundoPlano } from '../services/monitoramentoEmSegundoPlano';

export const useRiskDetection = () => {
  const [data, setData] = useState({ x: 0, y: 0, z: 0 });
  const [phoneMotionWindow, setPhoneMotionWindow] = useState(null)
  const phoneMotionSamplesRef = useRef([])
  // Movimento atípico do celular mantido por 10 s (princípio de corroboração): só isso
  // conta no corpo sem relógio. Um pico isolado não muda nada.
  const [movimentoCelularSustentado, setMovimentoCelularSustentado] = useState(false)
  const movimentoRef = useRef(null)
  const [stepCount, setStepCount] = useState(0);
  const [location, setLocation] = useState(null);
  const [gpsSpeedDeltaMps, setGpsSpeedDeltaMps] = useState(null)
  const previousGpsSpeedRef = useRef(null)
  // Só a magnitude, para mostrar na tela. O pico forte vira sinal do corpo na Home
  // (threeLayerRisk.PICO_FORTE_DO_CELULAR_G); não existe mais gatilho de impacto aqui.
  const [riskStatus, setRiskStatus] = useState({ magnitude: 0 });
  const [errorMsg, setErrorMsg] = useState(null);


  useEffect(() => {
    let stepSub;
    let subscription;

    const startPedometer = async () => {
      const isAvailable = await Pedometer.isAvailableAsync();
      if (isAvailable) {
        const { status } = await Pedometer.requestPermissionsAsync();
        if (status === 'granted') {
          stepSub = Pedometer.watchStepCount(result => {
            setStepCount(result.steps);
          });
        }
      }
    };

    startPedometer();

    Accelerometer.setUpdateInterval(100);
    subscription = Accelerometer.addListener(accData => {
      setData(accData);
      const { x, y, z } = accData;
      const mag = Math.sqrt(x**2 + y**2 + z**2);
      const sampleTime = Date.now()
      phoneMotionSamplesRef.current = appendPhoneMotionSample(phoneMotionSamplesRef.current, mag, sampleTime)
      const resumo = summarizePhoneMotionWindow(phoneMotionSamplesRef.current)
      setPhoneMotionWindow(resumo)
      const features = extractPhoneMotionFeatures(resumo)
      const anomalia = features ? scoreIsolationForest(features, isolationForestMotionModel)?.anomalyScore ?? null : null
      const picoForte = Number(resumo?.peakMagnitudeG) >= PICO_FORTE_DO_CELULAR_G
      const acompanhado = acompanharMovimento(movimentoRef.current, { t: sampleTime, atipico: movimentoAtipico({ anomalia, picoForte }) })
      movimentoRef.current = acompanhado.estado
      setMovimentoCelularSustentado((antes) => (antes === acompanhado.sustentado ? antes : acompanhado.sustentado))

      // O score de 3 camadas é calculado na Home (services/threeLayerRisk.js); aqui fica
      // só a janela de movimento e o gatilho de impacto forte.

      setRiskStatus({ magnitude: mag.toFixed(2) });
    });

    return () => {
      if (subscription) subscription.remove();
      if (stepSub) stepSub.remove();
    };
  }, [stepCount]);

  // Efeito separado: rastreamento de localização com throttle (50m OU 5min).
  // Fica fora do efeito acima porque aquele reinicia a cada passo do pedômetro —
  // juntos, o GPS seria re-inscrito a cada passo e o throttle nunca funcionaria.
  useEffect(() => {
    let locationSub;
    const updateLocation = loc => {
      const speed = Number(loc.coords.speed)
      const validSpeed = Number.isFinite(speed) && speed >= 0 ? speed : null
      if (validSpeed !== null && previousGpsSpeedRef.current !== null) {
        setGpsSpeedDeltaMps(validSpeed - previousGpsSpeedRef.current)
      }
      if (validSpeed !== null) previousGpsSpeedRef.current = validSpeed
      setLocation(loc)
    }
    // Com o app em segundo plano o watchPositionAsync é pausado pelo expo-location; as
    // posições passam a chegar pela tarefa do serviço em primeiro plano.
    const pararSegundoPlano = assinarLocalizacaoEmSegundoPlano(updateLocation);
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let loc = await Location.getCurrentPositionAsync({});
        updateLocation(loc)

        locationSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 5 * 60 * 1000 },
          (newLoc) => {
            updateLocation(newLoc)
          }
        );
      }
    })();

    return () => {
      pararSegundoPlano();
      if (locationSub) locationSub.remove();
    };
  }, []);

  return {
    data,
    phoneMotionWindow,
    movimentoCelularSustentado,
    gpsSpeedDeltaMps,
    location,
    riskStatus,
    errorMsg,
    stepCount,
  };
};
