import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import RestaurantPos from '../restaurant/RestaurantPos';
import { EmptyState } from '../../components/ui';

export default function EmployeeRestaurant() {
  const { session } = useEmployeeAuth();
  if (!session) return null;
  if (session.permissions?.can_waiter === false)
    return <EmptyState message="ليست لديك صلاحية الطاولات. تواصل مع المدير." />;
  return <RestaurantPos token={session.token} />;
}
