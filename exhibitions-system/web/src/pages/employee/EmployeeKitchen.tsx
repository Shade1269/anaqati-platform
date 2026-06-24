import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import RestaurantKds from '../restaurant/RestaurantKds';

export default function EmployeeKitchen() {
  const { session } = useEmployeeAuth();
  if (!session) return null;
  return <RestaurantKds token={session.token} />;
}
