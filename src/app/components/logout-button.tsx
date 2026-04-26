"use client";

import { useRouter } from "next/navigation";
import { logout } from "../dashboard/actions";

export function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <button 
      onClick={handleLogout}
      style={{ 
        background: 'none', 
        border: 'none', 
        color: 'var(--text-secondary)', 
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '1rem'
      }}
    >
      Logout
    </button>
  );
}
