import { useEffect } from 'react';
import RootNavigator from './src/navigation/RootNavigator';
import { bootstrapCheckin, evaluateCheckinTimeout, registerCheckinListeners } from './src/services/checkinService';

export default function App() {
  useEffect(() => {
    let unsubscribe: () => void = () => {};

    (async () => {
      unsubscribe = await registerCheckinListeners();
      await bootstrapCheckin();
      await evaluateCheckinTimeout();
    })();

    return () => {
      unsubscribe();
    };
  }, []);

  return <RootNavigator />;
}
