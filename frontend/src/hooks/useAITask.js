import { useState, useRef, useCallback, useEffect } from 'react';
import { enqueueTask, getTaskStatus } from '../api/ai';

// Single home for AI polling logic: enqueue, then poll every 2s, stop at 60
// polls (2 minutes) with a timeout error. Never inline polling in a component.
export function useAITask() {
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTask = useCallback(
    async (type, payload) => {
      stop();
      setStatus('loading');
      setResult(null);
      setError(null);

      const { jobId } = await enqueueTask(type, payload);
      let polls = 0;

      intervalRef.current = setInterval(async () => {
        if (++polls > 60) {
          stop();
          setStatus('error');
          setError('Request timed out. Please try again.');
          return;
        }
        const data = await getTaskStatus(jobId);
        if (data.status === 'completed') {
          stop();
          setResult(data.result);
          setStatus('success');
        }
        if (data.status === 'failed') {
          stop();
          setStatus('error');
          setError('Generation failed.');
        }
      }, 2000);
    },
    [stop]
  );

  const reset = useCallback(() => {
    stop();
    setStatus('idle');
    setResult(null);
    setError(null);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { startTask, reset, status, result, error, isLoading: status === 'loading' };
}
