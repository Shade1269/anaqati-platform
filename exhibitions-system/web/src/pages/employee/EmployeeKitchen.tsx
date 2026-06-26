import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import RestaurantKds from '../restaurant/RestaurantKds';
import { EmptyState } from '../../components/ui';

export default function EmployeeKitchen() {
  const { session } = useEmployeeAuth();
  if (!session) return null;
  if (session.permissions?.can_kitchen === false)
    return <EmptyState message="ليست لديك صلاحية المطبخ. تواصل مع المدير." />;
  return <RestaurantKds token={session.token} />;
}
