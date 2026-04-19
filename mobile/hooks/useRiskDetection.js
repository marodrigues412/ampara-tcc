// src/hooks/useRiskDetection.js
import { useState, useEffect } from 'react';
import { Accelerometer, Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';

export const useRiskDetection = () => {
  const [data, setData] = useState({ x: 0, y: 0, z: 0 });
  const [stepCount, setStepCount] = useState(0);
  const [location, setLocation] = useState(null);
  const [riskStatus, setRiskStatus] = useState({ isHighRisk: false, magnitude: 0 });
  const [errorMsg, setErrorMsg] = useState(null);

  // Constante de Limiar de Risco (G-Force)
  const RISK_THRESHOLD = 1.8;

  useEffect(() => {
  // 1. Iniciar Podômetro
    const stepSub = Pedometer.watchStepCount(result => {
      setStepCount(result.steps);
    });

    // 1. Iniciar Sensores
    Accelerometer.setUpdateInterval(100);
    const subscription = Accelerometer.addListener(accelerometerData => {
      setData(accelerometerData);
      
      const { x, y, z } = accelerometerData;
      const mag = Math.sqrt(x**2 + y**2 + z**2);
      
      // NOVA LÓGICA: Impacto (G > 1.8) E em movimento (Passos > 0)
      const hasImpact = mag > RISK_THRESHOLD;
      const isWalking = stepCount > 0;

      setRiskStatus({
        magnitude: mag.toFixed(2),
        isHighRisk: hasImpact && isWalking // AQUI OS DOIS SÃO EXIGIDOS
      });
    });

    // 2. Iniciar Localização
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permissão de GPS negada!');
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
    })();

    return () => {
      subscription.remove();
      stepSub.remove();
    };
  }, [stepCount]); // Reavaliar risco quando o número de passos mudar;

  return { data, location, riskStatus, errorMsg, stepCount };
};