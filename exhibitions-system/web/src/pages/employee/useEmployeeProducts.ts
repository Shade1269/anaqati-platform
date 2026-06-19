import { useEffect, useState } from 'react';
import { employeeApi } from '../../lib/api';
import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import type { ProductForEmployee } from '../../lib/types';

export function useEmployeeProducts() {
  const { session } = useEmployeeAuth();
  const [products, setProducts] = useState<ProductForEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    employeeApi
      .listProducts(session.token)
      .then(setProducts)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [session]);

  return { products, loading, error };
}
