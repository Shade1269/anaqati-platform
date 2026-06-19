import { useEffect, useState } from 'react';
import { getStoredBranchId } from './useBranchSelection';

/** Reactively read the employee's currently-selected branch id. */
export function useCurrentBranch(): string | null {
  const [branchId, setBranchId] = useState<string | null>(getStoredBranchId());

  useEffect(() => {
    const handler = () => setBranchId(getStoredBranchId());
    window.addEventListener('branch-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('branch-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  return branchId;
}
