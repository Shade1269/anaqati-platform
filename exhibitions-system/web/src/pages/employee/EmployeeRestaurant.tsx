import { useEmployeeAuth } from '../../context/EmployeeAuthContext';
import RestaurantPos from '../restaurant/RestaurantPos';

export default function EmployeeRestaurant() {
  const { session } = useEmployeeAuth();
  if (!session) return null;
  return <RestaurantPos token={session.token} />;
}
