import { useEffect, useEffectEvent } from 'react';
import { startBenchDriver } from './driver';
import type { BenchAppApi } from './types';

/**
 * Mounted by App only in LUT_BENCH builds. It hands the live tab actions to the scenario driver
 * (which runs once, after the first render) and renders nothing.
 */
export default function BenchBridge(props: BenchAppApi) {
  const currentApi = useEffectEvent(() => props);
  useEffect(() => {
    void startBenchDriver(() => currentApi());
  }, []);
  return null;
}
