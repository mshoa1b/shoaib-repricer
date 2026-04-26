"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const handleLogout = () => {
    document.cookie = "auth=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT";
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
