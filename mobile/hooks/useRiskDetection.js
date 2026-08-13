import { useState, useEffect } from 'react';
import { Accelerometer, Pedometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { calculateSecurityScore } from '../utils/scoreCalculator'; // Importação do util
import crimeData from '../data/crimes_mock.json';

export const useRiskDetection = ({ insideSafeZone = false, activityMode = false } = {}) => {
  const [data, setData] = useState({ x: 0, y: 0, z: 0 });
  const [stepCount, setStepCount] = useState(0);
  const [location, setLocation] = useState(null);
  const [riskStatus, setRiskStatus] = useState({ isHighRisk: false, magnitude: 0 });
  const [errorMsg, setErrorMsg] = useState(null);
  const [nearbyCrimes, setNearbyCrimes] = useState(0);
  
  // NOVOS ESTADOS PARA O GRÁFICO
  const [currentScore, setCurrentScore] = useState(100);
  const [statusColor, setStatusColor] = useState('#4CAF50');

  const RISK_THRESHOLD = 2.8;

  const checkCrimeRisk = (userLat, userLon) => {
    const range = 0.005; 
    const count = crimeData.filter(crime => {
      return Math.abs(crime.lat - userLat) < range && 
             Math.abs(crime.lon - userLon) < range;
    }).length;
    setNearbyCrimes(count);
  };

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
      
      // CALCULA O SCORE EM TEMPO REAL BASEADO NOS SENSORES E NA CONTAGEM DE CRIMES
      const result = calculateSecurityScore({
        magnitudeG: mag,
        isNearCrimeZone: nearbyCrimes > 0,
        currentHour: new Date().getHours(),
        bpmPanico: false,
        isInSafeZone: insideSafeZone,
        isActivityModeOn: activityMode
      });

      setCurrentScore(result.score);
      setStatusColor(result.color);

      setRiskStatus({
        magnitude: mag.toFixed(2),
        isHighRisk: mag > RISK_THRESHOLD && stepCount >= 0 
      });
    });

    return () => {
      if (subscription) subscription.remove();
      if (stepSub) stepSub.remove();
    };
  }, [stepCount, nearbyCrimes, insideSafeZone, activityMode]); // zona segura/atividade recalculam o score salvo no histórico

  // Efeito separado: rastreamento de localização com throttle (50m OU 5min).
  // Fica fora do efeito acima porque aquele reinicia a cada passo do pedômetro —
  // juntos, o GPS seria re-inscrito a cada passo e o throttle nunca funcionaria.
  useEffect(() => {
    let locationSub;
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
        checkCrimeRisk(loc.coords.latitude, loc.coords.longitude);

        locationSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 5 * 60 * 1000 },
          (newLoc) => {
            setLocation(newLoc);
            checkCrimeRisk(newLoc.coords.latitude, newLoc.coords.longitude);
          }
        );
      }
    })();

    return () => {
      if (locationSub) locationSub.remove();
    };
  }, []);

  // RETORNA TAMBÉM O SCORE E A COR PARA O DASHBOARD
  return { 
    data, 
    location, 
    riskStatus, 
    errorMsg, 
    stepCount, 
    nearbyCrimes, 
    currentScore, 
    statusColor 
  };
};