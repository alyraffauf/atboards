import { useLoaderData } from "react-router-dom";
import Dashboard, { type DashboardData } from "./Dashboard";
import LoggedOutHome from "./LoggedOutHome";

interface HomeLoaderData {
  user: DashboardData["user"] | null;
}

export default function Home() {
  const data = useLoaderData() as HomeLoaderData;

  if (data.user) return <Dashboard {...(data as DashboardData)} />;

  return <LoggedOutHome />;
}
