/**
 * Shared hook for test execution state management
 *
 * Encapsulates useReducer for test run state and
 * WebSocket message filtering logic used by both
 * SingleTest and ParallelTest pages.
 */
import { useReducer, useEffect, useState } from 'react';
import type { RunState, RunAction, WsMessage, ComparisonResult } from '../types';

const INIT_RUN: RunState = {
  runState: null,
  progress: { phase: '', current: 0, total: 0, duration: null },
  liveData: [],
  result: null,
  results: null,
  comparison: null,
  errorMsg: '',
};

function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'start':
      return { ...INIT_RUN, runState: 'running', progress: action.progress };
    case 'progress':
      return {
        ...state,
        progress: action.data,
        liveData: [...state.liveData.slice(-60), { t: state.liveData.length, duration: action.data.duration }],
      };
    case 'complete':
      return {
        ...state,
        runState: 'complete',
        result: action.data.result || null,
        results: action.data.results || null,
        comparison: action.data.comparison || null,
      };
    case 'error':
      return { ...state, runState: 'error', errorMsg: action.data.message };
    default:
      return state;
  }
}

export default function useTestExecution(wsMessages: WsMessage[]): {
  run: RunState;
  dispatch: React.Dispatch<RunAction>;
  currentTestId: string | null;
  setCurrentTestId: React.Dispatch<React.SetStateAction<string | null>>;
} {
  const [run, dispatch] = useReducer(runReducer, INIT_RUN);
  const [currentTestId, setCurrentTestId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTestId || !wsMessages.length) return;
    const relevant = wsMessages.filter(m => m.testId === currentTestId);
    if (!relevant.length) return;
    const last = relevant[relevant.length - 1];
    if (last.type === 'complete' && last.data && 'resultA' in (last.data as unknown as Record<string, unknown>)) {
      // Comparison test complete — transform to RunAction with comparison field
      const d = last.data as unknown as Record<string, unknown>;
      const comparison: ComparisonResult = {
        resultA: { statistics: (d.resultA as Record<string, unknown>)?.statistics, explainAnalyze: (d.resultA as Record<string, unknown>)?.explainAnalyze } as ComparisonResult['resultA'],
        resultB: { statistics: (d.resultB as Record<string, unknown>)?.statistics, explainAnalyze: (d.resultB as Record<string, unknown>)?.explainAnalyze } as ComparisonResult['resultB'],
        delta: d.delta as ComparisonResult['delta'],
        executionMode: d.executionMode as ComparisonResult['executionMode'],
        testNameA: (d.testNameA as string) || 'Query A',
        testNameB: (d.testNameB as string) || 'Query B',
      };
      dispatch({ type: 'complete', data: { comparison } });
    } else if (['progress', 'complete', 'error'].includes(last.type)) {
      dispatch(last as RunAction);
    }
  }, [wsMessages, currentTestId]);

  return { run, dispatch, currentTestId, setCurrentTestId };
}
