/**
 * Tests for useTestExecution hook reducer logic
 *
 * We test the reducer indirectly through the hook using renderHook.
 * The hook wraps a useReducer with runReducer, so dispatching actions
 * lets us verify all state transitions.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useTestExecution from '../../hooks/useTestExecution';
import type { RunState, WsMessage } from '../../types';

const EMPTY_WS: WsMessage[] = [];

function getInitialState(): RunState {
  return {
    runState: null,
    progress: { phase: '', current: 0, total: 0, duration: null },
    liveData: [],
    result: null,
    results: null,
    comparison: null,
    errorMsg: '',
  };
}

describe('useTestExecution', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useTestExecution(EMPTY_WS));
    expect(result.current.run).toEqual(getInitialState());
    expect(result.current.currentTestId).toBeNull();
  });

  it('"start" action sets runState to running', () => {
    const { result } = renderHook(() => useTestExecution(EMPTY_WS));

    act(() => {
      result.current.dispatch({
        type: 'start',
        progress: { phase: 'warmup', current: 0, total: 100, duration: null },
      });
    });

    expect(result.current.run.runState).toBe('running');
    expect(result.current.run.progress.phase).toBe('warmup');
    expect(result.current.run.progress.total).toBe(100);
  });

  it('"progress" action updates progress and liveData', () => {
    const { result } = renderHook(() => useTestExecution(EMPTY_WS));

    act(() => {
      result.current.dispatch({
        type: 'start',
        progress: { phase: 'testing', current: 0, total: 10, duration: null },
      });
    });

    act(() => {
      result.current.dispatch({
        type: 'progress',
        data: { phase: 'testing', current: 1, total: 10, duration: 5.2 },
      });
    });

    expect(result.current.run.progress.current).toBe(1);
    expect(result.current.run.progress.duration).toBe(5.2);
    expect(result.current.run.liveData).toHaveLength(1);
    expect(result.current.run.liveData[0]).toEqual({ t: 0, duration: 5.2 });
  });

  it('"complete" action with single test result', () => {
    const { result } = renderHook(() => useTestExecution(EMPTY_WS));

    act(() => {
      result.current.dispatch({
        type: 'start',
        progress: { phase: 'testing', current: 0, total: 10, duration: null },
      });
    });

    const singleResult = {
      statistics: { basic: { mean: 12.5, median: 11.0 } },
    };

    act(() => {
      result.current.dispatch({
        type: 'complete',
        data: { result: singleResult },
      });
    });

    expect(result.current.run.runState).toBe('complete');
    expect(result.current.run.result).toEqual(singleResult);
    expect(result.current.run.results).toBeNull();
    expect(result.current.run.comparison).toBeNull();
  });

  it('"complete" action with parallel results', () => {
    const { result } = renderHook(() => useTestExecution(EMPTY_WS));

    act(() => {
      result.current.dispatch({
        type: 'start',
        progress: { phase: 'testing', current: 0, total: 10, duration: null },
      });
    });

    const parallelResults = {
      'round-robin': {
        metrics: { queries: { total: 100, successRate: '100%' } },
      },
    };

    act(() => {
      result.current.dispatch({
        type: 'complete',
        data: { results: parallelResults },
      });
    });

    expect(result.current.run.runState).toBe('complete');
    expect(result.current.run.results).toEqual(parallelResults);
    expect(result.current.run.result).toBeNull();
  });

  it('"complete" action with comparison results', () => {
    const { result } = renderHook(() => useTestExecution(EMPTY_WS));

    act(() => {
      result.current.dispatch({
        type: 'start',
        progress: { phase: 'testing', current: 0, total: 10, duration: null },
      });
    });

    const comparison = {
      resultA: { statistics: { basic: { mean: 10 } } },
      resultB: { statistics: { basic: { mean: 15 } } },
      delta: null,
      executionMode: 'sequential' as const,
      testNameA: 'Query A',
      testNameB: 'Query B',
    };

    act(() => {
      result.current.dispatch({
        type: 'complete',
        data: { comparison },
      });
    });

    expect(result.current.run.runState).toBe('complete');
    expect(result.current.run.comparison).toEqual(comparison);
    expect(result.current.run.result).toBeNull();
    expect(result.current.run.results).toBeNull();
  });

  it('"error" action sets errorMsg', () => {
    const { result } = renderHook(() => useTestExecution(EMPTY_WS));

    act(() => {
      result.current.dispatch({
        type: 'start',
        progress: { phase: 'testing', current: 0, total: 10, duration: null },
      });
    });

    act(() => {
      result.current.dispatch({
        type: 'error',
        data: { message: 'Connection refused' },
      });
    });

    expect(result.current.run.runState).toBe('error');
    expect(result.current.run.errorMsg).toBe('Connection refused');
  });

  it('liveData is capped at 61 items (keeps last 60 + adds 1)', () => {
    const { result } = renderHook(() => useTestExecution(EMPTY_WS));

    act(() => {
      result.current.dispatch({
        type: 'start',
        progress: { phase: 'testing', current: 0, total: 200, duration: null },
      });
    });

    // Dispatch 70 progress updates
    for (let i = 0; i < 70; i++) {
      act(() => {
        result.current.dispatch({
          type: 'progress',
          data: { phase: 'testing', current: i, total: 200, duration: i * 1.0 },
        });
      });
    }

    // The slice(-60) keeps the last 60 items from previous state,
    // then adds 1 new item, so max length is 61
    expect(result.current.run.liveData.length).toBeLessThanOrEqual(61);
    expect(result.current.run.liveData.length).toBeGreaterThan(0);
  });

  it('"start" resets state to initial values', () => {
    const { result } = renderHook(() => useTestExecution(EMPTY_WS));

    // First run an error
    act(() => {
      result.current.dispatch({
        type: 'error',
        data: { message: 'Some error' },
      });
    });

    // Then start a new run
    act(() => {
      result.current.dispatch({
        type: 'start',
        progress: { phase: 'warmup', current: 0, total: 50, duration: null },
      });
    });

    expect(result.current.run.runState).toBe('running');
    expect(result.current.run.errorMsg).toBe('');
    expect(result.current.run.result).toBeNull();
    expect(result.current.run.liveData).toEqual([]);
  });
});
