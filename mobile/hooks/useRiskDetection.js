// src/hooks/useRiskDetection.js
import { useState, useEffect } from 'react';
import { Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';

export const useRiskDetection = () => {
  const [data, setData] = useState({ x: 0, y: 0, z: 0 });
  const [location, setLocation] = useState(null);
  const [riskStatus, setRiskStatus] = useState({ isHighRisk: false, magnitude: 0 });
  const [errorMsg, setErrorMsg] = useState(null);

  // Constante de Limiar de Risco (G-Force)
  const RISK_THRESHOLD = 1.8;

  useEffect(() => {
    // 1. Iniciar Sensores
    Accelerometer.setUpdateInterval(100);
    const subscription = Accelerometer.addListener(accelerometerData => {
      setData(accelerometerData);
      
      // Cálculo de Magnitude G (Pitágoras 3D)
      const { x, y, z } = accelerometerData;
      const mag = Math.sqrt(x**2 + y**2 + z**2);
      
      setRiskStatus({
        magnitude: mag.toFixed(2),
        isHighRisk: mag > RISK_THRESHOLD
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

    return () => subscription.remove();
  }, []);

  return { data, location, riskStatus, errorMsg };
};