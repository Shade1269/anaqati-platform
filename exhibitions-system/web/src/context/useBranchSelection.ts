import { useState } from 'react';

const KEY = 'employee_branch_id';

export function useBranchSelection() {
  const [branchId, setBranchIdState] = useState<string | null>(
    localStorage.getItem(KEY)
  );

  function setBranchId(id: string | null) {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
    setBranchIdState(id);
  }

  return { branchId, setBranchId };
}

export function getStoredBranchId(): string | null {
  return localStorage.getItem(KEY);
}
