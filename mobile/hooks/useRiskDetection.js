import { useState, useEffect } from 'react';
import { Accelerometer, Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';
import crimeData from '../data/crimes_mock.json';

export const useRiskDetection = () => {
  const [data, setData] = useState({ x: 0, y: 0, z: 0 });
  const [stepCount, setStepCount] = useState(0);
  const [location, setLocation] = useState(null);
  const [riskStatus, setRiskStatus] = useState({ isHighRisk: false, magnitude: 0 });
  const [errorMsg, setErrorMsg] = useState(null);
  const [nearbyCrimes, setNearbyCrimes] = useState(0);

  const RISK_THRESHOLD = 1.8;

  const checkCrimeRisk = (userLat, userLon) => {
    const range = 0.005; 
    const count = crimeData.filter(crime => {
      return Math.abs(crime.lat - userLat) < range && 
             Math.abs(crime.lon - userLon) < range;
    }).length;
    setNearbyCrimes(count);
  };

useEffect(() => {
    let stepSub; // 1. Criamos a variável aqui fora para o "return" conseguir ler
    let subscription;

    // Função para iniciar os sensores de passos
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

    // Iniciar Sensores e Localização
    startPedometer();

    Accelerometer.setUpdateInterval(100);
    subscription = Accelerometer.addListener(accData => {
      setData(accData);
      const { x, y, z } = accData;
      const mag = Math.sqrt(x**2 + y**2 + z**2);
      
      setRiskStatus({
        magnitude: mag.toFixed(2),
        // Lógica: Impacto E passos > 0 (ou >= 0 para facilitar teste)
        isHighRisk: mag > RISK_THRESHOLD && stepCount >= 0 
      });
    });

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
        checkCrimeRisk(loc.coords.latitude, loc.coords.longitude);
      }
    })();

    // LIMPEZA CORRETA
    return () => {
      if (subscription) subscription.remove();
      if (stepSub) stepSub.remove(); // Agora o 'stepSub' existe aqui!
    };
  }, [stepCount]);

  return { data, location, riskStatus, errorMsg, stepCount, nearbyCrimes };
};